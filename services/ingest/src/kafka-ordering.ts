import type { ProducerConfig } from "kafkajs";

// KeyedSerialQueue establishes same-topic order before this producer. Kafka's
// idempotent sequence numbers keep partition order safe with up to five
// in-flight requests while avoiding cross-topic head-of-line blocking.
export const ORDERED_IDEMPOTENT_PRODUCER_CONFIG: ProducerConfig = Object.freeze({
  idempotent: true,
  maxInFlightRequests: 5
});
