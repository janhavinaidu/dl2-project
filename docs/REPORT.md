# BirdSpotter — Architecture & Technical Report

**Version:** 0.0.1
**Report date:** 2026-10-15
**Repository:** `dl_2/BirdSpotter` (React Native + Python backend)
**Status:** Working — identification, geotagged sighting capture (web + native), and a proximity-clustered public bird map.

---

## 1. Executive summary

BirdSpotter is a bird identification and crowd-sourced mapping application. A user photographs a bird, a convolutional neural network (525 classes) identifies it with a confidence score, and the user pins the sighting on a map. Every sighting from every user is aggregated on a shared "Bird map", where each bird is rated **High / Medium / Low** based on **how often that species was spotted nearby** (within 200 m), not on the per-photo model score.

The product ships from **one TypeScript codebase** to two targets:

| Target | Runtime | Bundle | Entry |
|---|---|---|---|
| Android/iOS app | React Native 0.87 (Metro) | Hermes/native | `index.js` |
| Laptop web browser | React Native Web + Vite | ES modules | `web/main.tsx` |

A single **FastAPI** service hosts the ML model (Keras 3 on the PyTorch backend) and the sighting store (a JSON file guarded by a lock).

---

## 2. Purpose & feature set

1. **Identify** — pick a photo from the gallery or capture one with the camera; the model returns the top-5 species with probabilities.
2. **Save to map** — the confirmed species is pinned at the user's GPS location. The pin is **adjustable**: tap the map or drag the pin to fine-tune the exact spot.
3. **Bird map** — a global OpenStreetMap view of all sightings. Sightings of the same species within 200 m are merged into one **location cluster**, coloured and labelled by frequency:
   - **1 sighting → Low**
   - **2–3 sightings → Medium**
   - **4+ sightings → High**

Additional UX: species filter chips, a ranked list of clusters with average model confidence, zoom (buttons, mouse wheel, pinch), pan (drag), "Locate me", "Refresh", dark-mode aware theming, and responsive full-screen layout on wide screens.

---

## 3. Technology stack

### Client
| Area | Choice | Version |
|---|---|---|
| UI framework | React Native | 0.87.1 |
| React | React / React DOM | 19.2.3 |
| Web renderer | react-native-web | 0.21.4 |
| Web bundler | Vite (`@vitejs/plugin-react`) | 8.3.4 |
| Language | TypeScript | 6.0.3 |
| Image input | react-native-image-picker | 8.3.0 |
| Location | @react-native-community/geolocation | 3.4.0 |
| Safe areas | react-native-safe-area-context | 5.5.2 |
| Testing | Jest + react-test-renderer | 29.6.3 |
| Linting | ESLint (`@react-native/eslint-config`) | 8.x |

### Server
| Area | Choice | Version |
|---|---|---|
| Web framework | FastAPI | latest |
| ASGI server | uvicorn[standard] | latest |
| Validation | Pydantic (v2 API, `model_dump`) | via FastAPI |
| ML framework | Keras (PyTorch backend) | 3.5.0 |
| Tensor backend | torch (CPU) | 2.7.0+cpu |
| Imaging | Pillow | latest |
| Numerics | NumPy | latest |
| Storage | JSON file + `threading.Lock` | — |

### External
- **OpenStreetMap raster tiles** — `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (requires internet from the browser/device).

---

## 4. System architecture

### 4.1 Logical view

```mermaid
flowchart LR
  subgraph Client["Client (single TS codebase)"]
    direction TB
    UI["App.tsx<br/>tabs · identify · save"]
    MAP["MapScreen.tsx<br/>clusters · filter · list"]
    TILE["MapView.tsx<br/>XYZ tile engine + gestures"]
    CLU["cluster.ts<br/>haversine grouping"]
    API["api.ts<br/>fetch client"]
    GEO["geolocation.ts"]
    UI --> TILE
    MAP --> TILE
    MAP --> CLU
    UI --> API
    MAP --> API
    UI --> GEO
    MAP --> GEO
  end

  subgraph Web["Web shim layer (Vite alias)"]
    RN["react-native -> react-native-web"]
    IP["image-picker -> HTML file input"]
    SA["safe-area-context -> zero insets"]
    GL["geolocation -> navigator.geolocation"]
  end

  subgraph Server["Backend (Python · FastAPI · :8000)"]
    PRED["POST /predict<br/>Keras inference"]
    STORE["sightings.json<br/>thread-locked store"]
    HOT["GET /hotspots<br/>grid clustering (retained)"]
  end

  MODEL[["model.keras<br/>525 classes · 224x224"]]
  TILES[("OpenStreetMap<br/>tile server")]
  DISK[("assets/model.keras<br/>assets/labels.txt")]

  API -->|"JSON / multipart"| Server
  Client -.->|"aliased on web"| Web
  PRED --> MODEL
  MODEL --- DISK
  TILE -->|"tiles (HTTPS)"| TILES
  STORE --- DISK
