// admin-http removed — admin auth & push endpoints are not used in no-auth build
export function pushMetricsHandler() {
  throw new Error('pushMetricsHandler removed');
}
export function adminAuthFallback() {
  throw new Error('adminAuthFallback removed');
}
