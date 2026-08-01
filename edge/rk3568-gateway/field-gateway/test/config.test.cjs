const assert = require("node:assert/strict");
const test = require("node:test");

const { loadConfigFromEnv } = require("../dist/config.js");

test("compact polling stability defaults allow slow three-node responses", () => {
  const config = loadConfigFromEnv({ MQTT_URL: "mqtt://127.0.0.1:1883" });

  assert.equal(config.southboundPollingSessionTimeoutMs, 5000);
  assert.equal(config.southboundPollingEmptyBackoffInitialMs, 2000);
  assert.equal(config.southboundPollingEmptyBackoffMaxMs, 30000);
});

test("compact polling rejects an inverted empty-response backoff range", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        SOUTHBOUND_POLLING_EMPTY_BACKOFF_INITIAL_MS: "5000",
        SOUTHBOUND_POLLING_EMPTY_BACKOFF_MAX_MS: "2000"
      }),
    /SOUTHBOUND_POLLING_EMPTY_BACKOFF_MAX_MS/
  );
});
