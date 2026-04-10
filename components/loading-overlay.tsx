/**
 * Loading Overlay Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Full-screen loading indicator with optional message
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface LoadingOverlayProps {
  message?: string;
  visible: boolean;
}

export function LoadingOverlay({ message = "Loading...", visible }: LoadingOverlayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <ThemedText style={styles.message}>{message}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  message: {
    marginTop: 12,
  },
});
