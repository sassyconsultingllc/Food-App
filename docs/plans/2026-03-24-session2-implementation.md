# Session 2 Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 9 fixes across worker backend and React Native frontend: tRPC stubs, rate limiting, dietary disclaimer, distance-based filtering, postal input improvements, favorites icon swap, favorites notepad UI, and About/What People Say merge.

**Architecture:** Worker changes add two tRPC stubs and a KV-backed sliding-window rate limiter. Frontend changes swap heart icon to crossed utensils, improve postal input for international support, replace ZIP-prefix filtering with GPS-based distance, add dietary disclaimer, redesign favorites as expandable notepad, and merge redundant detail sections.

**Tech Stack:** Cloudflare Workers + Hono + tRPC, React Native + Expo, Zod, AsyncStorage, Reanimated

---

### Task 1: H3 — Add RATE_LIMIT KV namespace to wrangler.toml and Env type

**Files:**
- Modify: `wrangler.toml:36` (after R2 bucket block)
- Modify: `worker/context.ts:8-31`

**Step 1: Add KV namespace to wrangler.toml**

In `wrangler.toml`, after the R2 bucket block (line 36), add:

```toml
# =============================================================================
# KV Namespace - Rate limiting
# =============================================================================
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "PLACEHOLDER_CREATE_WITH_WRANGLER"
# Create with: wrangler kv namespace create RATE_LIMIT
# Then replace the id above with the returned namespace ID
```

Also add the same block in `[env.production]` after the R2 bucket (after line 70) and in `[env.preview]` (after line 91):

```toml
[[env.production.kv_namespaces]]
binding = "RATE_LIMIT"
id = "PLACEHOLDER_CREATE_WITH_WRANGLER"

[[env.preview.kv_namespaces]]
binding = "RATE_LIMIT"
id = "PLACEHOLDER_CREATE_WITH_WRANGLER"
```

**Step 2: Add RATE_LIMIT to Env type**

In `worker/context.ts`, add after the R2 Buckets line (line 13):

```typescript
  // KV Namespaces
  RATE_LIMIT?: KVNamespace;
```

**Step 3: Commit**

```bash
git add wrangler.toml worker/context.ts
git commit -m "feat: add RATE_LIMIT KV namespace binding"
```

---

### Task 2: H3 — Implement sliding-window rate limiter middleware

**Files:**
- Modify: `worker/index.ts:1-24` (add rate limiter after CORS middleware)

**Step 1: Add rate limiter middleware**

In `worker/index.ts`, after the CORS middleware block (line 24), add:

```typescript
// =============================================================================
// Rate Limiting - Sliding window per IP
// =============================================================================
async function checkRateLimit(
  kv: KVNamespace | undefined,
  ip: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!kv) return { allowed: true, remaining: limit, resetAt: 0 };

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  const key = `rl:${ip}`;

  try {
    const stored = await kv.get(key, "json") as { timestamps: number[] } | null;
    const timestamps = (stored?.timestamps || []).filter((t: number) => t > windowStart);

    if (timestamps.length >= limit) {
      const oldestInWindow = Math.min(...timestamps);
      const resetAt = oldestInWindow + windowSeconds;
      return { allowed: false, remaining: 0, resetAt };
    }

    timestamps.push(now);
    await kv.put(key, JSON.stringify({ timestamps }), { expirationTtl: windowSeconds * 2 });

    return { allowed: true, remaining: limit - timestamps.length, resetAt: now + windowSeconds };
  } catch {
    // Fail open if KV is unavailable
    return { allowed: true, remaining: limit, resetAt: 0 };
  }
}

// Rate limit tRPC: 60 req/min
app.use("/api/trpc/*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const result = await checkRateLimit(c.env.RATE_LIMIT, ip, 60, 60);

  c.header("X-RateLimit-Limit", "60");
  c.header("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    c.header("Retry-After", String(result.resetAt - Math.floor(Date.now() / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});

// Rate limit uploads: 10 req/min
app.use("/api/menu/*/upload", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const result = await checkRateLimit(c.env.RATE_LIMIT, ip, 10, 60);

  c.header("X-RateLimit-Limit", "10");
  c.header("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    c.header("Retry-After", String(result.resetAt - Math.floor(Date.now() / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});
```

