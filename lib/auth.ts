// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-ESXDXRPR32SV
// lib/auth removed — authentication is not used in this build
export type User = any;
export async function getSessionToken(): Promise<string | null> { return null; }
export async function setSessionToken(_token: string): Promise<void> { return; }
export async function removeSessionToken(): Promise<void> { return; }
export async function getUserInfo(): Promise<User | null> { return null; }
export async function setUserInfo(_user: User): Promise<void> { return; }
export async function clearUserInfo(): Promise<void> { return; }