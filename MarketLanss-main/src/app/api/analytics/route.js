import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  buildInventoryAnalysisRequest,
  geminiConfigured,
  geminiErrorCode,
  inventoryAnalysisRequestSchema,
  readAnalysis,
  readJsonBody,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

const failureMessages = {
  auth: "Gemini rejected the API key. Check GEMINI_API_KEY.",
  rate_limit: "The free Gemini limit is used up for now. Try again later.",
  connection: "Could not connect to Gemini. Check your internet connection and try again.",
  unavailable: "Gemini could not complete the analysis. Please try again.",
  refusal: "Gemini did not return an analysis for this data. Please try again.",
  invalid: "Gemini returned an incomplete analysis. Please try again.",
  unknown: "Gemini returned an unreadable analysis. Please try again.",
};

function jsonResponse(data, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return jsonResponse({ configured: geminiConfigured() });
}

export async function POST(request) {
  const body = await readJsonBody(request, 256000);
  if (body.error) return jsonResponse({ error: body.error }, body.status);
  if (!geminiConfigured()) {
    return jsonResponse({ error: "Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the app." }, 503);
  }

  const parsed = inventoryAnalysisRequestSchema.safeParse(body.data);
  if (!parsed.success) return jsonResponse({ error: "The inventory data is invalid or exceeds the supported limits." }, 400);

  let interaction;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    interaction = await ai.interactions.create(
      buildInventoryAnalysisRequest({ ...parsed.data, currentMonth: new Date().toISOString().slice(0, 7) }),
      { fetchOptions: { signal: request.signal } },
    );
  } catch (error) {
    const code = geminiErrorCode(error);
    return jsonResponse({ error: failureMessages[code] }, code === "rate_limit" ? 429 : 502);
  }

  const result = readAnalysis(interaction);
  if (result.error) return jsonResponse({ error: failureMessages[result.error] }, 502);
  return jsonResponse(result.data);
}
