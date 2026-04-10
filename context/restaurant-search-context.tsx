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
}

interface RestaurantSearchContextValue {
  currentSearchParams: SearchParams;
  setCurrentSearchParams: (params: SearchParams) => void;
}

const RestaurantSearchContext = createContext<RestaurantSearchContextValue | null>(null);

export function RestaurantSearchProvider({ children }: { children: React.ReactNode }) {
  const [currentSearchParams, setCurrentSearchParamsState] = useState<SearchParams>({
    zipCode: "",
    radius: 10,
  });

  const setCurrentSearchParams = useCallback((params: SearchParams) => {
    setCurrentSearchParamsState(params);
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
