import test from "node:test";
import assert from "node:assert/strict";
import { applyChatEvent, chatHistory, readNdjson } from "../src/lib/chat-stream.js";

test("readNdjson returns complete lines and keeps a partial line for the next chunk", () => {
  const first = readNdjson("", '{"type":"text","text":"Hel"}\n{"type":"te');
  assert.deepEqual(first.events, [{ type: "text", text: "Hel" }]);
  assert.equal(first.rest, '{"type":"te');
  const second = readNdjson(first.rest, 'xt","text":"lo"}\n{"type":"done"}\n');
  assert.deepEqual(second.events, [{ type: "text", text: "lo" }, { type: "done" }]);
  assert.equal(second.rest, "");
});

test("applyChatEvent appends text, finishes, and replaces partial text on error", () => {
  let message = { role: "assistant", content: "", status: "streaming" };
  message = applyChatEvent(message, { type: "text", text: "Returns " });
  message = applyChatEvent(message, { type: "text", text: "fell." });
  assert.deepEqual(message, { role: "assistant", content: "Returns fell.", status: "streaming" });
  assert.deepEqual(applyChatEvent(message, { type: "done" }), { role: "assistant", content: "Returns fell.", status: "done", truncated: false });
  assert.deepEqual(applyChatEvent(message, { type: "done", truncated: true }).truncated, true);
  assert.deepEqual(applyChatEvent(message, { type: "error", code: "refusal" }), { role: "assistant", content: "", status: "error", errorCode: "refusal" });
});

test("chatHistory sends finished turns only, capped, and always starting with the user", () => {
  const messages = [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "A1", status: "done", truncated: false },
    { role: "user", content: "Q2" },
    { role: "assistant", content: "", status: "error", errorCode: "rate_limit" },
    { role: "user", content: "Q3" },
  ];
  assert.deepEqual(chatHistory(messages), [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "A1" },
    { role: "user", content: "Q2" },
    { role: "user", content: "Q3" },
  ]);
  assert.deepEqual(chatHistory(messages, 3), [{ role: "user", content: "Q2" }, { role: "user", content: "Q3" }]);
});
