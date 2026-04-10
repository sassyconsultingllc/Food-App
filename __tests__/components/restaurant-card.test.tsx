/// <reference types="vitest" />
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { vi } from "vitest";
import { RestaurantCard } from "@/components/restaurant-card";
import { Restaurant } from "@/types/restaurant";

const baseRestaurant: Restaurant = {
  id: "1",
  name: "Test Bistro",
  cuisineType: "Italian",
  address: "123 Main St",
  city: "Townsville",
  state: "TS",
  zipCode: "12345",
  latitude: 0,
  longitude: 0,
  isCulvers: false,
  ratings: { aggregated: 4.4, totalReviews: 120 },
  distance: 2.5,
};

describe("RestaurantCard", () => {
  it("navigates to restaurant details on press", () => {
    const pushMock = (globalThis as any).routerPushMock as ReturnType<typeof vi.fn>;
    const { getByLabelText, getByText } = render(
      <RestaurantCard restaurant={baseRestaurant} />
    );

    expect(getByText("Test Bistro")).toBeTruthy();
    fireEvent.press(getByLabelText(/Test Bistro/));
    expect(pushMock).toHaveBeenCalledWith("/restaurant/1");
  });

  it("fires favorite toggle when heart is pressed", () => {
    const onFavoritePress = vi.fn();
    const { getByLabelText } = render(
      <RestaurantCard
        restaurant={baseRestaurant}
        onFavoritePress={onFavoritePress}
        isFavorite={false}
      />
    );

    fireEvent.press(getByLabelText(/Add to favorites/));
    expect(onFavoritePress).toHaveBeenCalledTimes(1);
  });
});
