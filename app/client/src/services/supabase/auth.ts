import { supabase } from '../../lib/supabase';

// Reads the user from the locally stored session (no network round trip).
// RLS still validates the JWT server-side on every data request, so this only
// supplies the user id for queries/inserts.
export async function requireUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
  if (!data.session?.user) {
    throw new Error('User not authenticated');
  }
  return data.session.user;
}
