// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-YQ3DLQQ3SY7D
// admin-http removed — admin auth & push endpoints are not used in no-auth build
export function pushMetricsHandler() {
  throw new Error('pushMetricsHandler removed');
}
export function adminAuthFallback() {
  throw new Error('adminAuthFallback removed');
}
