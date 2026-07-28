// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-HO6OYGJUN64R
/**
 * Local Restaurant Database
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Legacy file - all data comes from server APIs.
 */

import { Restaurant } from "@/types/restaurant";

export const LOCAL_RESTAURANTS: Restaurant[] = [];

export function getRestaurantsByZip(_zipCode: string, _radius: number = 10): Restaurant[] {
  return [];
}

export function searchRestaurants(_query: string, _zipCode?: string): Restaurant[] {
  return [];
}
