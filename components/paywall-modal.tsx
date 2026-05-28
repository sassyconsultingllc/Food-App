/**
 * Paywall Modal
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Upsell modal shown when a user taps a premium feature in enforced mode.
 * In evaluation mode (the current app-store default) FeatureGate never
 * blocks, so this modal is only reachable via an explicit "See Pro
 * features" affordance — useful for showcasing the upgrade path.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, BorderRadius, Colors, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLicense } from "@/hooks/use-license";
import type { PremiumFeature } from "@/lib/license";

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  /** Feature the user just tried to use. Drives the headline copy. */
  feature?: PremiumFeature;
  /** Called when user taps "Activate License" — host app routes to activation screen. */
  onRequestActivate?: () => void;
}

const FEATURE_HEADLINES: Record<PremiumFeature, string> = {
  unlimited_favorites: "Save unlimited favorites",
  advanced_filters: "Unlock advanced filters",
  ai_search: "Try AI-powered search",
  group_decision_mode: "Decide as a group",
  menu_photo_uploads: "Share menu photos",
  similar_restaurants: "Find similar spots",
  spin_history_export: "Export your spin history",
  ad_free: "Go ad-free",
  priority_support: "Priority support",
};

const PRO_PERKS = [
  "Unlimited favorites & spins",
  "Advanced dietary & budget filters",
  "AI-powered restaurant search",
  "Group decision mode",
  "Menu photo uploads",
  "Find similar restaurants",
  "Ad-free experience",
];

export function PaywallModal({
  visible,
  onClose,
  feature,
  onRequestActivate,
}: PaywallModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { mode, tier } = useLicense();

  const headline = feature
    ? FEATURE_HEADLINES[feature]
    : "Foodie Finder Pro";

  const handleActivate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onRequestActivate?.();
  };

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Pressable
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close paywall"
          >
            <IconSymbol name="xmark" size={20} color={colors.icon} />
          </Pressable>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.iconBubble, { backgroundColor: AppColors.softBlue }]}>
              <IconSymbol name="sparkles" size={32} color={AppColors.copper} />
            </View>

            <ThemedText type="title" style={styles.headline}>
              {headline}
            </ThemedText>

            {mode === "evaluation" ? (
              <ThemedText style={[styles.subhead, { color: colors.textSecondary }]}>
                You're currently using the free evaluation build — every
                feature is unlocked. When Pro launches, here's what you'll
                keep:
              </ThemedText>
            ) : (
              <ThemedText style={[styles.subhead, { color: colors.textSecondary }]}>
                Upgrade to Foodie Finder Pro to unlock this and more.
              </ThemedText>
            )}

            <View style={styles.perkList}>
              {PRO_PERKS.map((perk) => (
                <View key={perk} style={styles.perkRow}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={AppColors.success} />
                  <ThemedText style={styles.perkText}>{perk}</ThemedText>
                </View>
              ))}
            </View>

            {mode === "evaluation" ? (
              <View style={[styles.evalBanner, { backgroundColor: AppColors.softBlue }]}>
                <ThemedText style={[styles.evalBannerText, { color: AppColors.charcoal }]}>
                  Free during evaluation — no payment required
                </ThemedText>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={handleActivate}
                  style={[styles.primaryBtn, { backgroundColor: AppColors.copper }]}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.primaryBtnText}>
                    Activate License
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  style={styles.secondaryBtn}
                  accessibilityRole="button"
                >
                  <ThemedText style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                    Maybe later
                  </ThemedText>
                </Pressable>
              </>
            )}

            {tier !== "free" && (
              <ThemedText style={[styles.tierBadge, { color: AppColors.success }]}>
                You have {tier === "lifetime" ? "Lifetime" : "Pro"} access
              </ThemedText>
            )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "85%",
    paddingTop: Spacing.lg,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    padding: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: "center",
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  headline: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subhead: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  perkList: {
    alignSelf: "stretch",
    marginBottom: Spacing.lg,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  perkText: {
    flexShrink: 1,
  },
  evalBanner: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignSelf: "stretch",
    alignItems: "center",
  },
  evalBannerText: {
    fontWeight: "600",
  },
  primaryBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: Spacing.md,
    alignSelf: "stretch",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
  },
  tierBadge: {
    marginTop: Spacing.md,
    fontWeight: "600",
  },
});
