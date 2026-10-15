import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Coordinates, HotspotLevel } from './types';

const TILE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;
const TAP_SLOP = 8;

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  kind: 'sighting' | 'cluster' | 'hotspot' | 'user' | 'trailhead';
  level?: HotspotLevel;
  count?: number;
  label?: string;
};

export const LEVEL_COLORS: Record<HotspotLevel, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#16a34a',
};

export const TRAILHEAD_COLOR = '#7c3aed';
export const PIN_COLOR = '#2563eb';

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

function worldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom) * TILE;
}

function worldY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return ((1 - merc / Math.PI) / 2) * Math.pow(2, zoom) * TILE;
}

function lngFromWorldX(x: number, zoom: number): number {
  return (x / (Math.pow(2, zoom) * TILE)) * 360 - 180;
}

function latFromWorldY(y: number, zoom: number): number {
  const n = Math.max(0, Math.min(1 - 1e-9, y / (Math.pow(2, zoom) * TILE)));
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * n))) * 180) / Math.PI;
}

export function tileUrl(x: number, y: number, zoom: number): string {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

type Props = {
  center: Coordinates;
  zoom: number;
  markers: MapMarker[];
  height?: number;
  pin?: Coordinates | null;
  onPinChange?: (center: Coordinates) => void;
  onCenterChange?: (center: Coordinates) => void;
  onZoomChange?: (zoom: number) => void;
};

function distance(touches: Array<{ pageX: number; pageY: number }>): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
}