**Step 2: Commit**

```bash
git add worker/index.ts
git commit -m "feat: add sliding-window rate limiter (60/min tRPC, 10/min uploads)"
```

---

### Task 3: H2 — Add systemStatus and importFromShare tRPC stubs

**Files:**
- Modify: `worker/trpc-router.ts:582` (before closing of restaurant router)

**Step 1: Add stubs before the closing `}),` of the restaurant router**

In `worker/trpc-router.ts`, before line 582 (`}),`), add:

```typescript
    /**
     * System status / health check
     */
    systemStatus: publicProcedure
      .query(async ({ ctx }) => {
        const { DB, VECTORIZE, AI, MENU_PHOTOS } = ctx.env;
        return {
          ok: true,
          timestamp: Date.now(),
          bindings: {
            db: !!DB,
            vectorize: !!VECTORIZE,
            ai: !!AI,
            menuPhotos: !!MENU_PHOTOS,
          },
        };
      }),

    /**
     * Import a restaurant from a shared link/payload
     * Accepts shared restaurant JSON and stores it in the D1 cache
     */
    importFromShare: publicProcedure
      .input(z.object({
        restaurant: z.object({
          id: z.string(),
          name: z.string(),
          cuisineType: z.string(),
          address: z.string(),
          city: z.string().optional(),
          state: z.string().optional(),
          zipCode: z.string().optional(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        cacheKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = ctx.env.DB;
        if (!db) {
          throw new Error("Database not configured");
        }

        const { restaurant, cacheKey } = input;
        const key = cacheKey || restaurant.zipCode || "shared";

        await cacheRestaurants(db, key, [restaurant], ["shared"]);

        return { success: true, id: restaurant.id };
      }),
```

**Step 2: Commit**

```bash
git add worker/trpc-router.ts
git commit -m "feat: add systemStatus and importFromShare tRPC procedures"
```

---

### Task 4: FAV — Swap heart icon to fork.knife (crossed utensils)

**Files:**
- Modify: `components/ui/icon-symbol.tsx:23` (add `"fork.knife.circle"` mapping)
- Modify: `components/restaurant-card.tsx:108` (swap heart to fork.knife)
- Modify: `app/(tabs)/_layout.tsx:58` (favorites tab icon)
- Modify: `app/(tabs)/favorites.tsx:229` (empty state icon)
- Modify: `app/restaurant/[id].tsx:159-163` (detail screen favorite button)

**Step 1: Add `fork.knife.circle` to icon mapping for unfavorited state**

In `components/ui/icon-symbol.tsx`, add to the MAPPING object after `"fork.knife"`:

```typescript
  "fork.knife.circle": "restaurant-menu",
```

**Step 2: Swap icons in restaurant-card.tsx**

Change line 108 from:
```typescript
                name={isFavorite ? "heart.fill" : "heart"}
```
to:
```typescript
                name="fork.knife"
```

(The favorited/unfavorited distinction is already handled by color: `AppColors.copper` vs `colors.border`)

**Step 3: Swap favorites tab icon in _layout.tsx**

Change line 58 from:
```typescript
            <IconSymbol size={28} name="heart.fill" color={color} />
```
to:
```typescript
            <IconSymbol size={28} name="fork.knife" color={color} />
```

**Step 4: Swap empty state icon in favorites.tsx**

Change line 229 from:
```typescript
          <IconSymbol name="heart.fill" size={64} color={colors.border} />
```
to:
```typescript
          <IconSymbol name="fork.knife" size={64} color={colors.border} />
```

**Step 5: Swap detail screen favorite button in [id].tsx**

Change lines 159-163 from:
```typescript
          <IconSymbol
            name="heart.fill"
            size={24}
            color={favorite ? AppColors.copper : AppColors.slateGray}
          />
```
to:
```typescript
          <IconSymbol
            name="fork.knife"
            size={24}
            color={favorite ? AppColors.copper : AppColors.slateGray}
          />
```

