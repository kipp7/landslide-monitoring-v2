const assert = require("node:assert/strict");
const test = require("node:test");

const { loadConfigFromEnv } = require("../dist/config.js");

test("compact polling stability defaults allow slow three-node responses", () => {
  const config = loadConfigFromEnv({ MQTT_URL: "mqtt://127.0.0.1:1883" });

  assert.equal(config.southboundPollingSessionTimeoutMs, 5000);
  assert.equal(config.southboundPollingPartialRetries, 0);
  assert.equal(config.southboundPollingRetryAfterMs, 1200);
  assert.equal(config.southboundPollingEmptyBackoffInitialMs, 2000);
  assert.equal(config.southboundPollingEmptyBackoffMaxMs, 30000);
});

test("compact polling bounds retry count and requires a complete retry window", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        SOUTHBOUND_POLLING_PARTIAL_RETRIES: "2"
      }),
    /southboundPollingPartialRetries/
  );
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        FIELD_LINK_MODE: "cobs-crc-v1",
        SOUTHBOUND_POLLING_MODE: "compact-broadcast-v1",
        SOUTHBOUND_POLLING_PARTIAL_RETRIES: "1",
        SOUTHBOUND_POLLING_RETRY_AFTER_MS: "1200",
        SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS: "2399"
      }),
    /SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS/
  );
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        SOUTHBOUND_POLLING_PARTIAL_RETRIES: "1"
      }),
    /compact-broadcast-v1/
  );
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
