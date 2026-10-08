
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';
import type { Database } from './database.types';


// Supabase configuration
// In dev, when the page is loaded from a non-local host (e.g. a LAN IP or a VPN
// such as Tailscale), route Supabase through the Vite proxy so the browser doesn't
// try to reach 127.0.0.1 (which resolves to the client machine, not the dev server).
const _rawSupabaseUrl = getSupabaseUrl();
// When the app is accessed from a remote host (LAN IP, VPN, etc.) in dev mode,
// proxy local Supabase requests through Vite so the browser doesn't try to
// reach 127.0.0.1 directly. Only applies when the configured URL is local —
// production HTTPS URLs are reachable directly from any host.
const supabaseUrl = (() => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return _rawSupabaseUrl;
  const isLocalUrl = _rawSupabaseUrl.includes('127.0.0.1') || _rawSupabaseUrl.includes('localhost');
  if (!isLocalUrl) return _rawSupabaseUrl; // production URL — use directly
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return _rawSupabaseUrl;
  return `${window.location.origin}/__supabase`; // remote host: route through Vite proxy
})();
const supabaseKey = getSupabaseAnonKey();


// Create Supabase client with auth config
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Test connection
/* supabase.from('categories').select('count').single()
  .then(({ error }) => {
    if (error) {
      console.error('Supabase connection test failed:', error);
    } else {
      console.log('Supabase connection test successful');
    }
  }); */

export type { Database };
export type TransactionSplitRow = Database['public']['Views']['v_transaction_splits']['Row'];
export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
