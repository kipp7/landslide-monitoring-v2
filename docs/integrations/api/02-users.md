# 用户管理接口

> 约定：用户/角色/权限均使用 UUID 字符串（与 v2 全局规范一致），避免历史“自增 id”与新系统混用。

## 1. 获取用户列表

**GET** `/users`

权限：`user:view`

查询参数：
- `page` - 页码，默认 1
- `pageSize` - 每页数量，默认 20
- `keyword` - 搜索关键词（用户名/姓名/手机）
- `status` - 状态筛选：active/inactive/locked
- `roleId` - 角色筛选

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "userId": "a1b2c3d4-1111-2222-3333-444455556666",
        "username": "admin",
        "realName": "管理员",
        "email": "admin@example.com",
        "phone": "13800138000",
        "status": "active",
        "roles": [{ "roleId": "c2d3e4f5-1111-2222-3333-444455556666", "name": "admin" }],
        "lastLoginAt": "2025-12-15T10:00:00Z",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 50 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 创建用户

**POST** `/users`

权限：`user:create`

请求：
```json
{
  "username": "user1",
  "password": "123456",
  "realName": "张三",
  "email": "user1@example.com",
  "phone": "13800138001",
  "roleIds": [
    "c2d3e4f5-1111-2222-3333-444455556666",
    "d3e4f5a6-1111-2222-3333-444455556666"
  ]
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "userId": "b7f9a8a1-0d21-4f31-a4c2-9f7c1b2b3c4d"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 获取用户详情

**GET** `/users/{userId}`

权限：`user:view`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "userId": "b7f9a8a1-0d21-4f31-a4c2-9f7c1b2b3c4d",
    "username": "user1",
    "realName": "张三",
    "email": "user1@example.com",
    "phone": "13800138001",
    "status": "active",
    "roles": [
      { "roleId": "c2d3e4f5-1111-2222-3333-444455556666", "name": "admin", "displayName": "管理员" }
    ],
    "permissions": ["device:view"],
    "lastLoginAt": "2025-12-15T10:00:00Z",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 4. 更新用户

**PUT** `/users/{userId}`

权限：`user:update`

请求：
```json
{
  "realName": "张三",
  "email": "user1@example.com",
  "phone": "13800138001",
  "status": "active",
  "roleIds": [
    "c2d3e4f5-1111-2222-3333-444455556666",
    "d3e4f5a6-1111-2222-3333-444455556666"
  ]
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "userId": "b7f9a8a1-0d21-4f31-a4c2-9f7c1b2b3c4d",
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 删除用户

**DELETE** `/users/{userId}`

权限：`user:delete`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {},
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 6. 重置用户密码

**POST** `/users/{userId}/reset-password`

权限：`user:update`

请求：
```json
{
  "mode": "force_reset"
}
```

响应（不返回真实密码，避免泄露；用户下次登录需改密）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "userId": "b7f9a8a1-0d21-4f31-a4c2-9f7c1b2b3c4d",
    "mustChangeOnNextLogin": true,
    "resetAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 7. 获取角色列表

**GET** `/roles`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "roleId": "c2d3e4f5-1111-2222-3333-444455556666",
        "name": "admin",
        "displayName": "管理员",
        "description": "系统管理员"
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 8. 获取权限列表

**GET** `/permissions`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "permissionKey": "device:view",
        "description": "查看设备"
      },
      {
        "permissionKey": "alert:config",
        "description": "配置告警规则"
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
