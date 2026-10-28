import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Asset,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import { SERVER_URL, addSighting, getSpeciesInfo } from './src/api';
import { getCurrentCoordinates } from './src/geolocation';
import MapView from './src/MapView';
import MapScreen from './src/MapScreen';
import SpeciesInfoCard from './src/SpeciesInfoCard';
import type {
  Coordinates,
  Prediction,
  SpeciesInfo,
  Theme,
} from './src/types';

type UploadAsset = Asset & { file?: Blob };

type Tab = 'identify' | 'map';

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

async function classify(asset: UploadAsset): Promise<Prediction[]> {
  const form = new FormData();
  if (asset.file) {
    (
      form.append as unknown as (
        name: string,
        value: Blob,
        fileName?: string,
      ) => void
    )('file', asset.file, asset.fileName ?? 'bird.jpg');
  } else {
    form.append('file', {
      uri: asset.uri,
      name: 'bird.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  const response = await fetch(`${SERVER_URL}/predict?top_k=5`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }

  const data: { predictions: Prediction[] } = await response.json();
  return data.predictions;
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent isDarkMode={isDarkMode} />
    </SafeAreaProvider>
  );
}

function AppContent({ isDarkMode }: { isDarkMode: boolean }) {
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<Asset | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const theme = isDarkMode ? dark : light;
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  useEffect(() => {
    fetch(`${SERVER_URL}/health`)
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const run = useCallback(async (asset: Asset) => {
    if (!asset.uri) {
      return;
    }
    setImage(asset);
    setPredictions([]);
    setError(null);
    setBusy(true);
    try {
      setPredictions(await classify(asset));
      setOnline(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOnline(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = useCallback(async () => {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (asset) {
      await run(asset);
    }
  }, [run]);

  const shoot = useCallback(async () => {
    if (!(await requestCameraPermission())) {
      setError('Camera permission denied');
      return;
    }
    const result = await launchCamera({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (asset) {
      await run(asset);
    }
  }, [run]);

  const [tab, setTab] = useState<Tab>('identify');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinates | null>(null);
  const [mapZoom, setMapZoom] = useState(17);
  const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [speciesAttempt, setSpeciesAttempt] = useState(0);

  const topLabel = predictions[0]?.label ?? null;

  useEffect(() => {
    if (!topLabel) {
      setSpeciesInfo(null);
      setSpeciesError(null);
      setSpeciesLoading(false);
      return;
    }
    let cancelled = false;
    setSpeciesInfo(null);
    setSpeciesError(null);
    setSpeciesLoading(true);
    getSpeciesInfo(topLabel)
      .then(info => {
        if (!cancelled) {
          setSpeciesInfo(info);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setSpeciesError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSpeciesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [topLabel, speciesAttempt]);

  const retrySpeciesInfo = useCallback(() => {
    setSpeciesAttempt(attempt => attempt + 1);
  }, []);

  const locateForPin = useCallback(async () => {
    try {
      const coords = await getCurrentCoordinates();
      setPin(coords);
      setMapCenter(coords);
      setMapZoom(17);
      setSaveMessage(null);
    } catch (e) {
      setSaveMessage(
        `Enable location access, or tap the map to place the pin (${e instanceof Error ? e.message : String(e)}).`,
      );
    }
  }, []);

  useEffect(() => {
    if (predictions.length > 0) {
      setPin(null);
      locateForPin();
    }
  }, [predictions, locateForPin]);

  const saveSighting = useCallback(async () => {
    if (predictions.length === 0) {
      return;
    }
    if (!pin) {
      setSaveMessage('Place a pin on the map first (tap “Use my GPS”).');
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const top = predictions[0];
      await addSighting({
        label: top.label,
        probability: top.probability,
        latitude: pin.latitude,
        longitude: pin.longitude,
      });
      setSaveMessage(
        `Added ${top.label} to the map at ${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`,
      );
    } catch (e) {
      setSaveMessage(
        `Could not save: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }, [predictions, pin]);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          isWide && styles.containerWide,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}>
        <Text style={[styles.title, { color: theme.text }]}>BirdSpotter</Text>
        <View style={[styles.tabs, { backgroundColor: theme.card }]}>
          {(['identify', 'map'] as const).map(t => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[
                  styles.tab,
                  active && { backgroundColor: theme.accent },
                ]}>
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? '#ffffff' : theme.text },
                  ]}>
                  {t === 'identify' ? 'Identify' : 'Bird map'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'identify' ? (
          <>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        {online === null
          ? 'Checking server...'
          : online
          ? `Server online at ${SERVER_URL}`
          : `Server unreachable at ${SERVER_URL}`}
      </Text>

      <View style={styles.row}>
        <Pressable
          onPress={pick}
          disabled={busy}
          style={[styles.button, { backgroundColor: theme.accent }]}>
          <Text style={styles.buttonText}>Gallery</Text>
        </Pressable>
        <Pressable
          onPress={shoot}
          disabled={busy}
          style={[styles.button, { backgroundColor: theme.accent }]}>
          <Text style={styles.buttonText}>Camera</Text>
        </Pressable>
      </View>

      {image?.uri ? (
        <Image
          source={{ uri: image.uri }}
          resizeMode="cover"
          style={[styles.preview, isWide && styles.previewWide]}
        />
      ) : null}

      {busy ? (
        <ActivityIndicator
          size="large"
          color={theme.accent}
          style={styles.spinner}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {predictions.map((p, index) => (
        <View
          key={p.label}
          style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardRank, { color: theme.muted }]}>
              {index + 1}
            </Text>
            <Text style={[styles.cardLabel, { color: theme.text }]}>
              {p.label}
            </Text>
            <Text style={[styles.cardProb, { color: theme.muted }]}>
              {(p.probability * 100).toFixed(2)}%
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: theme.track }]}>
            <View
              style={[
                styles.barFill,
                {
                  backgroundColor: theme.accent,
                  width: `${Math.max(p.probability * 100, 0.5)}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}

      {topLabel ? (
        <SpeciesInfoCard
          label={topLabel}
          info={speciesInfo}
          loading={speciesLoading}
          error={speciesError}
          onRetry={retrySpeciesInfo}
          theme={theme}
        />
      ) : null}

      {!busy && predictions.length === 0 && !error ? (
        <Text style={[styles.hint, { color: theme.muted }]}>
          Pick or capture a bird photo to classify it.
        </Text>
      ) : null}

      {predictions.length > 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            Add to map
          </Text>
          <Text style={[styles.saveHint, { color: theme.muted }]}>
            “{predictions[0].label}” · {(predictions[0].probability * 100).toFixed(0)}% confidence.
            Tap the map to fine-tune the pin, or drag it.
          </Text>
          {mapCenter && pin ? (
            <View style={styles.pickerMap}>
              <MapView
                center={mapCenter}
                zoom={mapZoom}
                markers={[]}
                pin={pin}
                height={260}
                onPinChange={setPin}
                onCenterChange={setMapCenter}
                onZoomChange={setMapZoom}
              />
            </View>
          ) : (
            <Text style={[styles.saveHint, { color: theme.muted }]}>
              Waiting for your location…
            </Text>
          )}
          <View style={styles.row}>
            <Pressable
              onPress={locateForPin}
              style={[styles.secondaryButton, { backgroundColor: theme.bg }]}>
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Use my GPS
              </Text>
            </Pressable>
            <Pressable
              onPress={saveSighting}
              disabled={saving || !pin}
              style={[
                styles.saveButton,
                { backgroundColor: theme.accent, opacity: !pin ? 0.5 : 1 },
              ]}>
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Save to map</Text>
              )}
            </Pressable>
          </View>
          {saveMessage ? (
            <Text style={[styles.saveHint, { color: theme.muted }]}>
              {saveMessage}
            </Text>
          ) : null}
        </View>
      ) : null}
          </>
        ) : (
          <MapScreen theme={theme} />
        )}
      </ScrollView>
    </View>
  );
}

const light: Theme = {
  bg: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  card: '#f3f4f6',
  track: '#e5e7eb',
  accent: '#0a7ea4',
};

const dark: Theme = {
  bg: '#111827',
  text: '#f9fafb',
  muted: '#9ca3af',
  card: '#1f2937',
  track: '#374151',
  accent: '#38bdf8',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
  },
  containerWide: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginTop: 14,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  saveHint: {
    fontSize: 12,
    marginTop: 8,
  },
  pickerMap: {
    marginTop: 12,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginTop: 20,
  },
  previewWide: {
    height: 420,
  },
  spinner: {
    marginTop: 24,
  },
  error: {
    color: '#dc2626',
    marginTop: 16,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardRank: {
    width: 22,
    fontSize: 13,
  },
  cardLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  cardProb: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  hint: {
    marginTop: 28,
    textAlign: 'center',
  },
});

export default App;
