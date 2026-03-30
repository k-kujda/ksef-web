export const KSEF_CONFIG = {
  PROXY_URL: 'https://ksef-proxy.kujda-k.workers.dev',
  API_BASE: '/api',
} as const;

export function getKsefApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${KSEF_CONFIG.PROXY_URL}${cleanEndpoint}`;
}