export default function MapView({
  center,
  zoom,
  markers,
  height = 380,
  pin,
  onPinChange,
  onCenterChange,
  onZoomChange,
}: Props) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();

  const fallbackWidth = Math.max(280, Math.min(windowWidth, 900) - 40);
  const width = measuredWidth > 0 ? measuredWidth : fallbackWidth;

  const z = clampZoom(zoom);
  const n = Math.pow(2, z);
  const centerX = worldX(center.longitude, z);
  const centerY = worldY(center.latitude, z);
  const left = centerX - width / 2;
  const top = centerY - height / 2;

  const maxCount = Math.max(1, ...markers.map(m => m.count ?? 1));

  const pinScreen = pin
    ? {
        x: worldX(pin.longitude, z) - left,
        y: worldY(pin.latitude, z) - top,
      }
    : null;

  const containerRef = useRef<any>(null);
  const boundsRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef({ center, z, width, height, left, top, pin });
  stateRef.current = { center, z, width, height, left, top, pin };
  const cbRef = useRef({ onCenterChange, onZoomChange, onPinChange });
  cbRef.current = { onCenterChange, onZoomChange, onPinChange };

  const pinRef = useRef<{ x: number; y: number } | null>(null);
  pinRef.current = pinScreen;

  const gesture = useRef({
    startCenter: center,
    startZoom: z,
    startDist: 0,
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: 0,
    draggingPin: false,
  });

  const syncBounds = useCallback(() => {
    const node: any = containerRef.current;
    if (!node) {
      return;
    }
    if (typeof node.getBoundingClientRect === 'function') {
      const rect = node.getBoundingClientRect();
      boundsRef.current = { x: rect.left, y: rect.top };
    } else if (typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number) => {
        boundsRef.current = { x, y };
      });
    }
  }, []);

  const toCoordinates = useCallback((pageX: number, pageY: number): Coordinates => {
    const { z: gz, left: gl, top: gt } = stateRef.current;
    const localX = pageX - boundsRef.current.x;
    const localY = pageY - boundsRef.current.y;
    return {
      longitude: lngFromWorldX(gl + localX, gz),
      latitude: latFromWorldY(gt + localY, gz),
    };
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    setMeasuredWidth(event.nativeEvent.layout.width);
    syncBounds();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => {
          syncBounds();
          const t = e.nativeEvent;
          const touches = t.touches ?? [];
          const g = gesture.current;
          g.startCenter = stateRef.current.center;
          g.startZoom = stateRef.current.z;
          g.startDist = touches.length >= 2 ? distance(touches as any) : 0;
          g.startX = t.pageX ?? 0;
          g.startY = t.pageY ?? 0;
          g.startTime = Date.now();
          g.moved = 0;
          g.draggingPin = false;
          const pinPos = pinRef.current;
          if (pinPos) {
            const lx = g.startX - boundsRef.current.x;
            const ly = g.startY - boundsRef.current.y;
            if (Math.hypot(lx - pinPos.x, ly - pinPos.y) <= 26) {
              g.draggingPin = true;
            }
          }
        },
        onPanResponderMove: e => {
          const t = e.nativeEvent;
          const touches = t.touches ?? [];
          const g = gesture.current;
          if (touches.length >= 2) {
            if (g.startDist === 0) {
              g.startDist = distance(touches as any);
              g.startZoom = stateRef.current.z;
              return;
            }
            const steps = Math.round(
              Math.log2(distance(touches as any) / g.startDist),
            );
            const next = clampZoom(g.startZoom + steps);
            if (next !== stateRef.current.z) {
              cbRef.current.onZoomChange?.(next);
            }
            return;
          }
          const pageX = t.pageX ?? g.startX;
          const pageY = t.pageY ?? g.startY;
          const dx = pageX - g.startX;
          const dy = pageY - g.startY;
          g.moved = Math.hypot(dx, dy);
          if (g.draggingPin && cbRef.current.onPinChange) {
            cbRef.current.onPinChange(toCoordinates(pageX, pageY));
            return;
          }
          const gz = stateRef.current.z;
          cbRef.current.onCenterChange?.({
            latitude: latFromWorldY(
              worldY(g.startCenter.latitude, gz) - dy,
              gz,
            ),
            longitude: lngFromWorldX(
              worldX(g.startCenter.longitude, gz) - dx,
              gz,
            ),
          });
        },
        onPanResponderRelease: e => {
          const g = gesture.current;
          const t = e.nativeEvent;
          const pageX = t.pageX ?? g.startX;
          const pageY = t.pageY ?? g.startY;
          const tapped = g.moved <= TAP_SLOP && Date.now() - g.startTime < 500;
          if (tapped && cbRef.current.onPinChange) {
            cbRef.current.onPinChange(toCoordinates(pageX, pageY));
          }
          g.draggingPin = false;
        },
      }),
    [syncBounds, toCoordinates],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const node: any = containerRef.current;
    if (!node || typeof node.addEventListener !== 'function') {
      return;
    }
    const onWheel = (e: any) => {
      e.preventDefault();
      const next = clampZoom(stateRef.current.z + (e.deltaY < 0 ? 1 : -1));
      cbRef.current.onZoomChange?.(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const tiles: { key: string; url: string; x: number; y: number }[] = [];
  const minX = Math.floor(left / TILE);
  const maxX = Math.floor((left + width) / TILE);
  const minY = Math.floor(top / TILE);
  const maxY = Math.floor((top + height) / TILE);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (x < 0 || y < 0 || x >= n || y >= n) {
        continue;
      }
      tiles.push({
        key: `${z}/${x}/${y}`,
        url: tileUrl(x, y, z),
        x: x * TILE - left,
        y: y * TILE - top,
      });
    }
  }

  pinRef.current =
    pin != null
      ? { x: worldX(pin.longitude, z) - left, y: worldY(pin.latitude, z) - top }
      : null;

  return (
    <View
      ref={containerRef}
      style={[styles.container, { height }]}
      onLayout={onLayout}
      {...responder.panHandlers}>
      {tiles.map(tile => (
        <Image
          key={tile.key}
          source={{ uri: tile.url }}
          style={[styles.tile, { left: tile.x, top: tile.y }]}
        />
      ))}

      {markers.map(marker => {
        const px = worldX(marker.longitude, z) - left;
        const py = worldY(marker.latitude, z) - top;
        if (px < -60 || py < -60 || px > width + 60 || py > height + 60) {
          return null;
        }
        if (marker.kind === 'hotspot') {
          const level = marker.level ?? 'low';
          const radius = 14 + 30 * Math.min(1, (marker.count ?? 1) / maxCount);
          return (
            <View
              key={marker.id}
              pointerEvents="none"
              style={[
                styles.hotspot,
                {
                  left: px - radius,
                  top: py - radius,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: radius,
                  backgroundColor: LEVEL_COLORS[level],
                },
              ]}
            />
          );
        }
        if (marker.kind === 'cluster') {
          const level = marker.level ?? 'low';
          const count = marker.count ?? 1;
          const radius = 16 + Math.min(count, 20) * 1.4;
          return (
            <View
              key={marker.id}
              pointerEvents="none"
              style={[
                styles.cluster,
                {
                  left: px - radius,
                  top: py - radius,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: radius,
                  backgroundColor: LEVEL_COLORS[level],
                },
              ]}>
              <Text style={styles.clusterText}>{count}</Text>
            </View>
          );
        }
        if (marker.kind === 'user') {
          return (
            <View
              key={marker.id}
              pointerEvents="none"
              style={[styles.user, { left: px - 8, top: py - 8 }]}
            />
          );
        }
        if (marker.kind === 'trailhead') {
          return (
            <View
              key={marker.id}
              pointerEvents="none"
              style={[styles.trailhead, { left: px - 9, top: py - 9 }]}
            />
          );
        }
        const color = marker.level ? LEVEL_COLORS[marker.level] : '#0a7ea4';
        return (
          <View
            key={marker.id}
            pointerEvents="none"
            style={[styles.dot, { left: px - 6, top: py - 6, backgroundColor: color }]}
          />
        );
      })}

      {pin && pinScreen ? (
        <View
          pointerEvents="none"
          style={[
            styles.pin,
            { left: pinScreen.x - 11, top: pinScreen.y - 11 },
          ]}
        />
      ) : null}

      <View pointerEvents="none" style={styles.attribution}>
        <Text style={styles.attributionText}>© OpenStreetMap · z{z}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  tile: {
    position: 'absolute',
    width: TILE,
    height: TILE,
  },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0a7ea4',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  user: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PIN_COLOR,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  trailhead: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: TRAILHEAD_COLOR,
    borderWidth: 3,
    borderColor: '#ffffff',
    transform: [{ rotate: '45deg' }],
  },
  hotspot: {
    position: 'absolute',
    opacity: 0.45,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  cluster: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  clusterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pin: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PIN_COLOR,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  attribution: {
    position: 'absolute',
    right: 4,
    bottom: 2,
  },
  attributionText: {
    fontSize: 9,
    color: '#374151',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 3,
  },
});
