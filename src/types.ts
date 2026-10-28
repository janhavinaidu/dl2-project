export type Prediction = {
  label: string;
  probability: number;
};

export type SpeciesInfo = {
  summary: string;
  fun_fact: string;
  cached?: boolean;
};

export type HotspotLevel = 'high' | 'medium' | 'low';

export type Sighting = {
  id: string;
  label: string;
  probability: number;
  latitude: number;
  longitude: number;
  created_at: string;
};

export type SightingInput = {
  label: string;
  probability: number;
  latitude: number;
  longitude: number;
};

export type Hotspot = {
  latitude: number;
  longitude: number;
  count: number;
  score: number;
  level: HotspotLevel;
  avg_probability: number;
  top_labels: { label: string; count: number }[];
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Theme = {
  bg: string;
  text: string;
  muted: string;
  card: string;
  track: string;
  accent: string;
};
