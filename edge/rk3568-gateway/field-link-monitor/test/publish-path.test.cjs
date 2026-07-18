const test = require("node:test");
const assert = require("node:assert/strict");

const { assessPublishPath } = require("../dist/publish-path.js");

const healthyInput = {
  lastPublishedAgeSeconds: 5,
  publishFreshnessMs: 30_000,
  spoolPending: 0,
  publishFailures: 0
};

test("keeps a fresh publish path with no backlog or failures healthy", () => {
  assert.equal(assessPublishPath(healthyInput), "healthy");
});

test("reports current backlog or publish failures as attention", () => {
  assert.equal(assessPublishPath({ ...healthyInput, spoolPending: 1 }), "attention");
  assert.equal(assessPublishPath({ ...healthyInput, publishFailures: 1 }), "attention");
});

test("reports missing or stale publication as critical", () => {
  assert.equal(assessPublishPath({ ...healthyInput, lastPublishedAgeSeconds: null }), "critical");
  assert.equal(assessPublishPath({ ...healthyInput, lastPublishedAgeSeconds: 31 }), "critical");
});
