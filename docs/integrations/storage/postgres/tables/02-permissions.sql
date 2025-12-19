-- =============================================
-- 权限（v2：UUID）
-- =============================================

CREATE TABLE permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_code VARCHAR(100) NOT NULL UNIQUE,
  permission_name VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions (permission_code, permission_name, module) VALUES
('user:view', '查看用户', 'user'),
('user:create', '创建用户', 'user'),
('user:update', '编辑用户', 'user'),
('user:delete', '删除用户', 'user'),
('device:view', '查看设备', 'device'),
('device:create', '添加设备', 'device'),
('device:update', '编辑设备', 'device'),
('device:delete', '删除设备', 'device'),
('device:control', '控制设备', 'device'),
('data:view', '查看数据', 'data'),
('data:export', '导出数据', 'data'),
('data:analysis', '数据分析', 'data'),
('alert:view', '查看告警', 'alert'),
('alert:handle', '处理告警', 'alert'),
('alert:config', '配置告警规则', 'alert'),
('system:config', '系统配置', 'system'),
('system:log', '查看日志', 'system');

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);

