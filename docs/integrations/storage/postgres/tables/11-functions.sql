-- =============================================
-- 数据库通用函数与触发器（v2）
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 触发器（按需添加）
CREATE TRIGGER tr_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_stations_updated_at
BEFORE UPDATE ON stations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_sensors_updated_at
BEFORE UPDATE ON sensors
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_device_sensors_updated_at
BEFORE UPDATE ON device_sensors
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_alert_rules_updated_at
BEFORE UPDATE ON alert_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_alert_rule_versions_updated_at
BEFORE UPDATE ON alert_rule_versions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_user_alert_subscriptions_updated_at
BEFORE UPDATE ON user_alert_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