```

### 4.2 ASCII fallback (same architecture)

```
        ┌─────────────────────────────────────────────────────────────┐
        │                    CLIENT (TypeScript)                       │
        │                                                             │
        │  App.tsx ──────────► MapView.tsx ◄────────── MapScreen.tsx   │
        │   (tabs,               (XYZ tiles,              (clusters,   │
        │    identify,            pan/zoom/pin)           filter,list) │
        │    save pin)                 ▲                        │      │
        │      │                       │                        ▼      │
        │      ▼                       │                   cluster.ts   │
        │  api.ts ──────────────┐      │                  (haversine)   │
        │  geolocation.ts       │      │                               │
        └───────────────────────┼──────┼───────────────────────────────┘
                                │      │
             (web only) Vite    │      │  HTTPS tiles
             aliases RN deps ───┘      ▼
                                │   ┌───────────────────────┐
                                ▼   │ tile.openstreetmap.org│
                    ┌───────────────────────────────────┐     │
                    │   BACKEND  FastAPI  :8000          │     │
                    │  /predict  /sightings  /hotspots   │◄────┘
                    │  /labels   /health                 │
                    │         │                          │
                    │         ▼                          │
                    │   model.keras (torch)  sightings.json
                    └───────────────────────────────────┘
```

### 4.3 Deployment view

```mermaid
flowchart TB
  Browser["Laptop browser<br/>http://localhost:5173 (Vite)"]
  Phone["Android/iOS device<br/>Metro bundle"]
  Backend["uvicorn server.py<br/>0.0.0.0:8000"]
  OSM["tile.openstreetmap.org"]

  Browser -->|"/predict, /sightings (CORS *)"| Backend
  Browser -->|"map tiles"| OSM
  Phone -->|"10.0.2.2:8000 (emulator)"| Backend
  Phone -->|"map tiles"| OSM
