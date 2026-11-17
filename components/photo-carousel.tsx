// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-YL2NDSQZXEO3
/**
 * Photo Carousel Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Horizontal scrollable photo gallery with pagination dots
 */

import { Image } from "expo-image";
import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const PHOTO_HEIGHT = 200;

interface PhotoCarouselProps {
  photos: string[];
  restaurantName?: string;
  /**
   * Called once per URL that fails to load, so the parent can drop it too
   * (e.g. hide the whole section when nothing is left to show).
   */
  onPhotoError?: (url: string) => void;
}

export function PhotoCarousel({ photos, restaurantName, onPhotoError }: PhotoCarouselProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  // Live window size, not a module-level Dimensions.get() snapshot: that one
  // is frozen at import time, so rotation, split-screen, foldables and
  // tablets kept the old width (or 0 when the app loaded in the background).
  const { width: screenWidth } = useWindowDimensions();
  const photoWidth = Math.max(0, screenWidth - Spacing.lg * 2);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  
  const flatListRef = useRef<FlatList>(null);
  const fullscreenListRef = useRef<FlatList>(null);

  // Search + merge can repeat the same photo_reference. Dedup so the
  // carousel never shows one image three times (CLAUDE.md Bug 1).
  // URLs that failed to load (expired Google photo reference, upstream 403,
  // offline). They are dropped from the carousel so a dead URL never renders
  // as a blank slide that still counts toward "3/10".
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const uniquePhotos = useMemo(
    () =>
      Array.from(new Set((photos || []).filter(Boolean))).filter(
        (p) => !failedPhotos.has(p)
      ),
    [photos, failedPhotos]
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  // Stable identity required: FlatList errors (and silently stops updating) if
  // onViewableItemsChanged / viewabilityConfig change between renders. The
  // inline object + inline fullscreen callback meant the fullscreen pager
  // counter never advanced on swipe.
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const onFullscreenViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setFullscreenIndex(viewableItems[0].index);
      }
    },
    []
  );

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const closeFullscreen = () => {
    setFullscreenVisible(false);
  };

  const lastPhotoIndex = Math.max(0, uniquePhotos.length - 1);
  const safeActiveIndex = Math.min(activeIndex, lastPhotoIndex);
  const safeFullscreenIndex = Math.min(fullscreenIndex, lastPhotoIndex);

  if (uniquePhotos.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface }]}>
        <IconSymbol name="photo.fill" size={32} color={colors.textSecondary} />
        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
          No photos available
        </ThemedText>
      </View>
    );
  }

  // A short stable key so FlatList recycles image views instead of
  // accumulating new native textures on every scroll.
  const renderPhoto = ({ item, index }: { item: string; index: number }) => (
    <Pressable
      onPress={() => openFullscreen(index)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo ${index + 1} of ${uniquePhotos.length}. Tap to enlarge.`}
    >
      <Image
        source={{ uri: item }}
        style={[styles.photo, { width: photoWidth }]}
        contentFit="cover"
        transition={200}
        recyclingKey={item}
        cachePolicy="memory-disk"
        accessibilityLabel={`Photo ${index + 1}`}
        onError={() => {
          // Broken image URL (expired Google photo reference, etc.) — log
          // once and drop it; expo-image's own fallback is a blank box.
          console.warn("[PhotoCarousel] image load failed", item);
          onPhotoError?.(item);
          setFailedPhotos((prev) => {
            if (prev.has(item)) return prev;
            const next = new Set(prev);
            next.add(item);
            return next;
          });
        }}
      />
    </Pressable>
  );

  const renderFullscreenPhoto = ({ item, index }: { item: string; index: number }) => (
    <View style={[styles.fullscreenPhotoContainer, { width: screenWidth }]}>
      <Image
        source={{ uri: item }}
        style={[styles.fullscreenPhoto, { width: screenWidth }]}
        contentFit="contain"
        transition={200}
        recyclingKey={item}
        cachePolicy="memory-disk"
        accessibilityLabel={`Photo ${index + 1} of ${uniquePhotos.length}`}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Photo Carousel */}
      <FlatList
        ref={flatListRef}
        data={uniquePhotos}
        renderItem={renderPhoto}
        // Use the photo URL as the key. Index-based keys cause React to
        // recycle the wrong Image instance when the photos array changes
        // (re-fetch reorders, server returns new URLs), producing a brief
        // flicker of the previous photo.
        keyExtractor={(item, index) => item || `photo-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        snapToInterval={photoWidth + Spacing.sm}
        extraData={photoWidth}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
      />

      {/* Pagination Dots */}
      {uniquePhotos.length > 1 && (
        <View style={styles.paginationContainer}>
          {uniquePhotos.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === safeActiveIndex ? colors.accent : colors.border,
                  width: index === safeActiveIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Photo Count Badge */}
      <View style={[styles.countBadge, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
        <IconSymbol name="photo.fill" size={12} color={AppColors.white} />
        <ThemedText style={styles.countText}>
          {safeActiveIndex + 1}/{uniquePhotos.length}
        </ThemedText>
      </View>

      {/* Fullscreen Modal */}
      <Modal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFullscreen}
      >
        <View style={[styles.fullscreenContainer, { backgroundColor: "rgba(0,0,0,0.95)" }]}>
          {/* Header */}
          <View style={[styles.fullscreenHeader, { paddingTop: insets.top + Spacing.sm }]}>
            <ThemedText style={styles.fullscreenTitle} numberOfLines={1}>
              {restaurantName || "Photos"}
            </ThemedText>
            <Pressable onPress={closeFullscreen} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close fullscreen view">
              <IconSymbol name="xmark" size={24} color={AppColors.white} />
            </Pressable>
          </View>

          {/* Fullscreen Photos */}
          <FlatList
            ref={fullscreenListRef}
            data={uniquePhotos}
            renderItem={renderFullscreenPhoto}
            keyExtractor={(item, index) => item ? `fullscreen-${item}` : `fullscreen-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={safeFullscreenIndex}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            extraData={screenWidth}
            onViewableItemsChanged={onFullscreenViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />

          {/* Fullscreen Pagination */}
          <View style={[styles.fullscreenPagination, { paddingBottom: insets.bottom + Spacing.md }]}>
            <ThemedText style={styles.fullscreenPaginationText}>
              {safeFullscreenIndex + 1} of {uniquePhotos.length}
            </ThemedText>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  photo: {
    height: PHOTO_HEIGHT,
    borderRadius: BorderRadius.md,
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  countBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.lg + Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  countText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    height: 120,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: 14,
  },
  fullscreenContainer: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  fullscreenTitle: {
    color: AppColors.white,
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  fullscreenPhotoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPhoto: {
    height: "100%",
  },
  fullscreenPagination: {
    alignItems: "center",
    paddingTop: Spacing.md,
  },
  fullscreenPaginationText: {
    color: AppColors.white,
    fontSize: 14,
  },
});
