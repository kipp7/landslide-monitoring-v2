import { apiDeleteJson, apiGetJson, apiJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type RoleRow = {
  roleId: string
  name: string
  displayName: string
  description: string
}

export type RolesResponse = { list: RoleRow[] }

export async function listRoles(): Promise<ApiSuccessResponse<RolesResponse>> {
  return apiGetJson<ApiSuccessResponse<RolesResponse>>('/api/v1/roles')
}

export type PermissionRow = { permissionKey: string; description: string }

export type PermissionsResponse = { list: PermissionRow[] }

export async function listPermissions(): Promise<ApiSuccessResponse<PermissionsResponse>> {
  return apiGetJson<ApiSuccessResponse<PermissionsResponse>>('/api/v1/permissions')
}

export type UserRow = {
  userId: string
  username: string
  realName: string
  email: string
  phone: string
  status: 'active' | 'inactive' | 'locked'
  roles: Array<{ roleId: string; name: string; displayName: string }>
  permissions: string[]
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type PaginatedUsers = {
  list: UserRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListUsersQuery = {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  roleId?: string
}

export async function listUsers(query: ListUsersQuery): Promise<ApiSuccessResponse<PaginatedUsers>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.keyword && query.keyword.trim()) params.set('keyword', query.keyword.trim())
  if (query.status && query.status.trim()) params.set('status', query.status.trim())
  if (query.roleId && query.roleId.trim()) params.set('roleId', query.roleId.trim())
  return apiGetJson<ApiSuccessResponse<PaginatedUsers>>(`/api/v1/users?${params.toString()}`)
}

export async function getUser(userId: string): Promise<ApiSuccessResponse<UserRow>> {
  return apiGetJson<ApiSuccessResponse<UserRow>>(`/api/v1/users/${encodeURIComponent(userId)}`)
}

export type CreateUserRequest = {
  username: string
  password: string
  realName?: string
  email?: string
  phone?: string
  roleIds?: string[]
}

export async function createUser(body: CreateUserRequest): Promise<ApiSuccessResponse<unknown>> {
  return apiJson<ApiSuccessResponse<unknown>>('/api/v1/users', body)
}

export type UpdateUserRequest = {
  realName?: string
  email?: string
  phone?: string
  status?: 'active' | 'inactive' | 'locked'
  roleIds?: string[]
}

export async function updateUser(userId: string, body: UpdateUserRequest): Promise<ApiSuccessResponse<unknown>> {
  return apiPutJson<ApiSuccessResponse<unknown>>(`/api/v1/users/${encodeURIComponent(userId)}`, body)
}

export async function deleteUser(userId: string): Promise<ApiSuccessResponse<unknown>> {
  return apiDeleteJson<ApiSuccessResponse<unknown>>(`/api/v1/users/${encodeURIComponent(userId)}`)
}

export async function resetUserPassword(userId: string): Promise<ApiSuccessResponse<unknown>> {
  return apiJson<ApiSuccessResponse<unknown>>(`/api/v1/users/${encodeURIComponent(userId)}/reset-password`, {})
}
