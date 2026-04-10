/**
 * Settings Screen
 * © 2025 Sassy Consulting - A Veteran Owned Company
 */

import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React, { useState, useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRestaurantStorage } from "@/hooks/use-restaurant-storage";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useTheme } from "@/contexts/theme-context";
import { getApiBaseUrl } from '@/constants/oauth';
import { isValidPostalCode } from '@/utils/geo-service';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const { preferences, savePreferences } = useRestaurantStorage();
  const { recentlyViewedCount, clearHistory } = useRecentlyViewed();
  const { themeMode, setThemeMode } = useTheme();

  const [zipCode, setZipCode] = useState(preferences.defaultZipCode || "");
  const [radius, setRadius] = useState(preferences.defaultRadius?.toString() || "5");


  useEffect(() => {
    setZipCode(preferences.defaultZipCode || "");
    setRadius(preferences.defaultRadius?.toString() || "5");
  }, [preferences]);

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const radiusNum = parseInt(radius, 10);
    if (isNaN(radiusNum) || radiusNum < 1 || radiusNum > 25) {
      Alert.alert("Invalid Radius", "Please enter a radius between 1 and 25 miles.");
      return;
    }

    // Validate postal code (international support)
    if (zipCode && !isValidPostalCode(zipCode.trim())) {
      Alert.alert(
        "Invalid Postal Code", 
        "Please enter a valid postal code for your country (e.g., 12345, SW1A 0AA, 10115)."
      );
      return;
    }

    await savePreferences({
      defaultZipCode: zipCode,
      defaultRadius: radiusNum,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Your preferences have been saved.");
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>

        {/* Default Preferences Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Default Preferences
          </ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Default Postal Code</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="mappin.and.ellipse" size={20} color={colors.accent} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="Enter postal code (e.g., 12345, SW1A 0AA)"
                placeholderTextColor={colors.textSecondary}
                keyboardType="default"
                maxLength={10}
                accessibilityLabel="Default postal code"
                accessibilityHint="Enter your postal code for restaurant searches"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Default Search Radius (miles)</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="location.fill" size={20} color={colors.accent} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={radius}
                onChangeText={setRadius}
                placeholder="1-25"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Default search radius in miles"
                accessibilityHint="Enter a number between 1 and 25 miles"
              />
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            style={[styles.saveButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.saveButtonText}>Save Preferences</ThemedText>
          </Pressable>
        </View>

        {/* Appearance Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Appearance
          </ThemedText>

          <View style={styles.themeOptions}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("light");
              }}
              style={[
                styles.themeOption,
                { backgroundColor: colors.surface, borderColor: themeMode === "light" ? colors.accent : colors.border },
                themeMode === "light" && styles.themeOptionSelected,
              ]}
            >
              <IconSymbol name="sun.max.fill" size={24} color={themeMode === "light" ? colors.accent : colors.textSecondary} />
              <ThemedText style={[styles.themeOptionText, themeMode === "light" && { color: colors.accent }]}>Light</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("dark");
              }}
              style={[
                styles.themeOption,
                { backgroundColor: colors.surface, borderColor: themeMode === "dark" ? colors.accent : colors.border },
                themeMode === "dark" && styles.themeOptionSelected,
              ]}
            >
              <IconSymbol name="moon.fill" size={24} color={themeMode === "dark" ? colors.accent : colors.textSecondary} />
              <ThemedText style={[styles.themeOptionText, themeMode === "dark" && { color: colors.accent }]}>Dark</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("system");
              }}
              style={[
                styles.themeOption,
                { backgroundColor: colors.surface, borderColor: themeMode === "system" ? colors.accent : colors.border },
                themeMode === "system" && styles.themeOptionSelected,
              ]}
            >
              <IconSymbol name="gearshape.fill" size={24} color={themeMode === "system" ? colors.accent : colors.textSecondary} />
              <ThemedText style={[styles.themeOptionText, themeMode === "system" && { color: colors.accent }]}>System</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Data Management Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Data Management
          </ThemedText>

          <View style={styles.dataItem}>
            <View style={styles.dataItemLeft}>
              <IconSymbol name="clock.fill" size={20} color={colors.accent} />
              <View>
                <ThemedText style={styles.dataItemTitle}>Recently Viewed</ThemedText>
                <ThemedText style={[styles.dataItemSubtitle, { color: colors.textSecondary }]}>
                  {recentlyViewedCount} restaurant{recentlyViewedCount !== 1 ? "s" : ""} in history
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={() => {
                Alert.alert(
                  "Clear History",
                  "Are you sure you want to clear your recently viewed history?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => {
                        clearHistory();
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      },
                    },
                  ]
                );
              }}
              style={[styles.clearButton, { borderColor: colors.error }]}
            >
              <ThemedText style={[styles.clearButtonText, { color: colors.error }]}>Clear</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* About Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            About
          </ThemedText>

          <View style={styles.aboutContent}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.appIcon}
              contentFit="contain"
            />
            <ThemedText type="defaultSemiBold" style={styles.appName}>
              Foodie Finder
            </ThemedText>
            <ThemedText style={[styles.appVersion, { color: colors.textSecondary }]}>
              Version 1.0.0
            </ThemedText>
          </View>

          <View style={styles.aboutDescription}>
            <ThemedText style={[styles.descriptionText, { color: colors.textSecondary }]}>
              Discover local restaurants with our fun random picker. View daily specials, 
              Culver's Flavor of the Day, and aggregated ratings from multiple sources.
            </ThemedText>
          </View>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <IconSymbol name="shuffle" size={20} color={colors.accent} />
              <ThemedText style={styles.featureText}>Random Restaurant Picker</ThemedText>
            </View>
            <View style={styles.featureItem}>
              <IconSymbol name="sparkles" size={20} color={colors.accent} />
              <ThemedText style={styles.featureText}>Daily Specials</ThemedText>
            </View>
            <View style={styles.featureItem}>
              <IconSymbol name="flame.fill" size={20} color={colors.accent} />
              <ThemedText style={styles.featureText}>Culver's Flavor of the Day</ThemedText>
            </View>
            <View style={styles.featureItem}>
              <IconSymbol name="star.fill" size={20} color={colors.accent} />
              <ThemedText style={styles.featureText}>Aggregated Ratings</ThemedText>
            </View>
          </View>
        </View>

        {/* Copyright Section */}
        <View style={[styles.section, styles.copyrightSection, { backgroundColor: colors.cardBackground }]}>
          <View style={styles.copyrightContent}>
            <ThemedText style={[styles.copyrightText, { color: colors.textSecondary }]}>
              © 2025 Sassy Consulting
            </ThemedText>
            <ThemedText style={[styles.veteranText, { color: colors.accent }]}>
              A Veteran Owned Company
            </ThemedText>
          </View>
          <View style={styles.divider} />
          <ThemedText style={[styles.rightsText, { color: colors.textSecondary }]}>
            All rights reserved. This application and its design are proprietary to Sassy Consulting.
          </ThemedText>
        </View>

        {/* Help Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Help & Support
          </ThemedText>

          <Pressable 
            style={styles.helpItem}
            onPress={() => {
              Alert.alert(
                "How to Use Foodie Finder",
                "1. Browse or search for restaurants near you\n\n" +
                "2. Tap the shuffle button for a random pick\n\n" +
                "3. Swipe through results for menus, ratings, and specials\n\n" +
                "4. Save favorites with the fork & knife icon\n\n" +
                "5. Set your default location and radius in Settings",
                [{ text: "Got it!" }]
              );
            }}
            accessibilityLabel="How to Use"
            accessibilityRole="button"
          >
            <IconSymbol name="info.circle.fill" size={20} color={colors.accent} />
            <ThemedText style={styles.helpText}>How to Use</ThemedText>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>

          <Pressable 
            style={styles.helpItem}
            onPress={() => {
              import('expo-linking').then(({ default: Linking }) => 
                Linking.openURL('mailto:support@sassyconsultingllc.com?subject=Foodie%20Finder%20Support')
              );
            }}
            accessibilityLabel="Contact Support"
            accessibilityRole="link"
          >
            <IconSymbol name="globe" size={20} color={colors.accent} />
            <ThemedText style={styles.helpText}>Contact Support</ThemedText>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Legal Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Legal
          </ThemedText>

          <Pressable 
            style={styles.helpItem}
            onPress={() => {
              import('expo-linking').then(({ default: Linking }) => 
                Linking.openURL('https://sassyconsultingllc.com/privacy/foodie-finder/')
              );
            }}
            accessibilityLabel="Privacy Policy"
            accessibilityRole="link"
          >
            <IconSymbol name="lock.shield.fill" size={20} color={colors.accent} />
            <ThemedText style={styles.helpText}>Privacy Policy</ThemedText>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>

          <Pressable 
            style={styles.helpItem}
            onPress={() => {
              import('expo-linking').then(({ default: Linking }) => 
                Linking.openURL('https://sassyconsultingllc.com/privacy/foodie-finder/terms.html')
              );
            }}
            accessibilityLabel="Terms of Service"
            accessibilityRole="link"
          >
            <IconSymbol name="doc.text.fill" size={20} color={colors.accent} />
            <ThemedText style={styles.helpText}>Terms of Service</ThemedText>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontSize: 32,
    marginBottom: Spacing.lg,
  },
  section: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  saveButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  saveButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  aboutContent: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: 20,
  },
  appVersion: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  aboutDescription: {
    marginBottom: Spacing.md,
  },
  descriptionText: {
    textAlign: "center",
    lineHeight: 22,
  },
  featureList: {
    gap: Spacing.sm,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  featureText: {
    fontSize: 15,
  },
  copyrightSection: {
    alignItems: "center",
  },
  copyrightContent: {
    alignItems: "center",
  },
  copyrightText: {
    fontSize: 16,
    fontWeight: "600",
  },
  veteranText: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: Spacing.xs,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: AppColors.copper,
    marginVertical: Spacing.md,
    borderRadius: 1,
  },
  rightsText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  helpText: {
    flex: 1,
    fontSize: 16,
  },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  dataItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dataItemTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  dataItemSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  clearButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  themeOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  themeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    gap: Spacing.xs,
  },
  themeOptionSelected: {
    borderWidth: 2,
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
