/**
 * Error Boundary Component
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Catches React errors and displays a fallback UI
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ThemedView style={styles.container}>
          <IconSymbol name="exclamationmark.triangle.fill" size={64} color="#ef4444" />
          <ThemedText type="title" style={styles.title}>
            Oops! Something went wrong
          </ThemedText>
          <ThemedText style={styles.message}>
            We encountered an unexpected error. Please try again.
          </ThemedText>
          {__DEV__ && this.state.error && (
            <ThemedText style={styles.errorDetails}>
              {this.state.error.toString()}
            </ThemedText>
          )}
          <Pressable onPress={this.handleReset} style={styles.button}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </ThemedView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  errorDetails: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 16,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#6BA3BE',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
