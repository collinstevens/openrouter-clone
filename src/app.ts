import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";

import { httpTelemetry } from "./http-telemetry.js";

export function createApp(isReady: () => boolean) {
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.use(httpTelemetry);

  app.use("/healthz/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/healthz/live", (context) => context.json({ status: "alive" }));
  app.get("/healthz/ready", (context) =>
    isReady() ? context.json({ status: "ready" }) : context.json({ status: "not_ready" }, 503),
  );

  return app;
}
