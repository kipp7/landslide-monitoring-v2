-- =============================================
-- RBAC：角色-权限映射（种子数据）
-- =============================================

-- 说明：
-- - 本文件只做“角色权限映射”的默认种子；用户与角色的绑定由 API /users/* 接口完成。
-- - 使用 ON CONFLICT DO NOTHING 以便可重复执行（幂等）。

-- super_admin：拥有所有权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin：除 user:delete 外，拥有其余权限（可管理设备/数据/告警/系统运维，并可管理用户但不允许删除用户）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code <> 'user:delete'
WHERE r.role_name = 'admin'
ON CONFLICT DO NOTHING;

-- user：只读权限（面向查看数据与告警，不包含控制/导出/配置权限）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code IN ('device:view', 'data:view', 'alert:view')
WHERE r.role_name = 'user'
ON CONFLICT DO NOTHING;

