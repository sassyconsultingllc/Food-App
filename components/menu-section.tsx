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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_PHOTO_WIDTH = SCREEN_WIDTH * 0.75;
const MENU_PHOTO_HEIGHT = MENU_PHOTO_WIDTH * 1.3; // Menu aspect ratio (taller)

interface MenuSectionProps {
  restaurantId: string;
  restaurantName: string;
  latitude: number;
  longitude: number;
  /**
   * Restaurant homepage URL (the scraper currently sets restaurant.menu.url
   * to this — it is NOT a menu URL yet). The component runs discovery
   * against this to find the real menu page or PDF.
   */
  website?: string;
  /**
   * Optional already-known menu URL. If discovery doesn't find a better
   * one, this is used as a last-resort fallback (rendered as "Visit
   * Website", not "View Menu", so the button is honest).
   */
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
  latitude,
  longitude,
  website,
  menuUrl,
  menuPhotos: externalMenuPhotos,
  classifying = false,
}: MenuSectionProps) {
  // User photos are stored anonymously, keyed by the restaurant's server-side
  // bucket (from name + coords). Without coords we can't form the identity.
  const hasCoords =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  // apiMenuPhotos holds user-uploaded + website-scraped photos from the
  // /api/menu/:restaurantId endpoint. They persist across app launches
  // and are visible to other users.
  const [apiMenuPhotos, setApiMenuPhotos] = useState<string[]>([]);
  // Discovery results — the worker crawls the restaurant website to find
  // the real menu page (or PDF) and any embedded menu images. Null means
  // discovery hasn't returned yet; an object (possibly with no menuUrl)
  // means it has.
  const [discovery, setDiscovery] = useState<{
    menuUrl?: string;
    isPdf: boolean;
  } | null>(null);
  const [discovering, setDiscovering] = useState(false);

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

  // Fetch anonymous community photos (bucket-keyed) and merge them in.
  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const qs = `name=${encodeURIComponent(restaurantName)}&lat=${latitude}&lng=${longitude}`;
        const res = await fetch(`${baseUrl}/api/community/photos?${qs}`);
        if (!res.ok) return;
        const data = (await res.json()) as { photos?: { url: string }[] };
        if (!cancelled && data.photos?.length) {
          setApiMenuPhotos((prev) =>
            Array.from(new Set<string>([...prev, ...data.photos!.map((p) => p.url)]))
          );
        }
      } catch {
        /* supplementary — don't block on failure */
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantName, latitude, longitude, hasCoords]);

  // Kick off discovery against the restaurant website. Persists scraped
  // images into menu_photos server-side, and returns the resolved menu
  // URL + images directly so we can append them to apiMenuPhotos without
  // waiting for a refetch round-trip.
  useEffect(() => {
    if (!website) {
      setDiscovery({ isPdf: false });
      return;
    }
    let cancelled = false;
    setDiscovering(true);
    (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/menu/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId, website }),
        });
        if (!res.ok) {
          if (!cancelled) setDiscovery({ isPdf: false });
          return;
        }
        const data = (await res.json()) as {
          menuUrl?: string;
          isPdf?: boolean;
          images?: string[];
        };
        if (cancelled) return;
        setDiscovery({ menuUrl: data.menuUrl, isPdf: !!data.isPdf });
        if (data.images?.length) {
          setApiMenuPhotos((prev) => {
            const merged = new Set<string>([...prev, ...data.images!]);
            return Array.from(merged);
          });
        }
      } catch (e) {
        console.warn("[MenuSection] discovery failed:", e);
        if (!cancelled) setDiscovery({ isPdf: false });
      } finally {
        if (!cancelled) setDiscovering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId, website]);

  // Previously this component did a client-side Vision OCR call to
  // pre-check whether the user-picked asset was a menu. That required
  // shipping the Google Vision API key in every installed APK
  // (EXPO_PUBLIC_GOOGLE_VISION_API_KEY), which was a B1 audit finding.
  // The key is now server-only — Vision calls happen exclusively through
  // /api/vision/classify in the worker. Client-side pre-check has been
  // removed; the worker's upload endpoint can add server-side OCR
  // validation in a future pass if false-uploads become a problem.
  const filterMenuAssets = useCallback(
    async (uris: { uri: string }[]) => uris,
    []
  );

  // Combine all menu photo sources — user-uploaded + website-scraped
  // (apiMenuPhotos) first so they take priority over Vision-classified
  // Google photos. Dedupe + cap at 5.
  const allMenuPhotos = Array.from(
    new Set<string>([
      ...apiMenuPhotos,
      ...(externalMenuPhotos || []),
    ])
  ).slice(0, 5);

  // While EITHER the Vision classifier OR the website crawl is still
  // running and we have no photos yet, render a "searching" state instead
  // of flashing arbitrary photos.
  const isSearching =
    (classifying || discovering) &&
    allMenuPhotos.length === 0 &&
    apiMenuPhotos.length === 0;

  // Pick the URL the action button should open. Priority:
  //   1. Discovered menu URL (real /menu page or PDF)
  //   2. Caller-provided menuUrl (legacy fallback — usually homepage)
  //   3. The website prop (homepage)
  const resolvedMenuUrl = discovery?.menuUrl;
  const fallbackUrl = menuUrl || website;
  const actionUrl = resolvedMenuUrl || fallbackUrl;

  // Always render the section once we have a restaurantId — even with no
  // photos, no discovered menu, and no website, the user should still be
  // able to tap Upload/Camera to contribute a menu photo. Previously the
  // whole section disappeared for restaurants without websites (e.g. CUT
  // Beverly Hills) which silently removed the upload affordance for the
  // exact restaurants that need it most.
  const hasMenuContent = !!restaurantId;

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  /**
   * Upload one or more menu photos to the worker.
   *
   * The worker accepts multipart/form-data at POST /api/menu/:restaurantId/upload,
   * validates each file's MIME type and size, stores it in R2, writes
   * metadata to D1, and returns an array of public image URLs. We then
   * append those URLs to apiMenuPhotos so they show up immediately without
   * waiting for the next mount-time fetch.
   */
  const uploadAssetsToServer = useCallback(
    async (assets: { uri: string; mimeType?: string | null; fileName?: string | null }[]) => {
      if (!assets.length) return [] as string[];
      if (!hasCoords) {
        throw new Error("Photos can't be added for this place yet.");
      }

      const baseUrl = getApiBaseUrl();
      const uploaded: string[] = [];

      // Anonymous community upload: one image per request to POST
      // /api/community/photo. The worker strips EXIF, computes the opaque
      // bucket from {name,lat,lng}, runs SafeSearch + a menu-classifier gate,
      // and stores it under the bucket. No restaurant identity is persisted.
      for (const asset of assets) {
        const mimeType = asset.mimeType || "image/jpeg";
        const extFromMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
        const ext = extFromMime[mimeType] || "jpg";

        const form = new FormData();
        form.append("name", restaurantName);
        form.append("lat", String(latitude));
        form.append("lng", String(longitude));
        // React Native's FormData takes { uri, name, type } objects
        form.append("image", {
          uri: asset.uri,
          name: asset.fileName || `menu_${Date.now()}.${ext}`,
          type: mimeType,
        } as unknown as Blob);

        const res = await fetch(`${baseUrl}/api/community/photo`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          // Map by status; for 400 (gate rejections: not-a-menu / flagged /
          // unsupported) surface the server's user-safe reason.
          let friendly: string;
          if (res.status === 429) {
            friendly = "You're uploading too fast. Please wait a moment and try again.";
          } else if (res.status === 413) {
            friendly = "That photo is too large to upload.";
          } else if (res.status >= 500) {
            friendly = "Menu uploads are temporarily unavailable. Please try again later.";
          } else {
            try {
              const d = (await res.json()) as { error?: string };
              friendly = d.error || "Couldn't upload the photo. Please try again.";
            } catch {
              friendly = "Couldn't upload the photo. Please try again.";
            }
          }
          console.warn("[community-upload] failed", res.status);
          throw new Error(friendly);
        }

        // The endpoint returns no identity-linkable URL; show the local image
        // immediately — the next community fetch replaces it with the stored one.
        uploaded.push(asset.uri);
      }

      return uploaded;
    },
    [restaurantName, latitude, longitude, hasCoords]
  );

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
      if (!validAssets.length) return;

      const uploadedUrls = await uploadAssetsToServer(validAssets);
      setApiMenuPhotos((prev) => [...uploadedUrls, ...prev]);
      Alert.alert(
        "Menu photos shared",
        `Uploaded ${uploadedUrls.length} photo${uploadedUrls.length === 1 ? "" : "s"} for other diners to see.`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert("Upload failed", msg || "Could not upload menu photo. Try again later.");
    } finally {
      setUploading(false);
    }
  }, [filterMenuAssets, uploadAssetsToServer]);

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

    setUploading(true);
    try {
      const valid = await filterMenuAssets(result.assets);
      if (!valid.length) return;

      const uploadedUrls = await uploadAssetsToServer(valid);
      setApiMenuPhotos((prev) => [...uploadedUrls, ...prev]);
      Alert.alert(
        "Menu photo shared",
        "Your photo was uploaded and is now visible to other diners."
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert("Upload failed", msg || "Could not upload menu photo. Try again later.");
    } finally {
      setUploading(false);
    }
  }, [filterMenuAssets, uploadAssetsToServer]);

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
            // URL-based key. Index keys cause Image recycling to misfire
            // when the photos array reorders or items get added/removed,
            // visible as a flicker of the previous image.
            keyExtractor={(item, index) =>
              typeof item === "string" && item.length > 0 ? item : `menu-${index}`
            }
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
        {/* Primary CTA. Priority:
            1. Photos in-app → "View Full Menu (N pages)" → in-app viewer.
            2. Discovered PDF → "Open Menu PDF" → external opener.
            3. Discovered /menu page → "View Menu Page" → external opener.
            4. Just the homepage → "Visit Website" — honest fallback so
               users aren't told "View Menu" while we open the homepage. */}
        {allMenuPhotos.length > 0 ? (
          <Pressable
            onPress={() => openFullscreen(0)}
            style={[styles.viewMenuButton, { backgroundColor: colors.accent }]}
          >
            <IconSymbol name="doc.text.magnifyingglass" size={18} color={AppColors.white} />
            <ThemedText style={styles.viewMenuText}>
              View Full Menu ({allMenuPhotos.length} {allMenuPhotos.length === 1 ? "page" : "pages"})
            </ThemedText>
          </Pressable>
        ) : resolvedMenuUrl && discovery?.isPdf ? (
          <Pressable
            onPress={() => Linking.openURL(resolvedMenuUrl)}
            style={[styles.viewMenuButton, { backgroundColor: colors.accent }]}
          >
            <IconSymbol name="doc.richtext" size={18} color={AppColors.white} />
            <ThemedText style={styles.viewMenuText}>Open Menu PDF</ThemedText>
          </Pressable>
        ) : resolvedMenuUrl ? (
          <Pressable
            onPress={() => Linking.openURL(resolvedMenuUrl)}
            style={[styles.viewMenuButton, { backgroundColor: colors.accent }]}
          >
            <IconSymbol name="doc.text.fill" size={18} color={AppColors.white} />
            <ThemedText style={styles.viewMenuText}>View Menu Page</ThemedText>
          </Pressable>
        ) : fallbackUrl ? (
          <Pressable
            onPress={() => Linking.openURL(fallbackUrl)}
            style={[styles.viewMenuButton, { backgroundColor: colors.accent }]}
          >
            <IconSymbol name="safari.fill" size={18} color={AppColors.white} />
            <ThemedText style={styles.viewMenuText}>Visit Website</ThemedText>
          </Pressable>
        ) : !isSearching ? (
          // No photos, no discovered menu, no website fallback — prompt
          // the user to be the first to upload a menu photo. Without this
          // the section would just show bare Upload/Camera buttons with
          // no context.
          <View style={[styles.emptyHint, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <IconSymbol name="doc.text" size={20} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyHintText, { color: colors.textSecondary }]}>
              No menu found yet — be the first to share one.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.uploadRow}>
          <Pressable
            onPress={handleUploadPhoto}
            disabled={uploading}
            style={({ pressed }) => [
              styles.halfButton,
              { borderColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <IconSymbol name="photo.badge.plus" size={16} color={colors.accent} />
                <ThemedText style={[styles.halfButtonText, { color: colors.accent }]}>
                  Upload
                </ThemedText>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={handleTakePhoto}
            disabled={uploading}
            style={({ pressed }) => [
              styles.halfButton,
              { borderColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <IconSymbol name="camera.fill" size={16} color={colors.accent} />
            <ThemedText style={[styles.halfButtonText, { color: colors.accent }]}>
              Camera
            </ThemedText>
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
            keyExtractor={(item, index) =>
              typeof item === "string" && item.length > 0 ? `fs-${item}` : `fs-menu-${index}`
            }
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
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyHintText: {
    fontSize: 13,
    flexShrink: 1,
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
  halfButton: {
    flex: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 6,
    minHeight: 44,
  },
  halfButtonText: {
    fontSize: 14,
    fontWeight: "600",
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
