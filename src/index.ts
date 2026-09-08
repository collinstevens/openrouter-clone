import { serve } from "@hono/node-server";
import { z } from "zod";

import { createApp } from "./app.js";

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

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(JSON.stringify({ event: "shutdown" }));

  const deadline = setTimeout(() => {
    console.error("Shutdown exceeded five seconds.");
    process.exit(1);
  }, 5000);
  deadline.unref();

  server.close((error) => {
    clearTimeout(deadline);
    if (error) {
      console.error("Server shutdown failed:", error.message);
      process.exitCode = 1;
    }
  });
}

server.on("error", (error) => {
  ready = false;
  console.error("Server failed:", error.message);
  process.exitCode = 1;
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
