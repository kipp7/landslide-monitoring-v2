const { Kafka, logLevel } = require("kafkajs");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main() {
  const broker = getArg("broker", "127.0.0.1:9094");
  const kafka = new Kafka({
    clientId: "field-rehearsal-kafka-probe",
    brokers: [broker],
    logLevel: logLevel.NOTHING
  });

  const admin = kafka.admin();
  const startedAt = Date.now();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    const out = {
      ok: true,
      broker,
      elapsedMs: Date.now() - startedAt,
      topics
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    const out = {
      ok: false,
      broker,
      elapsedMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      name: err && err.name ? err.name : null
    };
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = 1;
  } finally {
    try {
      await admin.disconnect();
    } catch {}
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