```

> The web app is served from `:5173` while the API runs on `:8000`; cross-origin access is enabled by `CORSMiddleware(allow_origins=["*"])`.

---

## 5. Repository layout

```
BirdSpotter/
├─ App.tsx                     # App shell: theming, tabs, identify + save-to-map flow
├─ index.js                    # Native entry (AppRegistry)
├─ app.json                    # App name/display name (shared by web entry)
├─ src/
│  ├─ api.ts                   # Typed fetch client + SERVER_URL per platform
│  ├─ cluster.ts               # Proximity clustering + count→level mapping
│  ├─ geolocation.ts           # Promise wrapper over native geolocation
│  ├─ MapView.tsx              # OSM XYZ tile engine, markers, pin, gestures
│  ├─ MapScreen.tsx            # Bird map: clusters, species filter, ranked list
│  └─ types.ts                 # Shared domain types
├─ web/                        # Web-only layer (Vite root)
│  ├─ index.html               # HTML host (#root, full-height CSS)
│  ├─ main.tsx                 # Web entry (AppRegistry.runApplication)
│  ├─ globals.d.ts             # Module + __DEV__ declarations
│  └─ shims/                   # Replacements for native-only modules
│     ├─ react-native.ts        # re-export RNW + PermissionsAndroid stub
│     ├─ image-picker.ts        # HTML <input type=file capture>
│     ├─ safe-area-context.tsx  # zero insets / no-op provider
│     └─ geolocation.ts         # navigator.geolocation adapter
├─ server.py                   # FastAPI: predict + sightings + hotspots
├─ predict.py                  # CLI single-image classifier (dev tool)
├─ smoke_test.py               # Model load sanity check
├─ requirements.txt            # Python dependencies
├─ sightings.json              # Persisted sightings (git-ignored)
├─ vite.config.mjs             # Web build + RN→shim aliases
├─ tsconfig.json / tsconfig.web.json
├─ jest.config.js / jest.setup.js / __tests__/App.test.tsx
├─ .eslintrc.js / .eslintignore / .prettierrc.js
├─ android/ · ios/             # Native hosts (permissions, launcher)
└─ README.md                   # Upstream RN getting-started (default)
```

---

## 6. Component reference

### 6.1 Application shell — `App.tsx`
- Wraps the tree in `SafeAreaProvider`; picks light/dark theme via `useColorScheme()`.
- Two tabs: **Identify** (`identify`) and **Bird map** (`map`).
- **Identify flow:** `classify()` builds a `FormData` (native = `{uri,name,type}`; web = real `File`/`Blob`) and `POST`s to `/predict?top_k=5`; renders top-5 as probability bars.
- **Save-to-map flow:** when predictions arrive, `locateForPin()` fetches GPS and seeds the adjustable pin + map centre (zoom 17). The user may **tap** or **drag** the pin. `saveSighting()` POSTs `{label, probability, latitude, longitude}` for the top prediction.
- Responsive: `isWide = width ≥ 768` centres content at `maxWidth: 900`.

### 6.2 Map screen — `src/MapScreen.tsx`
- Loads all sightings (`getSightings()`), clusters them (`clusterSightings`), and computes a sensible centre/zoom (user GPS if present, else the sightings' centroid; zoom derived from coordinate spread).
- Renders species filter chips (derived from cluster labels), the `MapView`, zoom/locate/refresh controls, a legend, and a ranked list of clusters (`×N`, level badge, avg model %).
- Explains the confidence rule inline: *"1 = Low · 2–3 = Medium · 4+ = High, within 200 m"*.

### 6.3 Tile engine — `src/MapView.tsx`
A dependency-free slippy-map renderer usable on both platforms:
- **Projection:** Web Mercator. `worldX = (lng+180)/360 · 2^z · 256`; `worldY` via the inverse Gudermannian; inverse functions convert screen points back to lat/lng.
- **Tiles:** visible range `⌊left/256⌋ … ⌊(left+W)/256⌋` × Y-range; each tile is an absolutely-positioned `Image` at `(x·256−left, y·256−top)`.
- **Markers:** kinds `cluster` (count bubble coloured by level, radius scales with count), `hotspot`, `sighting`, `user`, `trailhead`; off-screen markers are culled.
- **Gestures (`PanResponder`):** drag-to-pan, two-finger pinch-to-zoom, single tap / drag of the pin (picker mode), plus a native `wheel` listener on web (attached to the RNW DOM node) for scroll-zoom. A `useWindowDimensions` fallback width prevents zero-size rendering.
- **Zoom bounds:** `MIN_ZOOM=3 … MAX_ZOOM=19`.

### 6.4 Clustering engine — `src/cluster.ts`
- `distanceMeters()` — haversine great-circle distance.
- `clusterSightings(sightings, tolerance = 200 m)` — single-pass greedy grouping: a sighting joins the nearest existing cluster **of the same label** whose running centroid is within tolerance, otherwise starts a new cluster. Returns per-cluster centroid, count, `avgProbability`, `memberIds`, `latest`.
- `levelFromCount()` — `≥4 → high`, `≥2 → medium`, else `low`.

### 6.5 API client — `src/api.ts`
- `SERVER_URL`: `http://10.0.2.2:8000` on Android (emulator loopback), else `http://localhost:8000`.
- Typed helpers: `getSightings(label?)`, `getHotspots(label?)`, `addSighting(input)`, `deleteSighting(id)`; a `query()` helper omits empty params.

### 6.6 Geolocation — `src/geolocation.ts`
Promise wrapper around `getCurrentPosition` with `enableHighAccuracy`, 15 s timeout, 10 s max age. On web the import resolves to `web/shims/geolocation.ts` (`navigator.geolocation`, available only on `localhost`/HTTPS).

### 6.7 Web shim layer — `web/` + `vite.config.mjs`
Vite aliases native-only modules to browser equivalents so the RN code runs unchanged in a browser:

| Import (native) | Alias target | Behaviour |
|---|---|---|
| `react-native` | `web/shims/react-native.ts` | `export * from 'react-native-web'` + `PermissionsAndroid` stub |
| `react-native-image-picker` | `web/shims/image-picker.ts` | Hidden `<input type=file accept=image/* capture>`; returns `{uri,fileName,type,file}` |
| `react-native-safe-area-context` | `web/shims/safe-area-context.tsx` | Zero insets, `SafeAreaProvider` = `<Fragment>` |
| `@react-native-community/geolocation` | `web/shims/geolocation.ts` | `navigator.geolocation` adapter |

Also: `root = web/`, `outDir = web-dist/`, `define global=globalThis`, `__DEV__`, `dedupe` React, `.web.*` extension priority.

