import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildChatParams, chatRequestSchema, claudeConfigured, readJsonBody, streamChatEvents } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonResponse(data, status) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

// Streams newline-delimited JSON events ({type: "text" | "done" | "error"}) as Claude writes the answer.
export async function POST(request) {
  const body = await readJsonBody(request, 200000);
  if (body.error) return jsonResponse({ error: body.error }, body.status);
  if (!claudeConfigured()) return jsonResponse({ error: "not_configured" }, 503);

  const parsed = chatRequestSchema.safeParse(body.data);
  if (!parsed.success) return jsonResponse({ error: "invalid_request" }, 400);

  // Closing the tab aborts the Claude request too, so an abandoned answer stops costing tokens.
  const stream = new Anthropic().beta.messages.stream(buildChatParams(parsed.data), { signal: request.signal });
  const events = streamChatEvents(stream);
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    cancel() {
      stream.abort();
    },
  }), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
