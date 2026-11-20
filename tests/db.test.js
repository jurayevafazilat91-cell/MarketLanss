import assert from "node:assert/strict";
import test from "node:test";
import { getStoreSql } from "../src/lib/db.js";

test("getStoreSql is null without DATABASE_URL so the local file store is used", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await getStoreSql(), null);
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
});
