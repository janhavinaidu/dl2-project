import { Platform } from 'react-native';
import type { Hotspot, Sighting, SightingInput, SpeciesInfo } from './types';

export const SERVER_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Server responded ${response.status}`;
    const body = await response.json().catch(() => null);
    if (body && typeof body.detail === 'string') {
      message = body.detail;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== '',
  ) as [string, string][];
  if (entries.length === 0) {
    return '';
  }
  const search = new URLSearchParams(entries).toString();
  return `?${search}`;
}

export function getSpeciesInfo(name: string): Promise<SpeciesInfo> {
  return json<SpeciesInfo>(`${SERVER_URL}/species${query({ name })}`);
}

export async function getSightings(label?: string): Promise<Sighting[]> {
  const data = await json<{ sightings: Sighting[] }>(
    `${SERVER_URL}/sightings${query({ label })}`,
  );
  return data.sightings;
}

export type HotspotResult = {
  hotspots: Hotspot[];
  center: { latitude: number; longitude: number } | null;
  max_count: number;
};

export function getHotspots(label?: string): Promise<HotspotResult> {
  return json<HotspotResult>(`${SERVER_URL}/hotspots${query({ label })}`);
}

export function addSighting(input: SightingInput): Promise<Sighting> {
  return json<Sighting>(`${SERVER_URL}/sightings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteSighting(id: string): Promise<{ removed: boolean }> {
  return json<{ removed: boolean }>(`${SERVER_URL}/sightings/${id}`, {
    method: 'DELETE',
  });
}
