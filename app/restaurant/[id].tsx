/**
 * Restaurant Detail Screen - with AI "More Like This"
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhotoCarousel } from "@/components/photo-carousel";
import { MenuSection } from "@/components/menu-section";
import { PublicNotesSection } from "@/components/public-notes-section";
import { PersonalNotesModal } from "@/components/personal-notes-modal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useClassifiedPhotos } from "@/hooks/use-classified-photos";
import { useSimilarRestaurants, useVectorStats } from "@/hooks/use-semantic-search";
import { shareRestaurant } from "@/utils/share-utils";
import { formatDisplayAddress, formatMapsAddress } from "@/utils/address-utils";

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { getRestaurantById, isFavorite, toggleFavorite, getFavoriteRestaurants, loading: dataLoading, updateRestaurantNotes, getRestaurantNotes } = useRestaurantStorage();
  const { addToRecentlyViewed, recentlyViewedIds } = useRecentlyViewed();

  // AI Similar Restaurants
  const { findSimilar, results: similarResults, loading: similarLoading, clear: clearSimilar } = useSimilarRestaurants();
  const { available: aiAvailable } = useVectorStats();

  const restaurant = getRestaurantById(id);

  // Classify photos into food/menu buckets via Vision OCR (cached)
  const {
    foodPhotos,
    menuPhotos: classifiedMenuPhotos,
    loading: classifyingPhotos,
  } = useClassifiedPhotos(restaurant?.photos);

  // Personal notes
  const currentNotes = restaurant ? (getRestaurantNotes(restaurant.id) || '') : '';
  const [notesModalVisible, setNotesModalVisible] = useState(false);

  // Track this restaurant as recently viewed — only after data has loaded
  useEffect(() => {
    if (id && restaurant) {
      addToRecentlyViewed(id);
    }
  }, [id, restaurant, addToRecentlyViewed]);

  // Find similar restaurants when id, restaurant, or AI availability changes.
  // Keyed on !!restaurant (not restaurant itself) so late-loading restaurant
  // data triggers the fetch instead of being skipped because id was stable.
  // getFavoriteRestaurants and recentlyViewedIds are intentionally excluded
  // from deps — they produce new array references every render and would
  // cause an infinite loop.
  const restaurantReady = !!restaurant;
  useEffect(() => {
    if (id && restaurantReady && aiAvailable) {
      const favoriteIds = getFavoriteRestaurants().map(f => f.id);
      const excludeIds = [id, ...favoriteIds, ...recentlyViewedIds.filter(r => r !== id)];
      findSimilar(id, excludeIds);
    }
    return () => clearSimilar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, restaurantReady, aiAvailable]);

  // LOADING STATE: Don't show "not found" while data is still loading
  if (!restaurant && dataLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <ThemedText style={{ color: colors.textSecondary, marginTop: Spacing.md }}>
            Loading restaurant...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Only show "not found" AFTER loading is complete and restaurant genuinely doesn't exist
  if (!restaurant) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <ThemedText type="subtitle">Restaurant not found</ThemedText>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const favorite = isFavorite(restaurant.id);

  const handleFavoritePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleFavorite(restaurant);
  };

  const handlePhonePress = () => {
    if (restaurant.phone) {
      Linking.openURL(`tel:${restaurant.phone}`);
    }
  };

  const handleWebsitePress = () => {
    if (restaurant.website) {
      Linking.openURL(restaurant.website);
    }
  };

  const handleAddressPress = () => {
    const address = encodeURIComponent(
      formatMapsAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)
    );
    Linking.openURL(`https://maps.google.com/?q=${address}`);
  };

  const handleSharePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await shareRestaurant(restaurant);
  };

  const handleSimilarPress = (similarId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/restaurant/${similarId}`);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header Image — prefer classified food photo over any menu page */}
      <View style={styles.headerImage}>
        {(restaurant.imageUrl || foodPhotos.length > 0 || (restaurant.photos && restaurant.photos.length > 0)) ? (
          <Image
            source={{ uri: restaurant.imageUrl || foodPhotos[0] || restaurant.photos![0] }}
            style={styles.image}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.headerBackground }]}>
            <IconSymbol name="fork.knife" size={64} color={colors.textSecondary} />
          </View>
        )}
        
        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.headerButton, styles.backHeaderButton, { top: insets.top + 8 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={AppColors.charcoal} />
        </Pressable>

        {/* Share Button */}
        <Pressable
          onPress={handleSharePress}
          style={[styles.headerButton, styles.shareHeaderButton, { top: insets.top + 8 }]}
        >
          <IconSymbol name="square.and.arrow.up" size={22} color={AppColors.charcoal} />
        </Pressable>

        {/* Favorite Button */}
        <Pressable
          onPress={handleFavoritePress}
          style={[styles.headerButton, styles.favoriteHeaderButton, { top: insets.top + 8 }]}
        >
          <IconSymbol
            name={favorite ? "fork.knife.circle.fill" : "fork.knife"}
            size={24}
            color={favorite ? AppColors.copper : AppColors.slateGray}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Restaurant Name & Type */}
        <View style={styles.titleSection}>
          <ThemedText type="title" style={styles.restaurantName}>
            {restaurant.name}
          </ThemedText>
          <View style={styles.cuisineRow}>
            <ThemedText style={[styles.cuisineType, { color: colors.textSecondary }]}>
              {restaurant.cuisineType}
            </ThemedText>
            {(restaurant.ratings?.aggregated ?? 0) > 0 && (
              <View style={[styles.ratingBadgeLarge, { backgroundColor: AppColors.skyBlue }]}>
                <IconSymbol name="star.fill" size={16} color={AppColors.white} />
                <ThemedText style={styles.ratingTextLarge}>
                  {restaurant.ratings!.aggregated.toFixed(1)}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Culvers Flavor of the Day */}
        {restaurant.isCulvers && restaurant.flavorOfTheDay && (
          <View style={[styles.section, styles.flavorSection, { backgroundColor: AppColors.copper }]}>
            <View style={styles.flavorHeader}>
              <IconSymbol name="flame.fill" size={24} color={AppColors.white} />
              <ThemedText style={styles.flavorTitle}>Flavor of the Day</ThemedText>
            </View>
            <ThemedText style={styles.flavorName}>{restaurant.flavorOfTheDay}</ThemedText>
            {restaurant.flavorDescription && (
              <ThemedText style={styles.flavorDescription}>
                {restaurant.flavorDescription}
              </ThemedText>
            )}
          </View>
        )}

        {/* Daily Special */}
        {restaurant.dailySpecial && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <IconSymbol name="sparkles" size={20} color={AppColors.lightOrange} />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Today's Special
              </ThemedText>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.specialTitle}>
              {restaurant.dailySpecial.title}
            </ThemedText>
            <ThemedText style={[styles.specialDescription, { color: colors.textSecondary }]}>
              {restaurant.dailySpecial.description}
            </ThemedText>
          </View>
        )}

        {/* Contact Info */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Contact & Location
          </ThemedText>
          
          <Pressable onPress={handleAddressPress} style={styles.contactRow}>
            <IconSymbol name="mappin.and.ellipse" size={20} color={colors.accent} />
            <View style={styles.contactText}>
              <ThemedText>
                {formatDisplayAddress(restaurant.address, restaurant.city, restaurant.state, restaurant.zipCode)}
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>

          {restaurant.phone && (
            <Pressable onPress={handlePhonePress} style={styles.contactRow}>
              <IconSymbol name="phone.fill" size={20} color={colors.accent} />
              <ThemedText style={styles.contactText}>{restaurant.phone}</ThemedText>
              <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
            </Pressable>
          )}

          {restaurant.website && (
            <Pressable onPress={handleWebsitePress} style={styles.contactRow}>
              <IconSymbol name="globe" size={20} color={colors.accent} />
              <ThemedText style={[styles.contactText, { color: colors.tint }]} numberOfLines={1}>
                Visit Website
              </ThemedText>
              <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
            </Pressable>
          )}

          {restaurant.yelpUrl && (
            <Pressable 
              onPress={() => Linking.openURL(restaurant.yelpUrl!)} 
              style={styles.contactRow}
            >
              <IconSymbol name="star.circle.fill" size={20} color="#d32323" />
              <ThemedText style={[styles.contactText, { color: colors.tint }]} numberOfLines={1}>
                View on Yelp
              </ThemedText>
              <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
            </Pressable>
          )}

          {restaurant.googleMapsUrl && (
            <Pressable 
              onPress={() => Linking.openURL(restaurant.googleMapsUrl!)} 
              style={styles.contactRow}
            >
              <IconSymbol name="map.fill" size={20} color="#4285f4" />
              <ThemedText style={[styles.contactText, { color: colors.tint }]} numberOfLines={1}>
                View on Google Maps
              </ThemedText>
              <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Photo Gallery — food/ambiance photos only (menus filtered out) */}
        {foodPhotos.length > 0 && (
          <View style={styles.photosSection}>
            <View style={[styles.sectionHeader, { paddingHorizontal: Spacing.lg }]}>
              <IconSymbol name="photo.fill" size={20} color={colors.accent} />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Photos
              </ThemedText>
            </View>
            <PhotoCarousel photos={foodPhotos} restaurantName={restaurant.name} />
          </View>
        )}

        {/* Menu Section — classified menu photos (up to 5).
            While the classifier is running, the section shows a
            "Searching for menu…" spinner instead of flashing arbitrary photos. */}
        <MenuSection
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          menuUrl={restaurant.menu?.url}
          menuPhotos={classifiedMenuPhotos}
          classifying={classifyingPhotos}
        />

        {/* Personal Notes — tap to open the modal with quick-note chips. */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="note.text" size={20} color={AppColors.lightOrange} />
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              My Notes
            </ThemedText>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotesModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={currentNotes ? "Edit personal note" : "Add personal note"}
            style={({ pressed }) => [
              styles.inlineNoteInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.9 : 1,
                minHeight: 56,
                justifyContent: "center",
              },
            ]}
          >
            {currentNotes ? (
              <ThemedText style={{ color: colors.text }}>{currentNotes}</ThemedText>
            ) : (
              <ThemedText style={{ color: colors.textSecondary }}>
                Tap to add a private note (e.g. &quot;get the fish tacos&quot;)
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Community Tips — full modal with suggestions */}
        <PublicNotesSection
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
        />

        {/* Ratings Breakdown — shows actual scraper sources (Google / Foursquare / HERE) */}
        {(restaurant.ratings?.google || restaurant.ratings?.foursquare || restaurant.ratings?.here) && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Ratings
            </ThemedText>

            <View style={styles.ratingsGrid}>
              {restaurant.ratings.google != null && (
                <View style={styles.ratingItem}>
                  <ThemedText style={styles.ratingSource}>Google</ThemedText>
                  <View style={styles.ratingValue}>
                    <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
                    <ThemedText type="defaultSemiBold">{restaurant.ratings.google.toFixed(1)}</ThemedText>
                  </View>
                  {restaurant.ratings.googleReviewCount ? (
                    <ThemedText style={[styles.ratingSource, { color: colors.textSecondary }]}>
                      {restaurant.ratings.googleReviewCount.toLocaleString()} reviews
                    </ThemedText>
                  ) : null}
                </View>
              )}
              {restaurant.ratings.foursquare != null && (
                <View style={styles.ratingItem}>
                  <ThemedText style={styles.ratingSource}>Foursquare</ThemedText>
                  <View style={styles.ratingValue}>
                    <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
                    <ThemedText type="defaultSemiBold">{restaurant.ratings.foursquare.toFixed(1)}</ThemedText>
                  </View>
                  {restaurant.ratings.foursquareReviewCount ? (
                    <ThemedText style={[styles.ratingSource, { color: colors.textSecondary }]}>
                      {restaurant.ratings.foursquareReviewCount.toLocaleString()} reviews
                    </ThemedText>
                  ) : null}
                </View>
              )}
              {restaurant.ratings.here != null && (
                <View style={styles.ratingItem}>
                  <ThemedText style={styles.ratingSource}>HERE</ThemedText>
                  <View style={styles.ratingValue}>
                    <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
                    <ThemedText type="defaultSemiBold">{restaurant.ratings.here.toFixed(1)}</ThemedText>
                  </View>
                  {restaurant.ratings.hereReviewCount ? (
                    <ThemedText style={[styles.ratingSource, { color: colors.textSecondary }]}>
                      {restaurant.ratings.hereReviewCount.toLocaleString()} reviews
                    </ThemedText>
                  ) : null}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Sentiment Analysis / Review Summary */}
        {restaurant.sentiment && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <IconSymbol 
                name={restaurant.sentiment.sentiment === 'positive' ? 'hand.thumbsup.fill' : 
                      restaurant.sentiment.sentiment === 'negative' ? 'hand.thumbsdown.fill' : 'hand.raised.fill'} 
                size={20} 
                color={restaurant.sentiment.sentiment === 'positive' ? AppColors.skyBlue : 
                       restaurant.sentiment.sentiment === 'negative' ? AppColors.copper : AppColors.lightOrange} 
              />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                What People Say
              </ThemedText>
            </View>
            
            {/* Sentiment Badge */}
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
          </View>
        )}

        {/* ============================================================ */}
        {/* AI-POWERED "MORE LIKE THIS" SECTION */}
        {/* ============================================================ */}
        {aiAvailable && (similarResults.length > 0 || similarLoading) && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <IconSymbol name="sparkles" size={20} color={AppColors.copper} />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                More Like This
              </ThemedText>
            </View>
            
            {similarLoading ? (
              <View style={styles.similarLoading}>
                <ActivityIndicator size="small" color={AppColors.copper} />
                <ThemedText style={[styles.similarLoadingText, { color: colors.textSecondary }]}>
                  Finding similar restaurants...
                </ThemedText>
              </View>
            ) : (
              <View style={styles.similarList}>
                {similarResults.map((result) => {
                  const similarRestaurant = result.restaurant || getRestaurantById(result.id);
                  if (!similarRestaurant) return null;
                  
                  return (
                    <Pressable
                      key={result.id}
                      onPress={() => handleSimilarPress(result.id)}
                      style={[styles.similarItem, { borderBottomColor: colors.border }]}
                    >
                      {(similarRestaurant.imageUrl || similarRestaurant.photos?.[0]) ? (
                        <Image
                          source={{ uri: similarRestaurant.imageUrl || similarRestaurant.photos![0] }}
                          style={styles.similarImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.similarImagePlaceholder, { backgroundColor: colors.surface }]}>
                          <IconSymbol name="fork.knife" size={20} color={colors.textSecondary} />
                        </View>
                      )}
                      <View style={styles.similarInfo}>
                        <ThemedText type="defaultSemiBold" numberOfLines={1}>
                          {similarRestaurant.name}
                        </ThemedText>
                        <ThemedText style={[styles.similarCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
                          {similarRestaurant.cuisineType}
                        </ThemedText>
                        <View style={styles.similarMeta}>
                          <View style={[styles.matchBadge, { backgroundColor: AppColors.copper }]}>
                            <ThemedText style={styles.matchText}>
                              {Math.round(result.score * 100)}% match
                            </ThemedText>
                          </View>
                          {similarRestaurant.priceRange && (
                            <ThemedText style={[styles.similarPrice, { color: colors.textSecondary }]}>
                              {similarRestaurant.priceRange}
                            </ThemedText>
                          )}
                        </View>
                      </View>
                      <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}


        {/* Delivery & Ordering Options */}
        {(restaurant.doordashUrl || restaurant.ubereatsUrl || restaurant.grubhubUrl || restaurant.phone) && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Order Now
            </ThemedText>
            
            {restaurant.phone && (
              <Pressable 
                onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
                style={styles.orderOption}
              >
                <IconSymbol name="phone.fill" size={20} color={colors.accent} />
                <ThemedText style={styles.orderOptionText}>Call to Order</ThemedText>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            
            {restaurant.website && (
              <Pressable 
                onPress={() => Linking.openURL(restaurant.website!)}
                style={styles.orderOption}
              >
                <IconSymbol name="globe" size={20} color={colors.accent} />
                <ThemedText style={styles.orderOptionText}>Order Direct</ThemedText>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            
            {restaurant.doordashUrl && (
              <Pressable 
                onPress={() => Linking.openURL(restaurant.doordashUrl!)}
                style={styles.orderOption}
              >
                <IconSymbol name="car.fill" size={20} color="#FF3008" />
                <ThemedText style={styles.orderOptionText}>Find on DoorDash</ThemedText>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            
            {restaurant.ubereatsUrl && (
              <Pressable 
                onPress={() => Linking.openURL(restaurant.ubereatsUrl!)}
                style={styles.orderOption}
              >
                <IconSymbol name="car.fill" size={20} color="#06C167" />
                <ThemedText style={styles.orderOptionText}>Find on Uber Eats</ThemedText>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            
            {restaurant.grubhubUrl && (
              <Pressable 
                onPress={() => Linking.openURL(restaurant.grubhubUrl!)}
                style={styles.orderOption}
              >
                <IconSymbol name="car.fill" size={20} color="#F63440" />
                <ThemedText style={styles.orderOptionText}>Find on Grubhub</ThemedText>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}

        {/* Hours of Operation */}
        {restaurant.hours && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Hours
            </ThemedText>
            
            {Object.entries(restaurant.hours).map(([day, hours]) => (
              <View key={day} style={styles.hoursRow}>
                <ThemedText style={styles.dayText}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary }}>{hours}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {restaurant.description && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              About
            </ThemedText>
            <ThemedText style={{ color: colors.textSecondary, lineHeight: 22 }}>
              {restaurant.description}
            </ThemedText>
          </View>
        )}

        {/* Copyright Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
            © 2025 Sassy Consulting
          </ThemedText>
          <ThemedText style={[styles.footerSubtext, { color: colors.accent }]}>
            A Veteran Owned Company
          </ThemedText>
        </View>
      </ScrollView>

      {/* Personal notes editor with quick-chip suggestions */}
      <PersonalNotesModal
        visible={notesModalVisible}
        onClose={() => setNotesModalVisible(false)}
        restaurantName={restaurant.name}
        currentNotes={currentNotes}
        onSave={(notes) => updateRestaurantNotes(restaurant.id, notes)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  backButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  backButtonText: {
    color: AppColors.white,
    fontWeight: "600",
  },
  headerImage: {
    height: 250,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  headerButton: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  backHeaderButton: {
    left: Spacing.md,
  },
  shareHeaderButton: {
    right: Spacing.md + 48,
  },
  favoriteHeaderButton: {
    right: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  titleSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  restaurantName: {
    fontSize: 28,
    lineHeight: 34,
  },
  cuisineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  cuisineType: {
    fontSize: 16,
  },
  ratingBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  ratingTextLarge: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 4,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  flavorSection: {
    paddingVertical: Spacing.lg,
  },
  flavorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  flavorTitle: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  flavorName: {
    color: AppColors.white,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  flavorDescription: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 20,
  },
  photosSection: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  inlineNoteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
  },
  specialTitle: {
    fontSize: 18,
    marginBottom: Spacing.xs,
  },
  specialDescription: {
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.lightGray,
  },
  contactText: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  ratingsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  ratingItem: {
    alignItems: "center",
  },
  ratingSource: {
    fontSize: 13,
    color: AppColors.slateGray,
    marginBottom: 4,
  },
  ratingValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sentimentBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  sentimentBadgeText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  reviewSummary: {
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  sentimentList: {
    marginTop: Spacing.sm,
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    fontSize: 13,
  },
  // Similar restaurants styles
  similarLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  similarLoadingText: {
    fontSize: 14,
  },
  similarList: {
    marginTop: Spacing.xs,
  },
  similarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  similarImage: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
  },
  similarImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  similarInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  similarCuisine: {
    fontSize: 13,
    marginTop: 2,
  },
  similarMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: Spacing.sm,
  },
  matchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  matchText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  similarPrice: {
    fontSize: 12,
  },
  popularDishes: {
    marginBottom: Spacing.md,
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  menuButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  orderOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.lightGray,
  },
  orderOptionText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: 16,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  dayText: {
    fontWeight: "500",
  },
  footer: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
  },
  footerText: {
    fontSize: 14,
  },
  footerSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
});
