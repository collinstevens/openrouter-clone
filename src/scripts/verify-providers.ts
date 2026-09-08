import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

async function verifyOpenAI(apiKey: string) {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.openai.com/v1",
    maxRetries: 0,
    timeout: 15_000,
    logLevel: "off",
  });
  const response = await client.chat.completions.create({
    model: "gpt-5-nano-2025-08-07",
    messages: [{ role: "user", content: "Reply with OK." }],
    reasoning_effort: "minimal",
    max_completion_tokens: 128,
    store: false,
  });
  return {
    model: response.model,
    text: response.choices[0]?.message.content ?? "",
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    requestId: response._request_id,
  };
}

async function verifyAnthropic(apiKey: string) {
  const client = new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
    maxRetries: 0,
    timeout: 15_000,
    logLevel: "off",
  });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    messages: [{ role: "user", content: "Reply with OK." }],
    max_tokens: 16,
  });
  return {
    model: response.model,
    text: response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(""),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    requestId: response._request_id,
  };
}

const selection = z.enum(["all", "openai", "anthropic"]).safeParse(process.argv[2] ?? "all");
if (!selection.success) {
  console.error("Choose all, openai, or anthropic.");
  process.exit(1);
}

const providers = [
  { name: "openai", keyName: "OPENAI_API_KEY", verify: verifyOpenAI },
  { name: "anthropic", keyName: "ANTHROPIC_API_KEY", verify: verifyAnthropic },
];

for (const provider of providers) {
  if (selection.data !== "all" && selection.data !== provider.name) continue;
  const apiKey = z.string().trim().min(1).safeParse(process.env[provider.keyName]);
  if (!apiKey.success) {
    console.error(
      JSON.stringify({
        provider: provider.name,
        status: "failed",
        reason: `Missing ${provider.keyName}`,
      }),
    );
    process.exitCode = 1;
    continue;
  }

  try {
    const result = await provider.verify(apiKey.data);
    const passed = result.text.trim().length > 0;
    console.log(
      JSON.stringify({
        provider: provider.name,
        status: passed ? "passed" : "empty_response",
        ...result,
      }),
    );
    if (!passed) process.exitCode = 1;
  } catch (error) {
    if (error instanceof OpenAI.APIError || error instanceof Anthropic.APIError) {
      console.error(
        JSON.stringify({
          provider: provider.name,
          status: "failed",
          error: error.name,
          httpStatus: error.status,
          requestId: error.requestID,
        }),
      );
    } else {
      console.error(
        JSON.stringify({ provider: provider.name, status: "failed", error: "Unexpected failure" }),
      );
    }
    process.exitCode = 1;
  }
}
