import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5183',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1050 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5183/api/health',
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      NODE_ENV: 'test',
      PORT: '3011',
      WEB_PORT: '5183',
      APP_ORIGIN: 'http://127.0.0.1:5183',
      LOCAL_DATABASE_DIR: 'memory://',
      DATABASE_URL: '',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      LOCAL_DEMO_AUTH: 'true',
    },
  },
});
