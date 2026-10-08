import { supabase } from '@/lib/supabase';
import { getImporterUrl } from '@/lib/config';

const IMPORTER_BASE = getImporterUrl();

export async function importerFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  return fetch(`${IMPORTER_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}