Also update the accessibility label on line 100:
```typescript
              accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
```
(This is already correct, no change needed.)

**Step 6: Commit**

```bash
git add components/ui/icon-symbol.tsx components/restaurant-card.tsx app/\(tabs\)/_layout.tsx app/\(tabs\)/favorites.tsx app/restaurant/\[id\].tsx
git commit -m "feat: swap favorite icon from heart to crossed utensils (fork.knife)"
```

---

### Task 5: M1 — Change getRestaurantsWithDistance to accept {lat, lon}

**Files:**
- Modify: `hooks/use-restaurant-storage.ts:372-387`
- Modify: `hooks/use-restaurant-storage.ts:424-437` (getRandomRestaurant)
- Modify: `hooks/use-restaurant-storage.ts:12` (remove ZIP_CODE_COORDS import)
- Modify: `app/(tabs)/favorites.tsx:56-66` (caller)

**Step 1: Change getRestaurantsWithDistance signature**

In `hooks/use-restaurant-storage.ts`, replace lines 372-387:

```typescript
  const getRestaurantsWithDistance = useCallback(
    (coords: { lat: number; lon: number }): Restaurant[] => {
      return restaurants.map((restaurant) => ({
        ...restaurant,
        distance: calculateDistance(
          coords.lat,
          coords.lon,
          restaurant.latitude,
          restaurant.longitude
        ),
      }));
    },
    [restaurants]
  );
```

**Step 2: Update getRandomRestaurant to accept coords**

Replace lines 423-437:

```typescript
  const getRandomRestaurant = useCallback((
    coords: { lat: number; lon: number },
    maxDistance: number
  ): Restaurant | null => {
    const withDistance = getRestaurantsWithDistance(coords);
    const filtered = withDistance.filter(
      (r) => r.distance !== undefined && r.distance <= maxDistance
    );

    if (filtered.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * filtered.length);
    return filtered[randomIndex];
  }, [getRestaurantsWithDistance]);
```

**Step 3: Remove ZIP_CODE_COORDS from import**

Change line 12 from:
```typescript
import { calculateDistance, ZIP_CODE_COORDS } from "@/utils/geo-utils";
```
to:
```typescript
import { calculateDistance } from "@/utils/geo-utils";
```

**Step 4: Update favorites.tsx caller**

In `app/(tabs)/favorites.tsx`, the `favoriteRestaurants` useMemo (lines 58-66) needs to use coords. This will be handled in Task 8 (FAV-UI rewrite) since we're rewriting the favorites screen. For now, update it to pass dummy coords that produce no distance:

Replace lines 56-66:
```typescript
  // Use GPS coords from location hook if available, or skip distance
  const favoriteRestaurants = useMemo(() => {
    const favorites = getFavoriteRestaurants();
    // Distance will be calculated in FAV-UI task if coords available
    return favorites;
  }, [getFavoriteRestaurants]);
```

**Step 5: Commit**

```bash
git add hooks/use-restaurant-storage.ts app/\(tabs\)/favorites.tsx
git commit -m "refactor: getRestaurantsWithDistance takes {lat,lon} instead of ZIP string"
```

---

### Task 6: M2 + M3 — Postal input improvements and distance-based filtering

