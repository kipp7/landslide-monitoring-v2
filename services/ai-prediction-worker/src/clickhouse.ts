import { createClient, type ClickHouseClient } from "@clickhouse/client";
import type { AppConfig } from "./config";

export function createClickhouseClient(config: AppConfig): ClickHouseClient | null {
  if (!config.clickhouseUrl) return null;
  return createClient({
    url: config.clickhouseUrl,
    username: config.clickhouseUsername,
    password: config.clickhousePassword ?? ""
  });
}

export function toClickhouseDateTime64Utc(value: string): string {
  return new Date(value).toISOString().replace("T", " ").replace("Z", "");
}

