param(
  [string]$PostgresContainer = "lsmv2_postgres",
  [string]$Database = "landslide_monitor",
  [string]$User = "landslide"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$rulePath = Join-Path $repoRoot "docs\integrations\rules\examples\rule-tilt-mutation-field-alarm.v1.json"
$dsl = Get-Content -LiteralPath $rulePath -Raw
$tmpDir = Join-Path $repoRoot ".tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$sqlPath = Join-Path $tmpDir "seed-tilt-mutation-field-alarm-rule.sql"

$sql = @"
DO `$`$
DECLARE
  v_rule_id uuid;
BEGIN
  SELECT rule_id INTO v_rule_id
  FROM alert_rules
  WHERE rule_name = 'field_tilt_mutation_alarm_demo_v1'
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    INSERT INTO alert_rules(rule_name, description, scope, is_active)
    VALUES (
      'field_tilt_mutation_alarm_demo_v1',
      'Tilt X/Y/Z delta over 2 telemetry points exceeds 0.08deg, driving RK3568 YX75R alarm loop.',
      'global',
      TRUE
    )
    RETURNING rule_id INTO v_rule_id;
  ELSE
    UPDATE alert_rules
    SET is_active = TRUE,
        description = 'Tilt X/Y/Z delta over 2 telemetry points exceeds 0.08deg, driving RK3568 YX75R alarm loop.',
        updated_at = NOW()
    WHERE rule_id = v_rule_id;
  END IF;

  INSERT INTO alert_rule_versions(
    rule_id, rule_version, dsl_version, dsl_json, conditions, window_json, hysteresis, severity, enabled
  )
  VALUES (
    v_rule_id,
    COALESCE((SELECT MAX(rule_version) + 1 FROM alert_rule_versions WHERE rule_id = v_rule_id), 1),
    1,
    `$json`$
$dsl
`$json`$::jsonb,
    (`$json`$
$dsl
`$json`$::jsonb)->'when',
    (`$json`$
$dsl
`$json`$::jsonb)->'window',
    (`$json`$
$dsl
`$json`$::jsonb)->'hysteresis',
    'high',
    TRUE
  );
END
`$`$;
"@

Set-Content -LiteralPath $sqlPath -Value $sql -Encoding UTF8
docker cp $sqlPath "${PostgresContainer}:/tmp/seed-tilt-mutation-field-alarm-rule.sql"
docker exec $PostgresContainer psql -U $User -d $Database -f "/tmp/seed-tilt-mutation-field-alarm-rule.sql"
