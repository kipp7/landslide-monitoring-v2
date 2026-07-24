import type { ProducerConfig } from "kafkajs";

// MQTT preserves publication order per connection. Keep the same order while
// Kafka retries, and suppress retry duplicates before the writer sees them.
export const ORDERED_IDEMPOTENT_PRODUCER_CONFIG: ProducerConfig = Object.freeze({
  idempotent: true,
  maxInFlightRequests: 1
});
