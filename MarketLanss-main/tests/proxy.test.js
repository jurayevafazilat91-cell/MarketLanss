import test from "node:test";
import assert from "node:assert/strict";
import { proxy } from "../src/proxy.js";

const request = (user, password) => new Request("http://localhost/api/store", {
  headers: password === undefined ? {} : { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` },
});

function withEnv(env, run) {
  const saved = { APP_PASSWORD: process.env.APP_PASSWORD, VERCEL: process.env.VERCEL };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { run(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("proxy lets requests through locally when no password is set", () => {
  withEnv({ APP_PASSWORD: undefined, VERCEL: undefined }, () => {
    assert.equal(proxy(request()), undefined);
  });
});

test("proxy keeps a Vercel deployment closed when no password is set", () => {
  withEnv({ APP_PASSWORD: undefined, VERCEL: "1" }, () => {
    assert.equal(proxy(request("any", "guess")).status, 503);
  });
});

test("proxy asks for the password when it is missing or wrong", () => {
  withEnv({ APP_PASSWORD: "s3cret:with-colon", VERCEL: "1" }, () => {
    for (const response of [proxy(request()), proxy(request("seller", "wrong")), proxy(request("s3cret", "with-colon"))]) {
      assert.equal(response.status, 401);
      assert.match(response.headers.get("www-authenticate"), /^Basic /);
    }
  });
});

test("proxy accepts the right password with any user name", () => {
  withEnv({ APP_PASSWORD: "s3cret:with-colon", VERCEL: "1" }, () => {
    assert.equal(proxy(request("", "s3cret:with-colon")), undefined);
    assert.equal(proxy(request("seller", "s3cret:with-colon")), undefined);
  });
});