### 6.8 Backend — `server.py`
- **Startup:** loads the Keras model, resolves labels (else `class i`), reads image size; loads `sightings.json`.
- **Inference:** `POST /predict` reads bytes → PIL RGB → resize → softmax over logits → top-k (manual softmax for stability).
- **Store:** in-memory list mirrored to `sightings.json`; writes are atomic (`.tmp` + `os.replace`) under a `threading.Lock`.
- **Retained helper:** `GET /hotspots` performs grid (default cell `0.0009°`) clustering with **relative** scoring (`score = 100·count/max`, level at ≥66/≥33). The current UI computes confidence client-side via `cluster.ts`; the endpoint remains available/backwards-compatible.

### 6.9 Model
- `assets/model.keras` (fallback `../Image_classify_Birds_Model.keras`); `assets/labels.txt` for class names.
- Input `224×224×3`, output 525 classes; softmax computed by hand from logits.

---

## 7. Data model

```mermaid
classDiagram
  class Sighting {
    +string id
    +string label
    +float probability
    +float latitude
    +float longitude
    +string created_at
  }
  class SightingInput {
    +string label
    +float probability
    +float latitude
    +float longitude
  }
  class SightingCluster {
    +string id
    +string label
    +float latitude
    +float longitude
    +int count
    +float avgProbability
    +HotspotLevel level
    +string[] memberIds
    +string latest
  }
  class Prediction {
    +string label
    +float probability
  }
  class MapMarker {
    +string id
    +float latitude
    +float longitude
    +kind
    +HotspotLevel level
    +int count
  }
  SightingInput <|-- Sighting
  Sighting --> SightingCluster : grouped by
```

Persisted JSON (`sightings.json`) is an array of `Sighting` objects, e.g.:

```json
[
  {
    "label": "CROW",
    "probability": 1.0,
    "latitude": 21.195521168122106,
    "longitude": 79.07519428928872,
    "id": "ca11edd6355d4f5d85d093c46596d076",
    "created_at": "2026-10-15T08:14:29.372105+00:00"
  }
]
```

`git` ignores `sightings.json`, `web-dist/`, `node_modules/`, native build dirs and keystores.

---

## 8. API reference

| Method | Path | Query / Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{status, backend, classes, input, sightings}` |
| GET | `/labels` | — | `{labels: string[]}` |
| POST | `/predict` | multipart `file`; `?top_k=5` | `{predictions: [{label, probability}]}` |
| POST | `/sightings` | JSON `SightingInput` | created `Sighting` |
| GET | `/sightings` | `?label=` | `{sightings: Sighting[]}` |
| DELETE | `/sightings/{id}` | — | `{removed: bool, sightings: int}` |
| GET | `/hotspots` | `?label=&cell=0.0009` | `{hotspots, center, max_count}` |

---

## 9. Runtime flows

### 9.1 Identify → save to map

```mermaid
sequenceDiagram
  actor U as User
  participant A as App.tsx
  participant IP as ImagePicker (shim on web)
  participant API as FastAPI /predict
  participant M as Keras model
  participant G as Geolocation
  participant S as FastAPI /sightings

  U->>A: Tap Gallery/Camera
  A->>IP: launchImageLibrary / launchCamera
  IP-->>A: Asset {uri|file, fileName, type}
  A->>API: POST /predict?top_k=5 (multipart)
  API->>M: model.predict(image)
  M-->>API: logits -> softmax
  API-->>A: top-5 predictions
  A->>G: getCurrentCoordinates()
  G-->>A: {lat, lng}
  A->>A: show adjustable pin (tap/drag to refine)
  U->>A: Tap "Save to map"
  A->>S: POST /sightings {label, probability, lat, lng}
  S->>S: append + atomic persist (lock)
  S-->>A: created Sighting
  A-->>U: "Added <bird> to the map at lat, lng"
```

### 9.2 View map → cluster → confidence

```mermaid
sequenceDiagram
  actor U as User
  participant M as MapScreen
  participant API as FastAPI /sightings
  participant C as cluster.ts
  participant V as MapView

  U->>M: Open "Bird map"
  M->>API: GET /sightings
  API-->>M: all sightings
  M->>C: clusterSightings(list, 200 m)
  C-->>M: clusters with count + level
  M->>V: render cluster bubbles (colour = level, size = count)
  M-->>U: ranked list (×N, avg model %, time)
  U->>M: Select species chip
  M->>M: filter clusters client-side
```

---

## 10. Confidence scoring (two distinct notions)

| Where | Meaning | Source |
|---|---|---|
| **Identify tab** | Model confidence for the photo | Softmax probability from `/predict` (e.g. `88%`) |
| **Bird map** | Sighting frequency at a location | `clusterSightings` count → `levelFromCount` (Low/Medium/High), within 200 m |

```
level(count) = count >= 4 ? High
             : count >= 2 ? Medium
             :              Low
