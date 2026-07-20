# HarmonyOS landslide monitoring prototype

This is the native ArkTS/ArkUI phone prototype for the landslide monitoring
platform. The server remains the only source of truth: the app calls the
existing `/api/v1` HTTP API and never connects to PostgreSQL or ClickHouse.

## Local development

Open this directory in DevEco Studio, select the `default` product, configure
the API base URL in `entry/src/main/ets/data/ApiConfig.ets`, and run the `entry`
module on a HarmonyOS phone or emulator.

DevEco Studio provides the required SDK and Hvigor runtime. The project can be
built from DevEco Studio or with its bundled `hvigorw` command after setting
`DEVECO_SDK_HOME`.

## Data and cache behavior

- Login, dashboard, stations, devices, telemetry, alerts, and predictions use
  the existing `/api/v1` contract.
- Dashboard `todayReportCount` counts distinct device reports, while
  `todayDataCount` remains the sparse ClickHouse sensor-row count for API
  compatibility. Both use the Beijing calendar day (`UTC+8`, starting at
  local 00:00); the App's `今日上报` card displays report count only.
- Successful summary, station, device, and latest-state responses are cached
  with TTLs. The app renders stale data immediately and refreshes in the
  background.
- Historical series stay in memory only. Preferences stores small snapshots,
  never credentials or a second business database.
- Access and refresh tokens are stored with HarmonyOS AssetStoreKit and are
  removed on logout or when the API server is changed. A valid session is
  restored after the app process restarts.
- Device detail refreshes every 10 seconds while visible; dashboard and alerts
  refresh every 30 seconds. Refresh stops when the app is backgrounded.
- All temperature and moisture values are presented as soil temperature and
  soil moisture. Generic server keys are compatibility fallbacks only.
- Soil conductivity uses `electrical_conductivity_us_cm` and is displayed in
  `μS/cm`; when the latest-state snapshot omits it, device detail falls back to
  the newest point in the requested historical series.
- Conductivity visibility follows device capability metadata. An explicit
  `hasConductivitySensor` value takes priority; the current A/B/C deployment
  enables conductivity for field nodes B and C only.
- Monitoring-node counts, sensor trends, and state requests exclude platform
  alarm actuators. The Tongxiao RK2206 terminal is shown separately as
  `通晓 RK2206 声光告警终端` under linkage alarm devices, so it cannot distort
  A/B/C monitoring statistics.
- The Tongxiao linkage status comes from `/api/v1/field-alarm/status` and its
  physical-device probe when available. It is not inferred from telemetry
  `lastSeenAt`, because the actuator is not a monitoring-data producer.
- The alert map resolves coordinates in this order: coordinates recorded with
  the alert, recent device GPS, seven-day GPS history, the last GPS snapshot,
  station coordinates, and finally the Windows desktop default position at
  Xiamen University (`24.43803, 118.09631`). A stale GPS value is labelled as
  the last GPS rather than real-time data. GPS values outside the project's
  China operating region are treated as invalid device data and cannot replace
  the last valid position.
- Map preview renders every monitoring node and fits the viewport to all node
  markers. Nodes without GPS use the same three-point spread around Xiamen
  University as the Windows desktop, while an active alert remains centred and
  switches the matching node to a red warning ripple. Other nodes retain a
  green monitoring ripple; a separate red ripple is used when the precise alert
  coordinate differs from its node location.
- The station page embeds the same map as a distribution view. It shows every
  monitoring node, focuses the selected station, and refreshes GPS without
  introducing a second location model.
- The most recent valid GPS snapshot is stored in Preferences using the same
  API-server and user cache namespace. It is cleared on logout or server
  change, so positions cannot leak across accounts or environments.
- Foreground `ALERT_TRIGGER` SSE events open a blocking in-app alert panel and
  start the bundled smooth civil-defense-style alarm with a synchronized
  vibration cadence. Muting pauses both sound and vibration. Updates replace the same
  `alertId` in place, critical escalation reopens the strong reminder, and
  acknowledgement leaves the warning active, and only resolution removes that
  alert from the panel. Concurrent node alerts are queued by `alertId` instead
  of being duplicated by event ID.
  See [`ALERT_INTEGRATION.md`](./ALERT_INTEGRATION.md) for the shared Windows,
  App, and Push payload contract.
- The **My** page keeps the API address hidden in normal use. Connection state,
  cache cleanup, refresh cadence, location use, and app version are grouped as
  settings; the address is only exposed after opening the server editor.
- The map uses Leaflet with TianDiTu `img_w` satellite imagery and `cia_w`
  Chinese annotations. Its browser-side key is injected by ArkTS from
  `entry/src/main/ets/data/MapConfig.ets`. Map tiles are not part of the
  business-data cache and require network access; coordinates and their source
  remain visible when the basemap cannot load.

## API configuration

The normal login screen uses the default API base URL from
`entry/src/main/ets/data/ApiConfig.ets` and keeps it hidden. Authentication
errors remain on the login screen. If the server cannot be reached or the API
path is invalid, the app opens a separate server connection screen where the
address can be changed. Signed-in users can open **My > Server connection** to
change it; changing environments clears the current session and cached data.

For emulator and LAN debugging, use a reachable LAN or HTTPS URL that includes
the `/api/v1` path. `127.0.0.1` inside an emulator refers to the emulator
itself. Release builds should use HTTPS.
