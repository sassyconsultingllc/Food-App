/**
 * Group Decision Mode - Tinder-style Restaurant Matcher
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Swipe left/right on restaurants. When group members all swipe right
 * on the same restaurant, it's a match!
 */

import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  useWindowDimensions,
  PanResponder,
  Animated as RNAnimated,
  Share,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IconSymbol } from "./ui/icon-symbol";
import { AppColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Restaurant } from "@/types/restaurant";

// Session stored in memory for simplicity
// In production, this would be stored on a server
interface GroupSession {
  sessionId: string;
  hostName: string;
  restaurants: Restaurant[];
  votes: Record<string, Record<string, "yes" | "no">>; // { memberId: { restaurantId: vote } }
  members: string[];
}

interface GroupDecisionModeProps {
  visible: boolean;
  onClose: () => void;
  restaurants: Restaurant[];
  userName: string;
}

export function GroupDecisionMode({
  visible,
  onClose,
  restaurants,
  userName,
}: GroupDecisionModeProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  
  const [mode, setMode] = useState<"menu" | "host" | "join" | "swiping" | "results">("menu");
  const [session, setSession] = useState<GroupSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [myVotes, setMyVotes] = useState<Record<string, "yes" | "no">>({});
  const [joinCode, setJoinCode] = useState("");
  
  const position = useRef(new RNAnimated.ValueXY()).current;
  
  // Generate a short session code
  const generateSessionCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };
  
  // Start as host
  const handleStartAsHost = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sessionId = generateSessionCode();
    
    const newSession: GroupSession = {
      sessionId,
      hostName: userName,
      restaurants: restaurants.slice(0, 20), // Limit to 20 for swiping
      votes: { [userName]: {} },
      members: [userName],
    };
    
    setSession(newSession);
    setMode("host");
  };
  
  // Share session invite
  const shareInvite = async () => {
    if (!session) return;
    
    try {
      await Share.share({
        message: `Join my Foodie Finder group! Code: ${session.sessionId}`,
        title: "Join My Restaurant Group",
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };
  
  // Start swiping
  const startSwiping = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setMode("swiping");
    setCurrentIndex(0);
  };
  
  // Handle swipe
  const handleSwipe = useCallback((direction: "left" | "right") => {
    if (!session || currentIndex >= session.restaurants.length) return;
    
    const restaurant = session.restaurants[currentIndex];
    const vote = direction === "right" ? "yes" : "no";
    
    Haptics.impactAsync(
      direction === "right" 
        ? Haptics.ImpactFeedbackStyle.Medium 
        : Haptics.ImpactFeedbackStyle.Light
    );
    
    setMyVotes(prev => ({ ...prev, [restaurant.id]: vote }));
    
    // Animate card off screen
    RNAnimated.timing(position, {
      toValue: { x: direction === "right" ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      
      if (currentIndex + 1 >= session.restaurants.length) {
        // Done swiping
        setMode("results");
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    });
  }, [session, currentIndex, position, SCREEN_WIDTH]);
  
  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 120) {
          handleSwipe("right");
        } else if (gesture.dx < -120) {
          handleSwipe("left");
        } else {
          // Snap back
          RNAnimated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;
  
  // Calculate matches (restaurants everyone said yes to)
  const matches = useMemo(() => {
    if (!session) return [];
    
    return session.restaurants.filter(restaurant => {
      // For now, just show what the user liked
      // In a real app, this would check all members' votes
      return myVotes[restaurant.id] === "yes";
    });
  }, [session, myVotes]);
  
  // Get card rotation based on position
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ["-10deg", "0deg", "10deg"],
    extrapolate: "clamp",
  });
  
  const currentRestaurant = session?.restaurants[currentIndex];
  
  // Render based on mode
  const renderContent = () => {
    switch (mode) {
      case "menu":
        return (
          <View style={styles.menuContainer}>
            <View style={[styles.iconContainer, { backgroundColor: colors.accent + "20" }]}>
              <IconSymbol name="person.3.fill" size={48} color={colors.accent} />
            </View>
            <ThemedText type="title" style={styles.menuTitle}>
              Group Decision
            </ThemedText>
            <ThemedText style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
              Swipe together to find a restaurant everyone agrees on!
            </ThemedText>
            
            <View style={styles.menuButtons}>
              <Pressable
                onPress={handleStartAsHost}
                style={[styles.menuButton, { backgroundColor: colors.accent }]}
              >
                <IconSymbol name="plus.circle.fill" size={24} color={AppColors.white} />
                <View>
                  <ThemedText style={styles.menuButtonText}>Start a Group</ThemedText>
                  <ThemedText style={styles.menuButtonSubtext}>
                    Create a new session and invite friends
                  </ThemedText>
                </View>
              </Pressable>
              
              <Pressable
                onPress={() => setMode("join")}
                style={[styles.menuButton, styles.menuButtonOutline, { borderColor: colors.border }]}
              >
                <IconSymbol name="link" size={24} color={colors.accent} />
                <View>
                  <ThemedText style={[styles.menuButtonText, { color: colors.text }]}>
                    Join a Group
                  </ThemedText>
                  <ThemedText style={[styles.menuButtonSubtext, { color: colors.textSecondary }]}>
                    Enter a code to join an existing session
                  </ThemedText>
                </View>
              </Pressable>
            </View>
          </View>
        );
        
      case "host":
        return (
          <View style={styles.hostContainer}>
            <View style={[styles.codeContainer, { backgroundColor: colors.surface }]}>
              <ThemedText style={[styles.codeLabel, { color: colors.textSecondary }]}>
                Session Code
              </ThemedText>
              <ThemedText type="title" style={[styles.codeText, { color: colors.accent }]}>
                {session?.sessionId}
              </ThemedText>
            </View>
            
            <ThemedText style={[styles.hostInfo, { color: colors.textSecondary }]}>
              Share this code with your group to let them join
            </ThemedText>
            
            <Pressable
              onPress={shareInvite}
              style={[styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <IconSymbol name="square.and.arrow.up" size={20} color={colors.accent} />
              <ThemedText style={{ color: colors.accent }}>Share Invite</ThemedText>
            </Pressable>
            
            <View style={styles.membersList}>
              <ThemedText type="defaultSemiBold">Members ({session?.members.length || 0})</ThemedText>
              {session?.members.map((member, i) => (
                <View key={i} style={[styles.memberRow, { backgroundColor: colors.surface }]}>
                  <IconSymbol name="person.fill" size={16} color={colors.accent} />
                  <ThemedText>{member} {member === userName && "(You)"}</ThemedText>
                </View>
              ))}
            </View>
            
            <Pressable
              onPress={startSwiping}
              style={[styles.startButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.startButtonText}>Start Swiping!</ThemedText>
            </Pressable>
          </View>
        );
        
      case "swiping":
        if (!currentRestaurant) return null;
        
        return (
          <View style={styles.swipeContainer}>
            {/* Progress */}
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: colors.accent,
                    width: `${((currentIndex + 1) / (session?.restaurants.length || 1)) * 100}%`,
                  }
                ]} 
              />
            </View>
            <ThemedText style={[styles.progressText, { color: colors.textSecondary }]}>
              {currentIndex + 1} of {session?.restaurants.length}
            </ThemedText>
            
            {/* Card */}
            <RNAnimated.View
              {...panResponder.panHandlers}
              style={[
                styles.card,
                {
                  backgroundColor: colors.cardBackground,
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { rotate },
                  ],
                },
              ]}
            >
              <View style={[styles.cardImage, { backgroundColor: colors.accent + "20" }]}>
                <IconSymbol name="fork.knife" size={48} color={colors.accent} />
              </View>
              <View style={styles.cardContent}>
                <ThemedText type="subtitle" style={styles.cardName}>
                  {currentRestaurant.name}
                </ThemedText>
                <ThemedText style={[styles.cardCuisine, { color: colors.textSecondary }]}>
                  {currentRestaurant.cuisineType}
                </ThemedText>
                <View style={styles.cardRating}>
                  <IconSymbol name="star.fill" size={16} color={AppColors.copper} />
                  <ThemedText style={styles.cardRatingText}>
                    {currentRestaurant.ratings.aggregated.toFixed(1)}
                  </ThemedText>
                  {currentRestaurant.priceRange && (
                    <ThemedText style={[styles.cardPrice, { color: colors.textSecondary }]}>
                      • {currentRestaurant.priceRange}
                    </ThemedText>
                  )}
                </View>
              </View>
            </RNAnimated.View>
            
            {/* Buttons */}
            <View style={styles.swipeButtons}>
              <Pressable
                onPress={() => handleSwipe("left")}
                style={[styles.swipeButton, styles.swipeButtonNo]}
              >
                <IconSymbol name="xmark" size={32} color={AppColors.error} />
              </Pressable>
              <Pressable
                onPress={() => handleSwipe("right")}
                style={[styles.swipeButton, styles.swipeButtonYes]}
              >
                <IconSymbol name="fork.knife.circle.fill" size={32} color={AppColors.success} />
              </Pressable>
            </View>
          </View>
        );
        
      case "results":
        return (
          <View style={styles.resultsContainer}>
            <IconSymbol name="checkmark.circle.fill" size={64} color={colors.success} />
            <ThemedText type="title" style={styles.resultsTitle}>
              All Done!
            </ThemedText>
            
            {matches.length > 0 ? (
              <>
                <ThemedText style={[styles.resultsSubtitle, { color: colors.textSecondary }]}>
                  You liked {matches.length} restaurant{matches.length !== 1 ? "s" : ""}:
                </ThemedText>
                <View style={styles.matchesList}>
                  {matches.slice(0, 5).map((restaurant, i) => (
                    <View key={restaurant.id} style={[styles.matchItem, { backgroundColor: colors.surface }]}>
                      <ThemedText style={styles.matchRank}>#{i + 1}</ThemedText>
                      <View style={styles.matchInfo}>
                        <ThemedText type="defaultSemiBold">{restaurant.name}</ThemedText>
                        <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
                          {restaurant.cuisineType}
                        </ThemedText>
                      </View>
                      <View style={styles.matchRating}>
                        <IconSymbol name="star.fill" size={14} color={AppColors.copper} />
                        <ThemedText>{restaurant.ratings.aggregated.toFixed(1)}</ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <ThemedText style={[styles.resultsSubtitle, { color: colors.textSecondary }]}>
                No matches! Try swiping right on more restaurants.
              </ThemedText>
            )}
            
            <Pressable
              onPress={() => {
                setMode("menu");
                setSession(null);
                setMyVotes({});
                setCurrentIndex(0);
              }}
              style={[styles.doneButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.doneButtonText}>Done</ThemedText>
            </Pressable>
          </View>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <IconSymbol name="xmark.circle.fill" size={28} color={colors.textSecondary} />
          </Pressable>
          <ThemedText type="defaultSemiBold">Group Mode</ThemedText>
          <View style={{ width: 28 }} />
        </View>
        
        {renderContent()}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  menuContainer: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  menuTitle: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  menuSubtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  menuButtons: {
    width: "100%",
    gap: Spacing.md,
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  menuButtonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  menuButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  menuButtonSubtext: {
    color: AppColors.white + "80",
    fontSize: 12,
    marginTop: 2,
  },
  hostContainer: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: "center",
  },
  codeContainer: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  codeLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  codeText: {
    fontSize: 36,
    letterSpacing: 4,
  },
  hostInfo: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  membersList: {
    width: "100%",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  startButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  startButtonText: {
    color: AppColors.white,
    fontSize: 18,
    fontWeight: "600",
  },
  swipeContainer: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    marginBottom: Spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardImage: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    padding: Spacing.lg,
  },
  cardName: {
    marginBottom: Spacing.xs,
  },
  cardCuisine: {
    marginBottom: Spacing.sm,
  },
  cardRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  cardRatingText: {
    fontWeight: "600",
  },
  cardPrice: {
    marginLeft: Spacing.xs,
  },
  swipeButtons: {
    flexDirection: "row",
    gap: Spacing.xl,
    marginTop: Spacing.xl,
  },
  swipeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  swipeButtonNo: {
    backgroundColor: "#FFF0F0",
  },
  swipeButtonYes: {
    backgroundColor: "#F0FFF0",
  },
  resultsContainer: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsTitle: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  resultsSubtitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  matchesList: {
    width: "100%",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  matchItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  matchRank: {
    fontSize: 18,
    fontWeight: "700",
    width: 30,
  },
  matchInfo: {
    flex: 1,
  },
  matchRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  doneButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  doneButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
