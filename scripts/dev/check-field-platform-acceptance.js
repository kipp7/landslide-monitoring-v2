function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJson(url, headers = {}) {
  try {
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return {
      ok: resp.ok,
      status: resp.status,
      url,
      json,
      text
    };
  } catch (err) {
    return {
      ok: false,
      status: -1,
      url,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function main() {
  const baseUrl = getArg("baseUrl", "http://127.0.0.1:8081");
  const bearer = getArg("bearer", "dev");
  const deviceId = getArg("deviceId", "");

  const authHeaders = {
    Authorization: `Bearer ${bearer}`,
    Accept: "application/json"
  };

  const checks = [];
  checks.push(await fetchJson(`${baseUrl}/health`));
  checks.push(await fetchJson(`${baseUrl}/api/v1/dashboard`, authHeaders));
  checks.push(await fetchJson(`${baseUrl}/api/v1/system/status`, authHeaders));
  checks.push(await fetchJson(`${baseUrl}/api/v1/stations?page=1&pageSize=20`, authHeaders));
  checks.push(await fetchJson(`${baseUrl}/api/v1/devices?page=1&pageSize=20`, authHeaders));
  checks.push(await fetchJson(`${baseUrl}/api/dashboard/summary`, authHeaders));
  checks.push(await fetchJson(`${baseUrl}/api/dashboard/weekly-trend`, authHeaders));
  if (deviceId) {
    checks.push(await fetchJson(`${baseUrl}/api/v1/data/state/${deviceId}`, authHeaders));
  }

  const summary = {
    generatedAt: nowIso(),
    baseUrl,
    deviceId: deviceId || null,
    totalChecks: checks.length,
    okChecks: checks.filter((c) => c.ok).length,
    failedChecks: checks.filter((c) => !c.ok).length
  };

  console.log(
    JSON.stringify(
      {
        summary,
        checks
      },
      null,
      2
    )
  );

  if (summary.failedChecks > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
