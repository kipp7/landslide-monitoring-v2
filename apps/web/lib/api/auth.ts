import { apiGetJson, apiLogin, type ApiSuccessResponse, type AuthLoginResponse } from '../v2Api'

export type RoleRow = { roleId: string; name: string; displayName: string; description?: string }

export type CurrentUser = {
  userId: string
  username: string
  email?: string
  phone?: string
  realName?: string
  roles: RoleRow[]
  permissions: string[]
}

export async function login(username: string, password: string): Promise<ApiSuccessResponse<AuthLoginResponse>> {
  return apiLogin(username, password)
}

export async function getMe(): Promise<ApiSuccessResponse<CurrentUser>> {
  return apiGetJson<ApiSuccessResponse<CurrentUser>>('/api/v1/auth/me')
}