```

Tuning points: `RELATED_DISTANCE_METERS` (default `200`) and the thresholds in `levelFromCount()` (`src/cluster.ts`).

---

## 11. Platform matrix & build / run

| Concern | Native (Android/iOS) | Web |
|---|---|---|
| Entry | `index.js` → `AppRegistry` | `web/main.tsx` → `AppRegistry.runApplication` |
| Bundler | Metro | Vite |
| Image picker | `react-native-image-picker` | HTML file input shim |
| Geolocation | `@react-native-community/geolocation` | `navigator.geolocation` (localhost/HTTPS) |
| Safe areas | `react-native-safe-area-context` | zero-inset shim |
| API base | `10.0.2.2:8000` (Android) | `localhost:8000` |
| Layout | phone-sized | full-screen, centred `maxWidth 900` |

**Run the backend**
```powershell
.\.venv\Scripts\python.exe server.py        # 0.0.0.0:8000
```

**Run the web client**
```powershell
npm run web                                  # http://localhost:5173
```

**Run native**
```powershell
npm start            # Metro
npm run android      # or: npm run ios
```

---

## 12. Configuration & constants

| Constant | Location | Value | Purpose |
|---|---|---|---|
| `SERVER_URL` | `src/api.ts` | android `10.0.2.2:8000`, else `localhost:8000` | API host per platform |
| `MIN_ZOOM` / `MAX_ZOOM` | `src/MapView.tsx` | 3 / 19 | Tile zoom bounds |
| `TILE` | `src/MapView.tsx` | 256 | Tile pixel size |
| `RELATED_DISTANCE_METERS` | `src/cluster.ts` | 200 | Cluster radius |
| level thresholds | `src/cluster.ts` | 2 / 4 | Medium / High cut-offs |
| hotspot `cell` | `server.py` | 0.0009° | Server grid (retained endpoint) |
| `DATA_FILE` | `server.py` | `sightings.json` | Persistence |

Android permissions (`android/app/src/main/AndroidManifest.xml`): `INTERNET`, `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.

---

## 13. Build, test & quality gates

| Command | Purpose |
|---|---|
| `npm run typecheck` | TS check (native config) |
| `npm run typecheck:web` | TS check (DOM libs, web config) |
| `npm run lint` | ESLint |
| `npm test` | Jest (`__tests__/App.test.tsx` smoke render) |
| `npm run web:build` | Production web bundle → `web-dist/` |
| `python smoke_test.py` | Model loads and exposes shapes |
| `python predict.py <img> -k 5` | CLI classification sanity check |

`jest.setup.js` mocks geolocation so the smoke test runs headless. `tsconfig.json` excludes `web/`, `web-dist/`, `vite.config.mjs`; `tsconfig.web.json` adds `DOM` libs for the browser layer.

---

## 14. Security & privacy

- **No authentication** — the API is open; `CORS` allows all origins. Intended for local/LAN use.
- **Location is precise** — sightings store exact coordinates, visible to everyone. The clustering only *groups* them (200 m) for display; individual records remain exact.
- **No secrets** in the repo; `sightings.json`, keystores and build outputs are git-ignored.
- **Transport** is HTTP (cleartext) in dev; Android enables cleartext via the `usesCleartextTraffic` manifest placeholder.
- **Inference** runs server-side on CPU; no images persist (only label + coordinates are stored).

---

## 15. Known limitations & future work

**Limitations**
- Sightings are stored in a single JSON file with a process lock — not multi-process safe and not durable for scale.
- OpenStreetMap tile usage is fine for light/dev traffic; production should use a proper tile provider per its usage policy.
- Browser geolocation requires `localhost`/HTTPS; a LAN IP will block it.
- `GET /hotspots` still implements the older **relative** scoring and is unused by the current UI (client-side clustering is authoritative).
- `getHotspots()` in `src/api.ts` is currently unused by the UI.

**Suggested next steps**
- Swap the JSON store for SQLite/Postgres with a unique index and migrations.
- Add a `/clusters` (or extend `/hotspots`) server-side endpoint so clustering is authoritative and shared, not recomputed per client.
- Debounce/duplicate-suppress rapid repeat taps; add auth and per-user attribution.
- Replace raster tiles with a vector/cached provider; consider offline caching.
- Add integration tests for `cluster.ts` (distance + threshold boundaries) and the API.
- Reverse-geocode clusters to human-readable place names.

---

*Generated as a point-in-time architecture report. File/line references reflect the repository at the date above.*
