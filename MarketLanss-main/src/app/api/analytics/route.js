import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  buildInventoryAnalysisParams,
  claudeConfigured,
  claudeErrorCode,
  inventoryAnalysisRequestSchema,
  inventoryAnalysisResponseSchema,
  readJsonBody,
} from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 300;

const failureMessages = {
  auth: "Claude rejected the API key. Check ANTHROPIC_API_KEY.",
  rate_limit: "Claude is busy right now. Please try again in a minute.",
  connection: "Could not connect to Claude. Check your internet connection and try again.",
  unavailable: "Claude could not complete the analysis. Please try again.",
  unknown: "Claude returned an unreadable analysis. Please try again.",
};

function jsonResponse(data, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return jsonResponse({ configured: claudeConfigured() });
}

export async function POST(request) {
  const body = await readJsonBody(request, 256000);
  if (body.error) return jsonResponse({ error: body.error }, body.status);
  if (!claudeConfigured()) {
    return jsonResponse({ error: "Claude is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the app." }, 503);
  }

  const parsed = inventoryAnalysisRequestSchema.safeParse(body.data);
  if (!parsed.success) return jsonResponse({ error: "The inventory data is invalid or exceeds the supported limits." }, 400);

  let response;
  try {
    response = await new Anthropic().beta.messages.parse(buildInventoryAnalysisParams({
      ...parsed.data,
      currentMonth: new Date().toISOString().slice(0, 7),
    }));
  } catch (error) {
    return jsonResponse({ error: failureMessages[claudeErrorCode(error)] }, 502);
  }

  if (response.stop_reason === "refusal") return jsonResponse({ error: "Claude declined to analyse this data." }, 422);
  const result = inventoryAnalysisResponseSchema.safeParse(response.parsed_output);
  if (!result.success) return jsonResponse({ error: "Claude returned an incomplete analysis. Please try again." }, 502);
  return jsonResponse(result.data);
}
