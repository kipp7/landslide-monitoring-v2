const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const dotenv = require("dotenv");

const { loadConfigFromEnv } = require("../dist/config.js");

test("compact polling stability defaults allow slow three-node responses", () => {
  const config = loadConfigFromEnv({ MQTT_URL: "mqtt://127.0.0.1:1883" });

  assert.equal(config.southboundPollingSessionTimeoutMs, 5000);
  assert.equal(config.southboundPollingPartialRetries, 0);
  assert.equal(config.southboundPollingRetryAfterMs, 1200);
  assert.equal(config.southboundPollingEmptyBackoffInitialMs, 2000);
  assert.equal(config.southboundPollingEmptyBackoffMaxMs, 30000);
});

test("RK3568 deployment example pins the Compact V6 layered profile", () => {
  const envPath = path.join(__dirname, "../deploy/field-gateway.env.rk3568.example");
  const config = loadConfigFromEnv(dotenv.parse(fs.readFileSync(envPath)));

  assert.equal(config.southboundPollingEnabled, true);
  assert.equal(config.southboundPollingMode, "compact-layered-v1");
  assert.equal(config.southboundPollingIntervalMs, 250);
  assert.equal(config.southboundPollingSessionTimeoutMs, 1500);
  assert.equal(config.southboundPollingPartialRetries, 0);
  assert.equal(config.southboundPollingRetryAfterMs, 1200);
  assert.equal(config.southboundLayeredEnvironmentEveryRounds, 3);
  assert.equal(config.southboundLayeredAuditEveryRounds, 15);
  assert.equal(config.ntripEnabled, false);
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

test("compact targeted polling requires framed transport and forbids broadcast retries", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        SOUTHBOUND_POLLING_MODE: "compact-targeted-v1",
        FIELD_LINK_MODE: "raw-json"
      }),
    /compact-targeted-v1 requires FIELD_LINK_MODE=cobs-crc-v1/u
  );
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        SOUTHBOUND_POLLING_MODE: "compact-targeted-v1",
        FIELD_LINK_MODE: "cobs-crc-v1",
        SOUTHBOUND_POLLING_PARTIAL_RETRIES: "1"
      }),
    /requires compact-broadcast-v1/u
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

test("NTRIP requires complete credentials and framed field transport", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        NTRIP_ENABLED: "true",
        NTRIP_HOST: "203.0.113.1",
        NTRIP_MOUNTPOINT: "AUTO",
        NTRIP_USERNAME: "user"
      }),
    /ntripPassword/u
  );
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        NTRIP_ENABLED: "true",
        NTRIP_HOST: "203.0.113.1",
        NTRIP_MOUNTPOINT: "AUTO",
        NTRIP_USERNAME: "user",
        NTRIP_PASSWORD: "password",
        FIELD_LINK_MODE: "raw-json"
      }),
    /FIELD_LINK_MODE=cobs-crc-v1/u
  );
});

test("NTRIP validates coordinate frame and reconnect delay range", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        NTRIP_COORDINATE_FRAME: "GCJ02"
      }),
    /ntripCoordinateFrame/u
  );
  assert.throws(
    () =>
      loadConfigFromEnv({
        MQTT_URL: "mqtt://127.0.0.1:1883",
        NTRIP_RECONNECT_BASE_DELAY_MS: "5000",
        NTRIP_RECONNECT_MAX_DELAY_MS: "1000"
      }),
    /NTRIP_RECONNECT_MAX_DELAY_MS/u
  );
});
