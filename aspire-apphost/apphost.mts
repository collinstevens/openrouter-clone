import { createBuilder, OtlpProtocol } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

await builder
  .addJavaScriptApp("openrouter-clone", "..")
  .withBun({ installArgs: ["--frozen-lockfile"] })
  .withHttpEndpoint({ env: "PORT" })
  .withHttpHealthCheck({ path: "/healthz/ready" })
  .withEnvironment("HOST", "127.0.0.1")
  .withEnvironment("OTEL_SDK_DISABLED", "false")
  .withEnvironment("OTEL_EXPORTER_OTLP_TIMEOUT", "3000")
  .withEnvironment("OTEL_METRIC_EXPORT_INTERVAL", "5000")
  .withEnvironment("OTEL_METRIC_EXPORT_TIMEOUT", "3000")
  .withOtlpExporter({ protocol: OtlpProtocol.HttpJson });

await builder.build().run();
