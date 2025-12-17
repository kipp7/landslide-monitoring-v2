# 认证接口（v2：UUID 用户）

后端采用 JWT（Access Token + Refresh Token）。所有用户 ID 使用 UUID 字符串。

## 1. 用户登录

**POST** `/auth/login`

请求：
```json
{
  "username": "admin",
  "password": "123456"
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 7200,
    "user": {
      "userId": "a1b2c3d4-1111-2222-3333-444455556666",
      "username": "admin",
      "realName": "管理员",
      "roles": ["admin"],
      "permissions": ["device:view", "device:create"]
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 刷新 Token

**POST** `/auth/refresh`

请求：
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 7200
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 退出登录

**POST** `/auth/logout`

Header：`Authorization: Bearer <token>`

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

## 4. 获取当前用户信息

**GET** `/auth/me`

Header：`Authorization: Bearer <token>`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "userId": "a1b2c3d4-1111-2222-3333-444455556666",
    "username": "admin",
    "email": "admin@example.com",
    "phone": "13800138000",
    "realName": "管理员",
    "roles": [
      { "roleId": "c2d3e4f5-1111-2222-3333-444455556666", "name": "admin", "displayName": "管理员" }
    ],
    "permissions": ["device:view", "device:create"]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 修改密码

**PUT** `/auth/password`

请求：
```json
{
  "oldPassword": "123456",
  "newPassword": "654321"
}
```

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
