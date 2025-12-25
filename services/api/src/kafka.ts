import { Kafka, logLevel, type Producer } from "kafkajs";
import type { AppConfig } from "./config";

export type DeviceCommandMessageV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  issued_ts: string;
  requested_by: string | null;
};

export type KafkaPublisher = {
  publishDeviceCommand: (msg: DeviceCommandMessageV1, traceId?: string) => Promise<void>;
};

export function createKafkaPublisher(config: AppConfig): KafkaPublisher | null {
  if (!config.kafkaBrokers || config.kafkaBrokers.length === 0) return null;

  const kafka = new Kafka({
    clientId: config.serviceName,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });

  let producerPromise: Promise<Producer> | null = null;
  const getProducer = async (): Promise<Producer> => {
    producerPromise ??= (async () => {
        const p = kafka.producer();
        await p.connect();
        return p;
      })();
    return producerPromise;
  };

  return {
    publishDeviceCommand: async (msg, traceId) => {
      const producer = await getProducer();
      await producer.send({
        topic: config.kafkaTopicDeviceCommands,
        messages: [
          {
            key: msg.device_id,
            value: JSON.stringify(msg),
            ...(traceId ? { headers: { traceId } } : {})
          }
        ]
      });
    }
  };
}
