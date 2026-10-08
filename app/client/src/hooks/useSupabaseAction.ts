
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSupabaseAction<T extends string>(table: T) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addDocument = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: insertError } = await (supabase as any)
        .from(table)
        .insert(data)
        .select()
        .single();

      if (insertError) throw insertError;
      return result;
    } catch (err: any) {
      console.error(`[${table}] Error adding document:`, err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateDocument = async (id: string | number, data: Record<string, any>) => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: updateError } = await (supabase as any)
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return result;
    } catch (err: any) {
      console.error(`[${table}] Error updating document:`, err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (id: string | number) => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any).from(table).delete().eq('id', id);

      if (deleteError) throw deleteError;
      return true;
    } catch (err: any) {
      console.error(`[${table}] Error deleting document:`, err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    addDocument,
    updateDocument,
    deleteDocument,
    loading,
    error
  };
}
