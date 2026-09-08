import { context } from "@opentelemetry/api";
import { isTracingSuppressed, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { defaultResource, envDetector, resourceFromAttributes } from "@opentelemetry/resources";
import {
  createAllowListAttributesProcessor,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { z } from "zod";

export const telemetryEnabled = process.env.OTEL_SDK_DISABLED?.toLowerCase() === "false";

function startTelemetry() {
  if (!telemetryEnabled) return;

  const config = z
    .object({
      OTEL_TRACES_EXPORTER: z.enum(["otlp", "none"]).default("otlp"),
      OTEL_METRICS_EXPORTER: z.enum(["otlp", "none"]).default("otlp"),
      OTEL_EXPORTER_OTLP_PROTOCOL: z.literal("http/json").optional(),
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: z.literal("http/json").optional(),
      OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: z.literal("http/json").optional(),
      OTEL_METRIC_EXPORT_INTERVAL: z.coerce.number().int().positive().default(60000),
      OTEL_METRIC_EXPORT_TIMEOUT: z.coerce.number().int().positive().default(3000),
    })
    .parse(process.env);

  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({ "service.name": "openrouter-clone" }),
    ),
    resourceDetectors: [envDetector],
    textMapPropagator: new W3CTraceContextPropagator(),
    logRecordProcessors: [],
    traceExporter: config.OTEL_TRACES_EXPORTER === "otlp" ? new OTLPTraceExporter() : undefined,
    spanProcessors: config.OTEL_TRACES_EXPORTER === "none" ? [] : undefined,
    metricReaders:
      config.OTEL_METRICS_EXPORTER === "none"
        ? []
        : [
            new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter(),
              exportIntervalMillis: config.OTEL_METRIC_EXPORT_INTERVAL,
              exportTimeoutMillis: Math.min(
                config.OTEL_METRIC_EXPORT_TIMEOUT,
                config.OTEL_METRIC_EXPORT_INTERVAL,
              ),
            }),
          ],
    views: [
      {
        instrumentName: "http.*",
        aggregationCardinalityLimit: 1000,
        attributesProcessors: [
          createAllowListAttributesProcessor([
            "http.request.method",
            "http.response.status_code",
            "http.route",
            "url.scheme",
          ]),
        ],
      },
    ],
    instrumentations: [
      new UndiciInstrumentation({
        ignoreRequestHook: () => isTracingSuppressed(context.active()),
        startSpanHook: (request) => ({
          "url.full": new URL(request.origin).origin,
          "url.path": undefined,
          "url.query": undefined,
          "user_agent.original": undefined,
          "http.request.method_original": undefined,
        }),
        requestHook: (span) => {
          span.recordException = () => {};
          const setStatus = span.setStatus.bind(span);
          span.setStatus = ({ code }) => setStatus({ code });
        },
      }),
    ],
  });
  sdk.start();
  return sdk;
}

const sdk = startTelemetry();

export async function shutdownTelemetry() {
  await sdk?.shutdown();
}
