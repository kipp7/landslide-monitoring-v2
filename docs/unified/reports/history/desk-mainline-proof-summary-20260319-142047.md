# Desk Mainline Proof Summary

- GeneratedAt: 2026-03-19T06:20:46Z
- BaseUrl: http://127.0.0.1:8081
- BuildExecuted: False
- CompletedChecks: 27
- HealthOk: True

## Demo Truth

- Stations: 2
- TotalDevices: 6
- OnlineDevices: 3
- AlertCountToday: 1
- WeeklyRainfallSum: 79
- WeeklyAlertSum: 3
- MissingBaselineCount: 3

## Auth

- Username: admin
- Role: admin
- HasRefreshToken: True
- RefreshWorks: True

## Page Proofs

- HomeRefreshStable: True
- AnalysisAnomalies: 3
- StationManagementStations: 2
- GpsCandidateCount: 3
- GpsTrendDirection: decreasing
- GpsTrendSlopeMmPerHour: -0.0007
- GpsTrendFitR2: 0.0002
- GpsThresholdBlue: 2.5
- GpsThresholdBlueForecastBreached: True
- GpsThresholdRedForecastBreached: True
- GpsThresholdRedForecastEtaHours: 1
- GpsSampleProfiles: 3
- GpsDataLimit: 320
- GpsV1AnalysisImfCount: 3
- GpsShortPredictionBandPoints: 24
- GpsLongPredictionBandPoints: 168
- DeviceCommandsLoaded: 32
- DiagnosticsType: expert_comprehensive_health

## Exports

- GpsChart: desk-gps-chart.svg
- GpsCsv: desk-gps-monitoring.csv
- DeviceCsv: desk-devices.csv
- DeviceDetailCopyReady: True

## Viewer Boundary

- DeniedCount: 5
- DeniedKeys: gps, system, baselineUpsert, deviceCommandIssue, deviceCommandList

## Stress

- PaginationIncluded: False
- CommandPaginationIncluded: False
