import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.auxiliumenvironmental.spatial', appName: 'Auxilium Spatial', webDir: 'dist',
  ios: { path: '../capacitor/ios' },
  server: { hostname: 'localhost', iosScheme: 'capacitor' }
};
export default config;
