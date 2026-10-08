import { supabase } from '../../lib/supabase';
import { requireUser } from './auth';

export async function getSettings(): Promise<any> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }

  return data;
}

export async function updateSettings(data: Record<string, any>): Promise<any> {
  const user = await requireUser();

  const { error } = await supabase
    .from('settings')
    .update(data)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
  return true;
}

export async function createSettings(data: Record<string, any>): Promise<any> {
  const user = await requireUser();

  const settingsData = { ...data, user_id: user.id };

  const { error } = await supabase
    .from('settings')
    .upsert(settingsData, { onConflict: 'user_id', ignoreDuplicates: true });

  if (error) {
    console.error('Error creating settings:', error);
    throw error;
  }
  return true;
}
