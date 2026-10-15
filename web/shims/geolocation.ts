type PositionCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

type Position = {
  coords: PositionCoords;
  timestamp: number;
};

type PositionError = {
  code: number;
  message: string;
};

type Options = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

function toPosition(position: GeolocationPosition): Position {
  const c = position.coords;
  return {
    coords: {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude ?? null,
      altitudeAccuracy: c.altitudeAccuracy ?? null,
      heading: c.heading ?? null,
      speed: c.speed ?? null,
    },
    timestamp: position.timestamp,
  };
}

function toError(error: GeolocationPositionError): PositionError {
  return { code: error.code, message: error.message };
}

const Geolocation = {
  setRNConfiguration(_config: Record<string, unknown>) {},

  requestAuthorization: async (
    _success?: () => void,
    _error?: (error: PositionError) => void,
  ) => true,

  getCurrentPosition: (
    success: (position: Position) => void,
    error?: (error: PositionError) => void,
    options?: Options,
  ) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      error?.({ code: 2, message: 'Geolocation is not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => success(toPosition(position)),
      err => error?.(toError(err)),
      options,
    );
  },

  watchPosition: (
    success: (position: Position) => void,
    error?: (error: PositionError) => void,
    options?: Options,
  ) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      error?.({ code: 2, message: 'Geolocation is not supported' });
      return -1;
    }
    return navigator.geolocation.watchPosition(
      position => success(toPosition(position)),
      err => error?.(toError(err)),
      options,
    );
  },

  clearWatch: (watchId: number) => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  },

  stopObserving() {},

  addListener() {
    return { remove() {} };
  },
};

export default Geolocation;
