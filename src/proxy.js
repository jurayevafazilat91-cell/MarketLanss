import { createHash, timingSafeEqual } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest();

// One shared password (HTTP Basic Auth) for every page and the data API: the app has no user accounts yet.
export function proxy(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    // Locally the app stays open; a Vercel deployment without a password stays closed.
    if (!process.env.VERCEL) return;
    return new Response("Set APP_PASSWORD in the Vercel project settings, then redeploy.", { status: 503 });
  }

  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  const credentials = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const given = credentials.slice(credentials.indexOf(":") + 1);
  if (credentials.includes(":") && timingSafeEqual(hash(given), hash(password))) return;

  return new Response("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Marketplace Intelligence", charset="UTF-8"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
