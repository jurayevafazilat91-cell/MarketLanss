import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { buildChatRequest, chatRequestSchema, geminiConfigured, geminiErrorCode, readJsonBody, streamChatEvents } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonResponse(data, status) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

// Streams newline-delimited JSON events ({type: "text" | "done" | "error"}) as Gemini writes the answer.
export async function POST(request) {
  const body = await readJsonBody(request, 200000);
  if (body.error) return jsonResponse({ error: body.error }, body.status);
  if (!geminiConfigured()) return jsonResponse({ error: "not_configured" }, 503);

  const parsed = chatRequestSchema.safeParse(body.data);
  if (!parsed.success) return jsonResponse({ error: "invalid_request" }, 400);

  // Closing the tab or the browser cancelling the stream stops the Gemini request too.
  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal]);
  const encoder = new TextEncoder();
  let events;

  return new Response(new ReadableStream({
    async pull(controller) {
      if (!events) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          events = streamChatEvents(await ai.interactions.create(buildChatRequest(parsed.data), { fetchOptions: { signal } }));
        } catch (error) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", code: geminiErrorCode(error) })}\n`));
          controller.close();
          return;
        }
      }
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    cancel() {
      cancel.abort();
    },
  }), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