**Files:**
- Modify: `app/(tabs)/index.tsx:293-301` (handleZipCodeChange)
- Modify: `app/(tabs)/index.tsx:365-373` (TextInput)
- Modify: `app/(tabs)/index.tsx:192-200` (ZIP prefix filter → distance filter)
- Modify: `app/(tabs)/index.tsx:286-290` (radius change trigger)
- Modify: `app/(tabs)/index.tsx:348-353` (Culver's widget condition)

**Step 1: Add isValidPostalCode import**

At the top of `app/(tabs)/index.tsx`, add to existing imports or create new import:

```typescript
import { isValidPostalCode, calculateDistance } from "@/utils/geo-utils";
```

**Step 2: Update handleZipCodeChange to use isValidPostalCode**

Replace lines 293-301:

```typescript
  const handleZipCodeChange = (text: string) => {
    setZipCode(text);
    setLocationName(null);

    if (isValidPostalCode(text)) {
      searchWithNewParams(text, radius);
    }
  };
```

**Step 3: Update TextInput props**

Replace lines 365-373:

```typescript
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={zipCode}
                      onChangeText={handleZipCodeChange}
                      placeholder="Enter postal code"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="default"
                      maxLength={10}
                    />
```

**Step 4: Replace ZIP prefix filter with distance-based filtering**

Replace lines 192-200 (the ZIP prefix filter block):

```typescript
    // Distance-based radius filtering using GPS coords
    if (latitude && longitude) {
      filtered = filtered.filter(r => {
        if (!r.latitude || !r.longitude) return true;
        const dist = calculateDistance(latitude, longitude, r.latitude, r.longitude);
        return dist <= radius;
      });
    }
```

This requires access to `latitude` and `longitude` from the location hook. Check if they're already destructured. Looking at line 73-76, the location hook returns `city`, `state`, `zipCode`, `countryCode`, `getCurrentLocation`. We need to also destructure `latitude` and `longitude`.

Update the useLocation destructuring (around line 70-77) to include:

```typescript
  const {
    loading: locationLoading,
    latitude,
    longitude,
    city,
    state: locationState,
    zipCode: locationZipCode,
    countryCode: locationCountryCode,
    getCurrentLocation,
  } = useLocation();
```

**Step 5: Update radius change trigger condition**

Replace line 288 from:
```typescript
    if (zipCode.length === 5) {
```
to:
```typescript
    if (isValidPostalCode(zipCode)) {
```

**Step 6: Update Culver's widget condition**

Replace line 350 from:
```typescript
            {zipCode.length === 5 && (
```
to:
```typescript
            {/^\d{5}$/.test(zipCode) && (
```

(Culver's is US-only, so keep the 5-digit check specifically for that widget.)

**Step 7: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat: postal input supports international codes, distance-based radius filtering"
```

---

### Task 7: H5 — Add dietary disclaimer below filter chips

**Files:**
- Modify: `app/(tabs)/browse.tsx:595` (after the dietary filter ScrollView closing tag)

**Step 1: Add disclaimer text**

In `app/(tabs)/browse.tsx`, after the closing `</ScrollView>` of the dietary filters section (after line 595), add:

```tsx
              <ThemedText style={[styles.dietaryDisclaimer, { color: colors.textSecondary }]}>
                Dietary info is inferred and may not be accurate. Always confirm with the restaurant.
              </ThemedText>
```

**Step 2: Add style**

In the StyleSheet, add after `dietaryText` style (around line 844):

```typescript
  dietaryDisclaimer: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
```

**Step 3: Commit**

```bash
git add app/\(tabs\)/browse.tsx
git commit -m "feat: add dietary info disclaimer below filter chips"
```

---

### Task 8: MERGE — Combine About and What People Say sections

**Files:**
- Modify: `app/restaurant/[id].tsx:336-398` (What People Say section)
- Modify: `app/restaurant/[id].tsx:596-606` (About section)

**Step 1: Remove the standalone "About" section**

Delete lines 596-606 (the entire `{restaurant.description && (` block for About).

**Step 2: Merge description into "What People Say" → rename to "About"**

Replace the entire "What People Say" section (lines 336-398) with a merged "About" section:

```tsx
        {/* About — merged description + sentiment */}
        {(restaurant.description || restaurant.sentiment) && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              About
            </ThemedText>

            {/* Description */}
            {restaurant.description && (
              <ThemedText style={{ color: colors.textSecondary, lineHeight: 22, marginBottom: restaurant.sentiment ? Spacing.md : 0 }}>
                {restaurant.description}
              </ThemedText>
            )}

            {/* Sentiment Badge */}
            {restaurant.sentiment && (
              <>
                <View style={[
                  styles.sentimentBadge,
                  { backgroundColor: restaurant.sentiment.sentiment === 'positive' ? AppColors.skyBlue :
                                     restaurant.sentiment.sentiment === 'negative' ? AppColors.copper : AppColors.lightOrange }
                ]}>
                  <ThemedText style={styles.sentimentBadgeText}>
                    {restaurant.sentiment.sentiment === 'positive' ? 'Highly Recommended' :
                     restaurant.sentiment.sentiment === 'negative' ? 'Proceed with Caution' :
                     restaurant.sentiment.sentiment === 'mixed' ? 'Mixed Reviews' : 'Limited Reviews'}
                  </ThemedText>
                </View>

                {/* Review Summary */}
                {restaurant.reviewSummary && (
                  <ThemedText style={[styles.reviewSummary, { color: colors.textSecondary }]}>
                    {restaurant.reviewSummary}
                  </ThemedText>
                )}

                {/* Highlights */}
                {restaurant.sentiment.highlights && restaurant.sentiment.highlights.length > 0 && (
                  <View style={styles.sentimentList}>
                    <ThemedText type="defaultSemiBold" style={{ marginBottom: 4 }}>Praised for:</ThemedText>
                    <View style={styles.tagContainer}>
                      {restaurant.sentiment.highlights.slice(0, 5).map((highlight, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: AppColors.skyBlue + '20' }]}>
                          <ThemedText style={[styles.tagText, { color: AppColors.skyBlue }]}>{highlight}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Warnings */}
                {restaurant.sentiment.warnings && restaurant.sentiment.warnings.length > 0 && (
                  <View style={styles.sentimentList}>
                    <ThemedText type="defaultSemiBold" style={{ marginBottom: 4 }}>Watch out for:</ThemedText>
                    <View style={styles.tagContainer}>
                      {restaurant.sentiment.warnings.slice(0, 5).map((warning, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: AppColors.copper + '20' }]}>
                          <ThemedText style={[styles.tagText, { color: AppColors.copper }]}>{warning}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}
```

**Step 3: Commit**

```bash
git add app/restaurant/\[id\].tsx
git commit -m "refactor: merge About and What People Say into single About section"
```

---

### Task 9: FAV-UI — Redesign favorites as structured notepad with expandable items

**Files:**
- Modify: `app/(tabs)/favorites.tsx` (full rewrite of the screen)

**Step 1: Rewrite favorites.tsx**

Replace the entire file with the new notepad-style implementation. Key changes:

- Add `useLocation` hook for GPS coords
- Each favorite renders as a collapsible row (Animated height)
- Collapsed: name + cuisine + distance + fork.knife icon
- Expanded: full details (address, phone, rating, hours) + editable notes TextInput
- Keep existing: shuffle button, AI recommendations, empty state
- Use `LayoutAnimation` or `Reanimated` for expand/collapse

The expanded item should show:
```
┌──────────────────────────────────────────┐
│ 🍴 Restaurant Name          ▼ 2.3 mi   │
│    Italian                               │
├──────────────────────────────────────────┤
│ 📍 123 Main St, City, ST 12345          │
│ 📞 (555) 123-4567                       │
│ ⭐ 4.2 aggregated                       │
│ 🕐 Open until 10 PM                     │
│                                          │
│ ┌─ Notes ──────────────────────────────┐ │
│ │ Great pasta, try the tiramisu        │ │
│ └──────────────────────────────────────┘ │
│           [View Details]                 │
└──────────────────────────────────────────┘
```

Full replacement for `app/(tabs)/favorites.tsx`:

```tsx
/**
 * Favorites Screen - Structured Notepad with AI Recommendations
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useCallback, useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLocation } from "@/hooks/use-location";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useRecommendations, useVectorStats } from "@/hooks/use-semantic-search";
import { Restaurant } from "@/types/restaurant";
import { calculateDistance } from "@/utils/geo-utils";
import { getOpenStatus } from "@/utils/hours-utils";
import { formatDisplayAddress } from "@/utils/address-utils";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function FavoriteItem({
  restaurant,
  isExpanded,
  onToggleExpand,
  onToggleFavorite,
  notes,
  onNotesChange,
  onViewDetails,
  colors,
}: {
  restaurant: Restaurant;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleFavorite: () => void;
  notes: string | undefined;
  onNotesChange: (text: string) => void;
  onViewDetails: () => void;
  colors: any;
}) {
  const [localNotes, setLocalNotes] = useState(notes || "");
  const openStatus = getOpenStatus(restaurant.hours);

  // Sync external notes changes
  useEffect(() => {
    setLocalNotes(notes || "");
  }, [notes]);

  const handleNotesBlur = () => {
    if (localNotes !== (notes || "")) {
      onNotesChange(localNotes);
    }
  };

  return (
    <View style={[styles.favoriteItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      {/* Collapsed Row */}
      <Pressable onPress={onToggleExpand} style={styles.favoriteHeader}>
        <IconSymbol
          name="fork.knife"
          size={22}
          color={AppColors.copper}
        />
        <View style={styles.favoriteHeaderInfo}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {restaurant.name}
          </ThemedText>
          <ThemedText style={[styles.favoriteCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
            {restaurant.cuisineType}
          </ThemedText>
        </View>
        {restaurant.distance !== undefined && (
          <ThemedText style={[styles.favoriteDistance, { color: colors.textSecondary }]}>
            {restaurant.distance.toFixed(1)} mi
          </ThemedText>
        )}
        <IconSymbol
          name={isExpanded ? "chevron.up" : "chevron.down"}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={styles.favoriteDetails}>
          {/* Address */}
          <View style={styles.detailRow}>
            <IconSymbol name="mappin.and.ellipse" size={16} color={colors.accent} />
            <ThemedText style={[styles.detailText, { color: colors.textSecondary }]} numberOfLines={2}>
              {formatDisplayAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)}
            </ThemedText>
          </View>

          {/* Phone */}
          {restaurant.phone && (
            <View style={styles.detailRow}>
              <IconSymbol name="phone.fill" size={16} color={colors.accent} />
              <ThemedText style={[styles.detailText, { color: colors.textSecondary }]}>
                {restaurant.phone}
              </ThemedText>
            </View>
          )}

          {/* Rating */}
          <View style={styles.detailRow}>
            <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
            <ThemedText style={[styles.detailText, { color: colors.textSecondary }]}>
              {restaurant.ratings.aggregated.toFixed(1)} rating
            </ThemedText>
          </View>

          {/* Open Status */}
          {openStatus && (
            <View style={styles.detailRow}>
              <IconSymbol name="clock.fill" size={16} color={openStatus.isOpen ? AppColors.success : AppColors.copper} />
              <ThemedText style={[styles.detailText, { color: openStatus.isOpen ? AppColors.success : AppColors.copper }]}>
                {openStatus.label}
              </ThemedText>
            </View>
          )}

          {/* Notes */}
          <View style={styles.notesContainer}>
            <ThemedText style={[styles.notesLabel, { color: colors.textSecondary }]}>
              Notes
            </ThemedText>
            <TextInput
              style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={localNotes}
              onChangeText={setLocalNotes}
              onBlur={handleNotesBlur}
              placeholder="Add personal notes..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.favoriteActions}>
            <Pressable
              onPress={onViewDetails}
              style={[styles.viewDetailsButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.viewDetailsText}>View Details</ThemedText>
            </Pressable>
            <Pressable
              onPress={onToggleFavorite}
              style={[styles.removeButton, { borderColor: AppColors.copper }]}
            >
              <IconSymbol name="xmark" size={14} color={AppColors.copper} />
              <ThemedText style={[styles.removeText, { color: AppColors.copper }]}>Remove</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const router = useRouter();

  const {
    preferences,
    getFavoriteRestaurants,
    getRestaurantsWithDistance,
    toggleFavorite,
    getRestaurantById,
    updateRestaurantNotes,
    getRestaurantNotes,
  } = useRestaurantStorage();

  const { latitude, longitude } = useLocation();

  // AI Recommendations
  const { getRecommendations, results: aiRecommendations, loading: aiLoading, clear: clearRecs } = useRecommendations();
  const { available: aiAvailable, vectorCount } = useVectorStats();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [randomPick, setRandomPick] = useState<Restaurant | null>(null);
  const buttonScale = useSharedValue(1);

  const favoriteRestaurants = useMemo(() => {
    const favorites = getFavoriteRestaurants();
    if (latitude && longitude) {
      const withDistance = getRestaurantsWithDistance({ lat: latitude, lon: longitude });
      return favorites.map((fav) => {
        const withDist = withDistance.find((r) => r.id === fav.id);
        return withDist || fav;
      });
    }
    return favorites;
  }, [getFavoriteRestaurants, getRestaurantsWithDistance, latitude, longitude]);

  // Fetch AI recommendations when favorites change
  useEffect(() => {
    if (aiAvailable && favoriteRestaurants.length >= 2) {
      const favoriteIds = favoriteRestaurants.map(f => f.id);
      getRecommendations(favoriteIds, favoriteIds);
    } else {
      clearRecs();
    }
  }, [aiAvailable, favoriteRestaurants, getRecommendations, clearRecs]);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleToggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleRandomFromFavorites = useCallback(() => {
    if (favoriteRestaurants.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withSpring(1.1),
      withSpring(1)
    );

    const randomIndex = Math.floor(Math.random() * favoriteRestaurants.length);
    const pick = favoriteRestaurants[randomIndex];
    setRandomPick(pick);

    // Auto-expand the pick
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(new Set([pick.id]));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [favoriteRestaurants, buttonScale]);

  const handleRecommendationPress = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/restaurant/${id}`);
  }, [router]);

  const renderFavorite = useCallback(({ item }: { item: Restaurant }) => (
    <FavoriteItem
      restaurant={item}
      isExpanded={expandedIds.has(item.id)}
      onToggleExpand={() => handleToggleExpand(item.id)}
      onToggleFavorite={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        toggleFavorite(item.id);
      }}
      notes={getRestaurantNotes(item.id)}
      onNotesChange={(text) => updateRestaurantNotes(item.id, text)}
      onViewDetails={() => router.push(`/restaurant/${item.id}`)}
      colors={colors}
    />
  ), [expandedIds, handleToggleExpand, toggleFavorite, getRestaurantNotes, updateRestaurantNotes, router, colors]);

  const keyExtractor = useCallback((item: Restaurant) => item.id, []);

  const ListHeader = useMemo(() => (
    favoriteRestaurants.length > 0 ? (
      <View style={styles.headerActions}>
        <Pressable onPress={handleRandomFromFavorites}>
          <Animated.View
            style={[
              styles.randomButton,
              { backgroundColor: colors.accent },
              animatedButtonStyle,
            ]}
          >
            <IconSymbol name="shuffle" size={20} color={AppColors.white} />
            <ThemedText style={styles.randomButtonText}>
              Pick from Favorites
            </ThemedText>
          </Animated.View>
        </Pressable>

        {randomPick && (
          <View style={[styles.randomPickBanner, { backgroundColor: AppColors.copper + '15', borderColor: AppColors.copper }]}>
            <IconSymbol name="fork.knife" size={18} color={AppColors.copper} />
            <ThemedText type="defaultSemiBold" style={{ flex: 1 }}>
              {randomPick.name}
            </ThemedText>
            <Pressable onPress={() => router.push(`/restaurant/${randomPick.id}`)}>
              <ThemedText style={{ color: colors.accent, fontWeight: '600' }}>View</ThemedText>
            </Pressable>
          </View>
        )}

        {/* AI Recommendations Section */}
        {aiAvailable && favoriteRestaurants.length >= 2 && (
          <View style={styles.recommendationsSection}>
            <View style={styles.recommendationsHeader}>
              <IconSymbol name="sparkles" size={20} color={AppColors.copper} />
              <ThemedText type="subtitle" style={styles.recommendationsTitle}>
                Based on Your Favorites
              </ThemedText>
            </View>

            {aiLoading ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="small" color={AppColors.copper} />
                <ThemedText style={[styles.aiLoadingText, { color: colors.textSecondary }]}>
                  Finding restaurants you'll love...
                </ThemedText>
              </View>
            ) : aiRecommendations.length > 0 ? (
              <View style={styles.recommendationsList}>
                {aiRecommendations.slice(0, 5).map((rec) => {
                  const restaurant = rec.restaurant || getRestaurantById(rec.id);
                  if (!restaurant) return null;

                  return (
                    <Pressable
                      key={rec.id}
                      onPress={() => handleRecommendationPress(rec.id)}
                      style={[styles.recommendationItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <View style={styles.recommendationInfo}>
                        <ThemedText type="defaultSemiBold" numberOfLines={1}>
                          {restaurant.name}
                        </ThemedText>
                        <ThemedText style={[styles.recommendationCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
                          {restaurant.cuisineType}
                        </ThemedText>
                      </View>
                      <View style={[styles.matchBadge, { backgroundColor: AppColors.copper }]}>
                        <ThemedText style={styles.matchText}>
                          {Math.round(rec.score * 100)}%
                        </ThemedText>
                      </View>
                      <IconSymbol name="chevron.right" size={18} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
              </View>
            ) : vectorCount === 0 ? (
              <ThemedText style={[styles.noRecsText, { color: colors.textSecondary }]}>
                Search for restaurants to enable AI recommendations
              </ThemedText>
            ) : null}
          </View>
        )}

        <ThemedText type="subtitle" style={styles.listTitle}>
          All Favorites ({favoriteRestaurants.length})
        </ThemedText>
      </View>
    ) : null
  ), [favoriteRestaurants.length, handleRandomFromFavorites, randomPick, colors, animatedButtonStyle, aiAvailable, aiLoading, aiRecommendations, vectorCount, getRestaurantById, handleRecommendationPress, router]);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <IconSymbol name="fork.knife" size={28} color={colors.accent} />
        <ThemedText type="title" style={styles.title}>
          Favorites
        </ThemedText>
      </View>

      {favoriteRestaurants.length > 0 ? (
        <FlatList
          data={favoriteRestaurants}
          renderItem={renderFavorite}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <IconSymbol name="fork.knife" size={64} color={colors.border} />
          <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            No Favorites Yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Tap the utensils icon on any restaurant to save it here.
          </ThemedText>
          <Pressable
            onPress={() => router.push("/(tabs)/browse")}
            style={[styles.browseButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.browseButtonText}>
              Browse Restaurants
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: 32,
  },
  headerActions: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  randomButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  randomButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  randomPickBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  // AI Recommendations
  recommendationsSection: {
    marginTop: Spacing.lg,
  },
  recommendationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  recommendationsTitle: {
    marginBottom: 0,
  },
  aiLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  aiLoadingText: {
    fontSize: 14,
  },
  recommendationsList: {
    gap: Spacing.sm,
  },
  recommendationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  recommendationInfo: {
    flex: 1,
  },
  recommendationCuisine: {
    fontSize: 13,
    marginTop: 2,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    marginRight: Spacing.sm,
  },
  matchText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  noRecsText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  listTitle: {
    marginTop: Spacing.lg,
    marginLeft: Spacing.md,
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  // Favorite Item (notepad style)
  favoriteItem: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  favoriteHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  favoriteHeaderInfo: {
    flex: 1,
  },
  favoriteCuisine: {
    fontSize: 13,
    marginTop: 2,
  },
  favoriteDistance: {
    fontSize: 13,
    fontWeight: "500",
  },
  favoriteDetails: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
  },
  notesContainer: {
    marginTop: Spacing.sm,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesInput: {
    minHeight: 60,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  favoriteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  viewDetailsButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  viewDetailsText: {
    color: AppColors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  removeText: {
    fontWeight: "600",
    fontSize: 13,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    marginTop: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
    lineHeight: 22,
  },
  browseButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  browseButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
```

**Step 2: Commit**

```bash
git add app/\(tabs\)/favorites.tsx
git commit -m "feat: redesign favorites as structured notepad with expandable items and notes"
```

---

### Task 10: Final verification

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run tests if available**

```bash
npm test 2>/dev/null || npx jest --passWithNoTests
```

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address type errors from session 2 changes"
```
