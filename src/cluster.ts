import type { Coordinates, HotspotLevel, Sighting } from './types';

export const RELATED_DISTANCE_METERS = 200;

export type SightingCluster = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  count: number;
  avgProbability: number;
  level: HotspotLevel;
  memberIds: string[];
  latest: string;
};

export function levelFromCount(count: number): HotspotLevel {
  if (count >= 4) {
    return 'high';
  }
  if (count >= 2) {
    return 'medium';
  }
  return 'low';
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const earth = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Accumulator = {
  label: string;
  latSum: number;
  lngSum: number;
  probSum: number;
  count: number;
  memberIds: string[];
  latest: string;
};

export function clusterSightings(
  sightings: Sighting[],
  toleranceMeters: number = RELATED_DISTANCE_METERS,
): SightingCluster[] {
  const accumulators: Accumulator[] = [];

  for (const sighting of sightings) {
    let best: Accumulator | null = null;
    let bestDistance = Infinity;
    for (const acc of accumulators) {
      if (acc.label !== sighting.label) {
        continue;
      }
      const distance = distanceMeters(
        { latitude: acc.latSum / acc.count, longitude: acc.lngSum / acc.count },
        sighting,
      );
      if (distance <= toleranceMeters && distance < bestDistance) {
        best = acc;
        bestDistance = distance;
      }
    }

    if (best) {
      best.latSum += sighting.latitude;
      best.lngSum += sighting.longitude;
      best.probSum += sighting.probability;
      best.count += 1;
      best.memberIds.push(sighting.id);
      if (sighting.created_at > best.latest) {
        best.latest = sighting.created_at;
      }
    } else {
      accumulators.push({
        label: sighting.label,
        latSum: sighting.latitude,
        lngSum: sighting.longitude,
        probSum: sighting.probability,
        count: 1,
        memberIds: [sighting.id],
        latest: sighting.created_at,
      });
    }
  }

  return accumulators.map((acc, index) => {
    const latitude = acc.latSum / acc.count;
    const longitude = acc.lngSum / acc.count;
    return {
      id: `cluster-${index}-${acc.label}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`,
      label: acc.label,
      latitude,
      longitude,
      count: acc.count,
      avgProbability: acc.probSum / acc.count,
      level: levelFromCount(acc.count),
      memberIds: acc.memberIds,
      latest: acc.latest,
    };
  });
}
