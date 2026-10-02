import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000,
  // One worker: the scripted course runs are real-time and slow down when browsers share the CPU.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 960, height: 540 },
    // The cloud sandbox proxies HTTPS with its own CA; trust it so the webfont request doesn't log an error.
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
