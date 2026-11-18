// Browser-side helpers for the /api/chat stream. Kept free of the Anthropic SDK so it never lands in the client bundle.

// Splits newline-delimited JSON; the last, possibly partial, line is kept for the next chunk.
export function readNdjson(buffer, chunk) {
  const lines = (buffer + chunk).split("\n");
  const rest = lines.pop();
  return { events: lines.filter(Boolean).map((line) => JSON.parse(line)), rest };
}

// Applies one stream event to the assistant message being written.
export function applyChatEvent(message, event) {
  if (event.type === "text") return { ...message, content: message.content + event.text };
  if (event.type === "done") return { ...message, status: "done", truncated: Boolean(event.truncated) };
  if (event.type === "error") return { role: "assistant", content: "", status: "error", errorCode: event.code };
  return message;
}

// What the API sees: user turns and finished answers only, at most `limit`, starting with a user turn.
export function chatHistory(messages, limit = 24) {
  const recent = messages
    .filter((message) => message.role === "user" || message.status === "done")
    .map(({ role, content }) => ({ role, content }))
    .slice(-limit);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}
