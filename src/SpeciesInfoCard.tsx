import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SpeciesInfo, Theme } from './types';

type Props = {
  label: string;
  info: SpeciesInfo | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  theme: Theme;
};

function SpeciesInfoCard({ label, info, loading, error, onRetry, theme }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.heading, { color: theme.text }]}>Species info</Text>
      <Text style={[styles.name, { color: theme.accent }]}>{label}</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>
            Asking Groq about this bird…
          </Text>
        </View>
      ) : null}

      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            testID="species-retry"
            onPress={onRetry}
            style={[styles.retry, { backgroundColor: theme.accent }]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </>
      ) : null}

      {info ? (
        <>
          <Text style={[styles.summary, { color: theme.text }]}>
            {info.summary}
          </Text>
          <View style={[styles.funFact, { backgroundColor: theme.bg }]}>
            <Text style={[styles.funFactLabel, { color: theme.muted }]}>
              Fun fact
            </Text>
            <Text style={[styles.funFactText, { color: theme.text }]}>
              {info.fun_fact}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  error: {
    color: '#dc2626',
    marginTop: 12,
  },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 10,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  funFact: {
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  funFactLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  funFactText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});

export default SpeciesInfoCard;
