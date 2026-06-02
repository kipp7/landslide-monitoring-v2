# Production Environment Checklist

- GeneratedAt: 2026-04-14T06:15:19Z
- EnvFile: infra/compose/.env
- TemplateFile: infra/compose/env.prod.example
- Total: 20
- Configured: 18
- Placeholder: 0
- Missing: 0
- EmptyOptional: 2

| Key | Category | Required | Status | Current | Note |
| --- | --- | --- | --- | --- | --- |
| TZ | base | True | configured | Asia/Shanghai | timezone |
| DATA_DIR | base | True | configured | ../../data | data directory |
| PG_USER | postgres | True | configured | landslide | database user |
| PG_PASSWORD | postgres | True | configured | *** | database password |
| PG_DATABASE | postgres | True | configured | landslide_monitor | database name |
| PG_PORT | postgres | True | configured | 5432 | database port |
| CH_DATABASE | clickhouse | True | configured | landslide | timeseries database name |
| CH_USER | clickhouse | True | configured | landslide | timeseries database user |
| CH_PASSWORD | clickhouse | True | configured | *** | timeseries database password |
| REDIS_PASSWORD | redis | True | configured | *** | redis password |
| EMQX_DASHBOARD_USER | emqx | True | configured | admin | dashboard user |
| EMQX_DASHBOARD_PASSWORD | emqx | True | configured | *** | dashboard password |
| AUTH_REQUIRED | security | True | configured | true | enable auth |
| JWT_ACCESS_SECRET | security | True | configured | *** | access token secret |
| JWT_REFRESH_SECRET | security | True | configured | *** | refresh token secret |
| ADMIN_API_TOKEN | security | False | empty_optional |  | admin api token |
| DB_ADMIN_ENABLED | security | True | configured | false | db admin endpoint switch |
| CORS_ORIGINS | api | False | empty_optional |  | frontend origin allowlist |
| KAFKA_BROKERS | kafka | False | configured | localhost:9094 | kafka brokers |
| KAFKA_UI_PORT | kafka | False | configured | 8081 | kafka ui port |
