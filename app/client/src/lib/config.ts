// Runtime config injected by nginx at container startup via /config.js.
// Falls back to Vite build-time vars so `npm run dev` works without Docker.
declare global {
  interface Window {
    __PFM_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      oauthEnabled?: boolean;
      autoLoginEmail?: string;
      autoLoginPassword?: string;
    };
  }
}

export function getSupabaseUrl(): string {
  const v = window.__PFM_CONFIG__?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  if (!v) throw new Error(
    'SUPABASE_URL is not configured. ' +
    'Set it as an environment variable when running the Docker container.'
  );
  return v;
}

export function getSupabaseAnonKey(): string {
  const v = window.__PFM_CONFIG__?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!v) throw new Error(
    'SUPABASE_ANON_KEY is not configured. ' +
    'Set it as an environment variable when running the Docker container.'
  );
  return v;
}

export function getAutoLoginCredentials(): { email: string; password: string } | null {
  // Runtime config (nginx-injected) is honored in any build. The Vite build-time vars are a
  // dev-only convenience — gated behind DEV so a production build never bakes credentials into
  // the browser bundle.
  const email = window.__PFM_CONFIG__?.autoLoginEmail ?? (import.meta.env.DEV ? import.meta.env.VITE_AUTO_LOGIN_EMAIL : undefined);
  const password = window.__PFM_CONFIG__?.autoLoginPassword ?? (import.meta.env.DEV ? import.meta.env.VITE_AUTO_LOGIN_PASSWORD : undefined);
  if (email && password) return { email, password };
  return null;
}

// In Docker, nginx proxies /api/ → importer (same origin, no CORS).
// In dev, falls back to VITE_IMPORTER_URL from .env.local.
// Resolve relative values against the origin so `new URL(...)` / fetch always get an absolute URL.
export function getImporterUrl(): string {
  const url = import.meta.env.VITE_IMPORTER_URL ?? '/api';
  return new URL(url, window.location.origin).toString();
}

// In Docker, nginx proxies /mcp → mcp server (same origin, TLS handled by the app).
// In dev, point VITE_MCP_URL at your MCP server (e.g. http://localhost:3100/mcp).
export function getMcpUrl(): string {
  const url = import.meta.env.VITE_MCP_URL ?? '/mcp';
  return new URL(url, window.location.origin).toString();
}
