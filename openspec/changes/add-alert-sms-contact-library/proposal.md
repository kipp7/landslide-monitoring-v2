# Change: Add alert SMS contact library and provider delivery path

## Why

Current alert notification flow can mark notifications as `sms`, but it resolves recipients only through `users.phone` plus `user_alert_subscriptions`. That is enough for a demo, but not clean enough for product-grade regional warning, duty groups, or provider delivery.

## What Changes

- Add a dedicated alert contact library for regional/station/device SMS recipients.
- Add SMS delivery jobs that snapshot recipient phone numbers, provider, content, and delivery status.
- Extend `alert-notify-worker` to resolve contacts by alert event `station_id` / `device_id` / global binding.
- Add a provider abstraction with `mock` first and real-provider configuration points for Aliyun/Tencent.
- Add an integration proof that can seed a supplied phone number locally and validate the regional SMS delivery path.

## Impact

- Affected specs: alert-notification
- Affected code: `docs/integrations/storage/postgres/tables/09-alert-notifications.sql`, `services/alert-notify-worker/src/*`, `scripts/dev/*`
- Compatibility: existing `alert_notifications` and `user_alert_subscriptions` remain usable; the new contact library is additive.
