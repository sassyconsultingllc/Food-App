// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-X5QPREAHOBQL
/**
 * Restaurant Search Context
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Shares current search parameters (zip + radius) across all tabs so that
 * a new search on Home immediately reflects in Browse and other tabs.
 */

import React, { createContext, useContext, useState, useCallback } from "react";

interface SearchParams {
  zipCode: string;
  radius: number;
  /**
   * ISO country of `zipCode` when known (from GPS). Postal codes collide
   * across countries (10178 is Berlin and a US ZIP), so the Worker needs it.
   * Unset for a typed code: the Worker then uses the country the phone's
   * request comes from.
   */
  countryCode?: string;
}

interface SetSearchParams {
  zipCode: string;
  radius: number;
  /** A country, null to clear it, or omitted: keep it for the same zip, drop it for a new one. */
  countryCode?: string | null;
}

interface RestaurantSearchContextValue {
  currentSearchParams: SearchParams;
  setCurrentSearchParams: (params: SetSearchParams) => void;
}

const RestaurantSearchContext = createContext<RestaurantSearchContextValue | null>(null);

export function RestaurantSearchProvider({ children }: { children: React.ReactNode }) {
  const [currentSearchParams, setCurrentSearchParamsState] = useState<SearchParams>({
    zipCode: "",
    radius: 10,
  });

  const setCurrentSearchParams = useCallback((params: SetSearchParams) => {
    setCurrentSearchParamsState((prev) => {
      const sameZip = prev.zipCode.trim() === params.zipCode.trim();
      const countryCode =
        params.countryCode === null
          ? undefined
          : params.countryCode ?? (sameZip ? prev.countryCode : undefined);
      return { zipCode: params.zipCode, radius: params.radius, countryCode };
    });
  }, []);

  return (
    <RestaurantSearchContext.Provider value={{ currentSearchParams, setCurrentSearchParams }}>
      {children}
    </RestaurantSearchContext.Provider>
  );
}

export function useRestaurantSearchContext() {
  const ctx = useContext(RestaurantSearchContext);
  if (!ctx) {
    throw new Error("useRestaurantSearchContext must be used within RestaurantSearchProvider");
  }
  return ctx;
}
