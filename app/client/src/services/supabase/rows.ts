import { supabase } from '../../lib/supabase';

// Generic, table-agnostic row primitives. Nothing here knows about transfers,
// splits or linked pairs — that keeps the higher-level modules free to depend on
// this one without forming an import cycle.

export async function insertRow(table: string, data: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase as any)
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function updateRow(table: string, id: number, data: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase as any)
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function deleteRow(table: string, id: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from(table).delete().eq('id', id);

  if (error) throw error;
  return true;
}

export async function deleteRows(table: string, ids: number[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from(table).delete().in('id', ids);

  if (error) throw error;
  return true;
}

export async function rpc(name: string, params: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) {
    console.error(`Error calling RPC function ${name}:`, error);
    throw error;
  }
  return data;
}
