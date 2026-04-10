/**
 * Menu Section Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Displays menu photos for a restaurant. Sources:
 * 1. Google Places photos (from restaurant data)
 * 2. User-uploaded photos (from R2 via API)
 * 3. External menu URL link
 */

import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getApiBaseUrl } from "@/constants/oauth";
import * as FileSystem from "expo-file-system";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_PHOTO_WIDTH = SCREEN_WIDTH * 0.75;
const MENU_PHOTO_HEIGHT = MENU_PHOTO_WIDTH * 1.3; // Menu aspect ratio (taller)

interface MenuSectionProps {
  restaurantId: string;
  restaurantName: string;
  menuUrl?: string;
  /** Menu photos — already classified as menu pages (up to 5). */
  menuPhotos?: string[];
  /**
   * True while the photo classifier is still running. When true we render
   * a "Searching for menu" spinner instead of any photos — this prevents
   * the old "flash non-menu photos then hide them" UX.
   */
  classifying?: boolean;
}

export function MenuSection({
  restaurantId,
  restaurantName,
  menuUrl,
  menuPhotos: externalMenuPhotos,
  classifying = false,
}: MenuSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const [apiMenuPhotos, setApiMenuPhotos] = useState<string[]>([]);

  // Fetch menu photos from worker API on mount
  useEffect(() => {
    let cancelled = false;
    const fetchMenuPhotos = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/menu/${restaurantId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.photos?.length) {
          setApiMenuPhotos(data.photos.map((p: any) => p.image_url));
        }
      } catch (e) {
        // Menu photos are supplementary -- don't block on failure
        console.warn('[MenuSection] Failed to fetch menu photos:', e);
      }
    };
    fetchMenuPhotos();
    return () => { cancelled = true; };
  }, [restaurantId]);

  const visionApiKey = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;

  const isMenuLike = useCallback(
    async (uri: string) => {
      if (!visionApiKey) return true;
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });

        const body = {
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        };

        const res = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) return true; // don't block on API errors
        const json = await res.json();
        const text =
          json?.responses?.[0]?.fullTextAnnotation?.text ||
          json?.responses?.[0]?.textAnnotations?.[0]?.description ||
          "";
        const charCount = text.replace(/\s+/g, "").length;
        // Require a modest amount of text to treat as a menu
        return charCount >= 40;
      } catch {
        return true; // allow if OCR fails
      }
    },
    [visionApiKey]
  );

  const filterMenuAssets = useCallback(
    async (uris: { uri: string }[]) => {
      if (!uris.length) return [];
      if (!visionApiKey) return uris;

      const approved: { uri: string }[] = [];
      for (const asset of uris) {
        const ok = await isMenuLike(asset.uri);
        if (ok) approved.push(asset);
      }
      return approved;
    },
    [isMenuLike, visionApiKey]
  );

  // Combine all menu photo sources — user uploads first (they're the most
  // recent user intent and must never be hidden behind the 5-cap), then R2
  // API photos, then classified Google photos. Dedupe + cap at 5.
  const allMenuPhotos = Array.from(
    new Set<string>([
      ...userPhotos,
      ...apiMenuPhotos,
      ...(externalMenuPhotos || []),
    ])
  ).slice(0, 5);

  // While the classifier is running and we have NO confirmed menu photos
  // yet (and no user uploads / API photos), render a "searching" state
  // instead of nothing — the section stays visible and the user sees progress.
  const isSearching =
    classifying &&
    allMenuPhotos.length === 0 &&
    userPhotos.length === 0 &&
    apiMenuPhotos.length === 0;

  const hasMenuContent = allMenuPhotos.length > 0 || menuUrl || isSearching;

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const handleUploadPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload menu images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });

    if (result.canceled) return;

    setUploading(true);
    try {
      const validAssets = await filterMenuAssets(result.assets);
      if (visionApiKey && !validAssets.length) {
        Alert.alert(
          "Not a menu",
          "We couldn't detect menu text in these photos. Please try another shot."
        );
        return;
      }

      const newPhotos = validAssets.map((a) => a.uri);
      setUserPhotos((prev) => [...prev, ...newPhotos]);
    } catch (error) {
      Alert.alert("Upload failed", "Could not upload menu photo. Try again later.");
    } finally {
      setUploading(false);
    }
  }, [restaurantId]);

  const handleTakePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to photograph menus.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (result.canceled) return;

    const valid = await filterMenuAssets(result.assets);
    if (visionApiKey && !valid.length) {
      Alert.alert(
        "Not a menu",
        "We couldn't detect menu text in this photo. Please try another shot."
      );
      return;
    }
    setUserPhotos((prev) => [...prev, ...valid.map((v) => v.uri)]);
  }, [filterMenuAssets, visionApiKey]);

  if (!hasMenuContent) {
    return null;
  }

  return (
    <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.sectionHeader}>
        <IconSymbol name="doc.text.fill" size={20} color={colors.accent} />
        <ThemedText type="subtitle" style={styles.sectionTitle}>Menu</ThemedText>
      </View>

      {/* Searching state — classifier still running, no photos yet */}
      {isSearching && (
        <View style={[styles.searchingBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ActivityIndicator size="small" color={colors.accent} />
          <ThemedText style={[styles.searchingText, { color: colors.textSecondary }]}>
            Searching for menu…
          </ThemedText>
        </View>
      )}

      {/* Menu Photo Carousel */}
      {!isSearching && allMenuPhotos.length > 0 && (
        <View style={styles.carouselContainer}>
          <FlatList
            data={allMenuPhotos}
            horizontal
            pagingEnabled={false}
            snapToInterval={MENU_PHOTO_WIDTH + Spacing.sm}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            keyExtractor={(item, index) => `menu-${index}`}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => openFullscreen(index)}>
                <Image
                  source={{ uri: item }}
                  style={styles.menuPhoto}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
            )}
          />
          {allMenuPhotos.length > 1 && (
            <View style={[styles.countBadge, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
              <IconSymbol name="doc.text.fill" size={10} color={AppColors.white} />
              <ThemedText style={styles.countText}>{allMenuPhotos.length} pages</ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.menuActions}>
        {menuUrl && (
          <Pressable
            onPress={() => Linking.openURL(menuUrl)}
            style={[styles.viewMenuButton, { backgroundColor: colors.accent }]}
          >
            <IconSymbol name="safari.fill" size={18} color={AppColors.white} />
            <ThemedText style={styles.viewMenuText}>View Full Menu</ThemedText>
          </Pressable>
        )}
        <View style={styles.uploadRow}>
          <Pressable
            onPress={handleUploadPhoto}
            disabled={uploading}
            style={[styles.addPhotoButton, { borderColor: colors.accent }]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <IconSymbol name="photo.badge.plus" size={16} color={colors.accent} />
                <ThemedText style={[styles.addPhotoText, { color: colors.accent }]}>
                  Add Photo
                </ThemedText>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={handleTakePhoto}
            style={[styles.cameraButton, { borderColor: colors.accent }]}
          >
            <IconSymbol name="camera.fill" size={16} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      {/* Fullscreen Modal */}
      <Modal visible={fullscreenVisible} transparent animationType="fade" onRequestClose={() => setFullscreenVisible(false)}>
        <View style={[styles.fullscreenContainer, { backgroundColor: "rgba(0,0,0,0.95)" }]}>
          <View style={[styles.fullscreenHeader, { paddingTop: insets.top + Spacing.sm }]}>
            <ThemedText style={styles.fullscreenTitle} numberOfLines={1}>
              {restaurantName} — Menu
            </ThemedText>
            <Pressable onPress={() => setFullscreenVisible(false)} style={styles.closeButton}>
              <IconSymbol name="xmark" size={24} color={AppColors.white} />
            </Pressable>
          </View>
          <FlatList
            data={allMenuPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={fullscreenIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            keyExtractor={(_, index) => `fs-menu-${index}`}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Image source={{ uri: item }} style={{ width: SCREEN_WIDTH, height: "100%" }} contentFit="contain" />
              </View>
            )}
          />
          <View style={[styles.fullscreenPagination, { paddingBottom: insets.bottom + Spacing.md }]}>
            <ThemedText style={styles.paginationText}>
              {fullscreenIndex + 1} of {allMenuPhotos.length}
            </ThemedText>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: 0,
    marginLeft: Spacing.xs,
  },
  carouselContainer: {
    position: "relative",
    marginBottom: Spacing.sm,
  },
  searchingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    marginBottom: Spacing.sm,
  },
  searchingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  carouselContent: {
    gap: Spacing.sm,
  },
  menuPhoto: {
    width: MENU_PHOTO_WIDTH,
    height: MENU_PHOTO_HEIGHT,
    borderRadius: BorderRadius.md,
  },
  countBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  countText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "600",
  },
  noMenuText: {
    marginBottom: Spacing.sm,
    fontSize: 14,
  },
  menuActions: {
    gap: Spacing.sm,
  },
  viewMenuButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  viewMenuText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  uploadRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  uploadButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  uploadButtonText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  addPhotoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 6,
  },
  addPhotoText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cameraButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
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
  fullscreenPagination: {
    alignItems: "center",
    paddingTop: Spacing.md,
  },
  paginationText: {
    color: AppColors.white,
    fontSize: 14,
  },
});
