import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['workflow.spec.ts', 'manual-drawing.spec.ts', 'quick-room.spec.ts', 'direct-openings.spec.ts', 'direct-placement.spec.ts', 'drawing-recovery.spec.ts', 'group-editing.spec.ts', 'group-gestures.spec.ts', 'mobile-drawing.spec.ts', 'precision-drawing.spec.ts'], workers: 1, timeout: 45_000,
  globalSetup: './server.ts', outputDir: './artifacts/test-results', reporter: 'line',
  use: { launchOptions: { executablePath: process.env.SPATIAL_BROWSER_EXECUTABLE, args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] } },
});
