/// <reference types="vitest" />
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { SpinnerFiltersBar, DEFAULT_FILTERS } from "@/components/spinner-filters";
import type { SpinnerFilters } from "@/components/spinner-filters";

describe("SpinnerFiltersBar", () => {
  const availableCuisines = ["Italian", "Mexican"];

  it("shows match count and toggles Open Now filter", () => {
    const filters: SpinnerFilters = { ...DEFAULT_FILTERS, excludeRecentDays: 0 };
    const onFiltersChange = vi.fn();

    const { getByText } = render(
      <SpinnerFiltersBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        availableCuisines={availableCuisines}
        matchCount={3}
      />
    );

    expect(getByText("3 matches")).toBeTruthy();
    fireEvent.press(getByText("Open Now"));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, openNow: true });
  });

  it("clears active filters when Clear is pressed", () => {
    const filters: SpinnerFilters = { ...DEFAULT_FILTERS, openNow: true };
    const onFiltersChange = vi.fn();

    const { getByText } = render(
      <SpinnerFiltersBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        availableCuisines={availableCuisines}
        matchCount={1}
      />
    );

    fireEvent.press(getByText("Clear"));
    expect(onFiltersChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});
