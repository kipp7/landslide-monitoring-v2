import { createClient, type ClickHouseClient } from "@clickhouse/client";
import type { AppConfig } from "./config";

export function createClickhouseClient(config: AppConfig): ClickHouseClient {
  return createClient({
    url: config.clickhouseUrl,
    username: config.clickhouseUsername,
    password: config.clickhousePassword ?? ""
  });
}

