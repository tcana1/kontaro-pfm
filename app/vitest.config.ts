import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig({
  // svgr must match vite.config.ts so `*.svg?react` imports resolve to React
  // components in tests; without it they become data-URI strings and jsdom
  // throws "did not match the Name production" when a row renders an icon.
  plugins: [svgr({ svgrOptions: { exportType: 'default' } }), react()],
  root: path.resolve(__dirname, 'client'),
  define: {
    // Provide stub values so supabase.ts loads without crashing in tests
    // (tests that use Supabase mock it with vi.mock anyway).
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co'
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder'
    ),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Pinned to a negative UTC offset on purpose. The dev and CI boxes run in UTC, where
    // local midnight and UTC midnight coincide, so every date bug that depends on the
    // offset — new Date('2026-03-01') landing on Feb 28, toISOString() shifting a day —
    // passes silently. Most users are at UTC-3, so test there.
    env: { TZ: 'America/Sao_Paulo' },
    // Cap parallelism: each fork loads the full app graph + a jsdom instance,
    // so an uncapped fork-per-core pool exhausts memory on smaller machines.
    pool: 'forks',
    poolOptions: { forks: { minForks: 1, maxForks: 2 } },
    setupFiles: ['../tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}', '../tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['client/src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', '**/__tests__/**', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
});