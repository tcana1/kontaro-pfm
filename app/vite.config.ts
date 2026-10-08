import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, 'client'), '');
  const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
  // Auto-enable the Supabase proxy when the configured URL is local — covers any
  // non-localhost access to the dev server (LAN IP, VPN such as Tailscale, etc.)
  // without needing a separate env var.
  const isLocalSupabase = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
  const proxyTarget = process.env.SUPABASE_DEV_PROXY_TARGET ?? (isLocalSupabase ? supabaseUrl : undefined);

  return {
    plugins: [
      svgr({
        svgrOptions: {
          exportType: "default",
        },
      }),
      react(),
      runtimeErrorOverlay(),
      themePlugin(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer(),
            ),
          ]
        : []),
    ],
    test: {
      watch: false, // disables the default watch mode
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port: 8181,
      host: '0.0.0.0',
      // Restrict to comma-separated hostnames via VITE_ALLOWED_HOSTS, or allow all if unset.
      allowedHosts: process.env.VITE_ALLOWED_HOSTS
        ? process.env.VITE_ALLOWED_HOSTS.split(',')
        : true,
      // Proxy Supabase through the Vite dev server so browsers that can't reach the local
      // Supabase directly (remote devices on a LAN or VPN) route through the server instead.
      // Auto-enabled when VITE_SUPABASE_URL is a local address; override with
      // SUPABASE_DEV_PROXY_TARGET for non-standard setups.
      ...(proxyTarget && {
        proxy: {
          '/__supabase': {
            target: proxyTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/__supabase/, ''),
            ws: true,
          },
        },
      }),
    },
    preview: {
      port: 8181,
      host: '0.0.0.0',
      allowedHosts: process.env.VITE_ALLOWED_HOSTS
        ? process.env.VITE_ALLOWED_HOSTS.split(',')
        : true,
    },
  };
});
