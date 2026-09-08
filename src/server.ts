import { Server } from "node:http";
import type { ServerResponse } from "node:http";

import { serve } from "@hono/node-server";
import { z } from "zod";

import { createApp } from "./app.js";
import { shutdownTelemetry } from "./telemetry.js";

const config = z
  .object({
    HOST: z.string().trim().min(1).default("127.0.0.1"),
    PORT: z
      .string()
      .regex(/^\d+$/)
      .default("3000")
      .transform(Number)
      .pipe(z.number().int().min(0).max(65535)),
  })
  .safeParse(process.env);

if (!config.success) {
  console.error("Invalid server configuration:", z.flattenError(config.error).fieldErrors);
  process.exit(1);
}

let ready = false;
let shuttingDown = false;
const app = createApp(() => ready);
const server = serve(
  { fetch: app.fetch, hostname: config.data.HOST, port: config.data.PORT },
  (address) => {
    ready = !shuttingDown;
    console.log(JSON.stringify({ event: "listening", host: address.address, port: address.port }));
  },
);
const activeResponses = new Set<ServerResponse>();

server.on("request", (_request, response: ServerResponse) => {
  activeResponses.add(response);
  response.once("close", () => activeResponses.delete(response));
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(JSON.stringify({ event: "shutdown" }));

  const drainDeadline = setTimeout(() => {
    console.error("Request draining exceeded five seconds.");
    process.exitCode = 1;
    if (server instanceof Server) server.closeAllConnections();
  }, 5000);

  server.close((error) => {
    clearTimeout(drainDeadline);
    if (error) {
      console.error("Server shutdown failed:", error.message);
      process.exitCode = 1;
    }
    const flushDeadline = setTimeout(() => {
      console.error("Telemetry shutdown exceeded three seconds.");
      process.exit(process.exitCode || 0);
    }, 3000);
    const responsesClosed = [...activeResponses].map(
      (response) => new Promise<void>((resolve) => response.once("close", () => resolve())),
    );
    void Promise.all(responsesClosed)
      .then(shutdownTelemetry)
      .then(
        () => {
          clearTimeout(flushDeadline);
          process.exit(process.exitCode || 0);
        },
        () => {
          console.error("Telemetry shutdown could not export all data.");
        },
      );
  });
}

server.on("error", (error) => {
  ready = false;
  console.error("Server failed:", error.message);
  process.exitCode = 1;
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
