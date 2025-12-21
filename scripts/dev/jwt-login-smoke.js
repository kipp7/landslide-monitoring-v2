/*
  Dev helper: smoke test JWT login + /auth/me against api-service.

  Usage (PowerShell):
    node scripts/dev/jwt-login-smoke.js --api http://localhost:8080 --username admin --password 123456

  Notes:
  - Requires api-service to have JWT enabled (AUTH_REQUIRED=true + JWT_ACCESS_SECRET/JWT_REFRESH_SECRET).
  - You must have already created the user (e.g. via Web /admin/users using ADMIN_API_TOKEN).
*/

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) {
    console.error(`Missing required arg: --${name}`);
    process.exit(2);
  }
  return v;
}

async function readJson(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const apiBase = getArg("api", process.env.API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
  const username = requireArg("username");
  const password = requireArg("password");

  const loginUrl = `${apiBase}/api/v1/auth/login`;
  const loginResp = await fetch(loginUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const loginJson = await readJson(loginResp);
  if (!loginResp.ok || !loginJson?.success || !loginJson?.data?.token) {
    console.error("JWT login failed:", { status: loginResp.status, body: loginJson });
    process.exit(1);
  }

  const token = String(loginJson.data.token);
  const meUrl = `${apiBase}/api/v1/auth/me`;
  const meResp = await fetch(meUrl, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const meJson = await readJson(meResp);
  if (!meResp.ok || !meJson?.success) {
    console.error("/auth/me failed:", { status: meResp.status, body: meJson });
    process.exit(1);
  }

  console.log("OK jwt login + me:", {
    userId: meJson.data?.userId,
    username: meJson.data?.username,
    roles: (meJson.data?.roles || []).map((r) => (typeof r === "string" ? r : r.name)),
    permissions: meJson.data?.permissions || []
  });
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});

