import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getSightings } from './api';
import MapView, { LEVEL_COLORS, MAX_ZOOM, MIN_ZOOM } from './MapView';
import type { MapMarker } from './MapView';
import { clusterSightings, RELATED_DISTANCE_METERS } from './cluster';
import { getCurrentCoordinates } from './geolocation';
import type { Coordinates, Sighting, Theme } from './types';

const LEVEL_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function centroid(points: Coordinates[]): Coordinates | null {
  if (points.length === 0) {
    return null;
  }
  return {
    latitude: points.reduce((a, p) => a + p.latitude, 0) / points.length,
    longitude: points.reduce((a, p) => a + p.longitude, 0) / points.length,
  };
}

function zoomFor(points: Coordinates[]): number {
  if (points.length === 0) {
    return 15;
  }
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
  );
  if (span < 0.001) {
    return 16;
  }
  if (span < 0.005) {
    return 15;
  }
  if (span < 0.02) {
    return 14;
  }
  if (span < 0.08) {
    return 12;
  }
  if (span < 0.3) {
    return 10;
  }
  return 8;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

export default function MapScreen({ theme }: { theme: Theme }) {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(15);
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [user, setUser] = useState<Coordinates | null>(null);

  const userRef = useRef(user);
  userRef.current = user;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await getSightings();
      setSightings(all);
      const coords = all.map(s => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));
      const target = userRef.current ?? centroid(coords);
      if (target) {
        setCenter(target);
        setZoom(userRef.current ? 16 : zoomFor(coords));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const locate = useCallback(async () => {
    try {
      const coords = await getCurrentCoordinates();
      setUser(coords);
      setCenter(coords);
      setZoom(16);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const clusters = useMemo(() => clusterSightings(sightings), [sightings]);

  const labels = useMemo(
    () => Array.from(new Set(clusters.map(c => c.label))).sort(),
    [clusters],
  );

  const shown = useMemo(
    () =>
      speciesFilter
        ? clusters.filter(c => c.label === speciesFilter)
        : clusters,
    [clusters, speciesFilter],
  );

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = shown.map(c => ({
      id: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      kind: 'cluster',
      level: c.level,
      count: c.count,
      label: c.label,
    }));
    if (user) {
      list.push({
        id: 'user',
        latitude: user.latitude,
        longitude: user.longitude,
        kind: 'user',
      });
    }
    return list;
  }, [shown, user]);

  const ranked = useMemo(
    () =>
      [...shown].sort(
        (a, b) =>
          b.count - a.count ||
          new Date(b.latest).getTime() - new Date(a.latest).getTime(),
      ),
    [shown],
  );

  const totalInView = shown.reduce((a, c) => a + c.count, 0);

  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>Bird map</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        {totalInView} sighting{totalInView === 1 ? '' : 's'} at {shown.length}{' '}
        location{shown.length === 1 ? '' : 's'}
        {speciesFilter ? ` · ${speciesFilter}` : ''}
      </Text>
      <Text style={[styles.hint, { color: theme.muted }]}>
        Confidence = how often the bird was spotted nearby (within{' '}
        {RELATED_DISTANCE_METERS} m): 1 = Low · 2–3 = Medium · 4+ = High.
      </Text>

      {labels.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          <Pressable
            onPress={() => setSpeciesFilter(null)}
            style={[
              styles.chip,
              { backgroundColor: speciesFilter ? theme.card : theme.accent },
            ]}>
            <Text
              style={[
                styles.chipText,
                { color: speciesFilter ? theme.text : '#ffffff' },
              ]}>
              All species
            </Text>
          </Pressable>
          {labels.map(label => {
            const active = label === speciesFilter;
            return (
              <Pressable
                key={label}
                onPress={() => setSpeciesFilter(active ? null : label)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? theme.accent : theme.card },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? '#ffffff' : theme.text },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {center ? (
        <MapView
          center={center}
          zoom={zoom}
          markers={markers}
          height={380}
          onCenterChange={setCenter}
          onZoomChange={setZoom}
        />
      ) : (
        <View style={[styles.emptyMap, { backgroundColor: theme.card }]}>
          <Text style={{ color: theme.muted }}>
            No sightings yet. Tap “Locate me” to centre the map.
          </Text>
        </View>
      )}

      <Text style={[styles.mapHint, { color: theme.muted }]}>
        Scroll or pinch to zoom · drag to pan · z{zoom}
      </Text>

      <View style={styles.controls}>
        <Pressable
          onPress={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))}
          style={[
            styles.control,
            styles.controlWide,
            { backgroundColor: theme.card },
          ]}>
          <Text style={[styles.controlText, { color: theme.text }]}>−</Text>
        </Pressable>
        <Pressable
          onPress={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))}
          style={[
            styles.control,
            styles.controlWide,
            { backgroundColor: theme.card },
          ]}>
          <Text style={[styles.controlText, { color: theme.text }]}>+</Text>
        </Pressable>
        <Pressable
          onPress={locate}
          style={[
            styles.control,
            styles.controlWide,
            { backgroundColor: theme.card },
          ]}>
          <Text style={[styles.controlText, { color: theme.text }]}>
            Locate me
          </Text>
        </Pressable>
        <Pressable
          onPress={load}
          style={[
            styles.control,
            styles.controlWide,
            { backgroundColor: theme.card },
          ]}>
          <Text style={[styles.controlText, { color: theme.text }]}>
            Refresh
          </Text>
        </Pressable>
      </View>

      <View style={styles.legend}>
        {(['high', 'medium', 'low'] as const).map(level => (
          <View key={level} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: LEVEL_COLORS[level] }]}
            />
            <Text style={[styles.legendText, { color: theme.muted }]}>
              {LEVEL_LABEL[level]}
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} />
          <Text style={[styles.legendText, { color: theme.muted }]}>
            You
          </Text>
        </View>
      </View>

      {ranked.map(cluster => (
        <View
          key={cluster.id}
          style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.badge,
                { backgroundColor: LEVEL_COLORS[cluster.level] },
              ]}>
              <Text style={styles.badgeText}>{LEVEL_LABEL[cluster.level]}</Text>
            </View>
            <Text style={[styles.cardLabel, { color: theme.text }]}>
              {cluster.label}
            </Text>
            <Text style={[styles.cardProb, { color: theme.text }]}>
              ×{cluster.count}
            </Text>
          </View>
          <Text style={[styles.cardMeta, { color: theme.muted }]}>
            spotted {cluster.count} time{cluster.count === 1 ? '' : 's'} nearby
            {' · '}avg model {(cluster.avgProbability * 100).toFixed(0)}%
            {' · '}
            {cluster.latitude.toFixed(4)}, {cluster.longitude.toFixed(4)}
            {cluster.latest ? ` · ${timeAgo(cluster.latest)}` : ''}
          </Text>
        </View>
      ))}

      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  chips: {
    gap: 8,
    paddingVertical: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyMap: {
    height: 380,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  mapHint: {
    fontSize: 12,
    marginTop: 6,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  control: {
    minWidth: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  controlWide: {
    flex: 1,
  },
  controlText: {
    fontSize: 14,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
  },
  spinner: {
    marginTop: 16,
  },
  error: {
    color: '#dc2626',
    marginTop: 12,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  cardProb: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 8,
  },
});
