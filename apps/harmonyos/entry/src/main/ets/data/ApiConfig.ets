export const DEFAULT_API_BASE_URL: string = 'http://118.195.199.226:8080/api/v1';

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function isHttps(value: string): boolean {
  return normalizeApiBaseUrl(value).toLowerCase().startsWith('https://');
}
