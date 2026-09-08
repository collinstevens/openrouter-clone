import type { HttpBindings } from "@hono/node-server";
import {
  context,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { Attributes } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

import { telemetryEnabled } from "./telemetry.js";

const tracer = trace.getTracer("openrouter-clone.http");
const meter = metrics.getMeter("openrouter-clone.http");
const requests = meter.createCounter("http.server.request.count", {
  description: "Completed HTTP server requests, including disconnected responses.",
  unit: "{request}",
});
const duration = meter.createHistogram("http.server.request.duration", {
  description: "HTTP server request duration through response completion or disconnect.",
  unit: "s",
  advice: {
    explicitBucketBoundaries: [
      0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
    ],
  },
});
const methods = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
  "QUERY",
]);

export const httpTelemetry = createMiddleware<{ Bindings: HttpBindings }>(async (c, next) => {
  if (!telemetryEnabled) return next();
  if (c.req.path === "/healthz/live" || c.req.path === "/healthz/ready") {
    return context.with(suppressTracing(ROOT_CONTEXT), next);
  }

  const method = methods.has(c.req.method) ? c.req.method : "_OTHER";
  const name = method === "_OTHER" ? "HTTP" : method;
  const attributes: Attributes = {
    "http.request.method": method,
    "url.scheme": new URL(c.req.url).protocol.slice(0, -1),
  };
  const parent = propagation.extract(ROOT_CONTEXT, {
    traceparent: c.req.header("traceparent"),
    tracestate: c.req.header("tracestate"),
  });
  const span = tracer.startSpan(name, { kind: SpanKind.SERVER, attributes }, parent);
  const active = trace.setSpan(parent, span);
  const started = performance.now();
  const response = c.env.outgoing;
  const finish = () => {
    response.off("finish", finish);
    response.off("close", finish);
    const route = routePath(c);
    if (route && route !== "/*" && route !== "*") {
      attributes["http.route"] = route;
      span.updateName(`${name} ${route}`);
    }
    if (response.headersSent) attributes["http.response.status_code"] = response.statusCode;
    if (!response.writableFinished || response.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute(
        "error.type",
        response.writableFinished ? String(response.statusCode) : "connection_closed",
      );
    }
    span.setAttributes(attributes);
    context.with(active, () => {
      requests.add(1, attributes);
      duration.record((performance.now() - started) / 1000, attributes);
    });
    span.end();
  };
  response.once("finish", finish);
  response.once("close", finish);
  await context.with(active, next);
});
