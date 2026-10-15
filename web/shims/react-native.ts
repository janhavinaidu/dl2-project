export * from 'react-native-web';

export const PermissionsAndroid = {
  PERMISSIONS: {
    CAMERA: 'android.permission.CAMERA',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: async (_permission: string) => 'granted',
  check: async (_permission: string) => true,
  requestMultiple: async (_permissions: string[]) => ({}),
};
