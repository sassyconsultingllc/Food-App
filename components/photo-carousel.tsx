/**
 * Photo Carousel Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Horizontal scrollable photo gallery with pagination dots
 */

import { Image } from "expo-image";
import React, { useState, useRef, useCallback } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PHOTO_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const PHOTO_HEIGHT = 200;

interface PhotoCarouselProps {
  photos: string[];
  restaurantName?: string;
}

export function PhotoCarousel({ photos, restaurantName }: PhotoCarouselProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  
  const flatListRef = useRef<FlatList>(null);
  const fullscreenListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const closeFullscreen = () => {
    setFullscreenVisible(false);
  };

  if (!photos || photos.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface }]}>
        <IconSymbol name="photo.fill" size={32} color={colors.textSecondary} />
        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
          No photos available
        </ThemedText>
      </View>
    );
  }

  const renderPhoto = ({ item, index }: { item: string; index: number }) => (
    <Pressable onPress={() => openFullscreen(index)}>
      <Image
        source={{ uri: item }}
        style={styles.photo}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  );

  const renderFullscreenPhoto = ({ item }: { item: string }) => (
    <View style={styles.fullscreenPhotoContainer}>
      <Image
        source={{ uri: item }}
        style={styles.fullscreenPhoto}
        contentFit="contain"
        transition={200}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Photo Carousel */}
      <FlatList
        ref={flatListRef}
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={(item, index) => `photo-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        snapToInterval={PHOTO_WIDTH + Spacing.sm}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
      />

      {/* Pagination Dots */}
      {photos.length > 1 && (
        <View style={styles.paginationContainer}>
          {photos.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === activeIndex ? colors.accent : colors.border,
                  width: index === activeIndex ? 20 : 8,
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
          {activeIndex + 1}/{photos.length}
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
            <Pressable onPress={closeFullscreen} style={styles.closeButton}>
              <IconSymbol name="xmark" size={24} color={AppColors.white} />
            </Pressable>
          </View>

          {/* Fullscreen Photos */}
          <FlatList
            ref={fullscreenListRef}
            data={photos}
            renderItem={renderFullscreenPhoto}
            keyExtractor={(item, index) => `fullscreen-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={fullscreenIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                setFullscreenIndex(viewableItems[0].index);
              }
            }}
            viewabilityConfig={viewabilityConfig}
          />

          {/* Fullscreen Pagination */}
          <View style={[styles.fullscreenPagination, { paddingBottom: insets.bottom + Spacing.md }]}>
            <ThemedText style={styles.fullscreenPaginationText}>
              {fullscreenIndex + 1} of {photos.length}
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
    width: PHOTO_WIDTH,
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
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPhoto: {
    width: SCREEN_WIDTH,
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
