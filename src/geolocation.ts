import Geolocation from '@react-native-community/geolocation';
import type { Coordinates } from './types';

export function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      error => reject(new Error(error.message || `location error ${error.code}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}
