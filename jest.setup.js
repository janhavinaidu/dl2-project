jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(() => Promise.resolve(true)),
    getCurrentPosition: jest.fn(success =>
      success({ coords: { latitude: 0, longitude: 0 }, timestamp: 0 }),
    ),
    watchPosition: jest.fn(() => 0),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
