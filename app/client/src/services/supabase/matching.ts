import { supabase } from '../../lib/supabase';

// Double-entry match candidates: detection, resolution, merge/explode/collapse.

const CANDIDATE_WITH_SIDES = `
        id,
        status,
        created_at,
        transaction_a:transactions!transaction_a_id (
          id, payee, amount, payment_date, purchase_date, created_at, account_id,
          transaction_splits (id, category_id, amount, observation, categories (id, name, category_groups (name, emoji)))
        ),
        transaction_b:transactions!transaction_b_id (
          id, payee, amount, payment_date, purchase_date, created_at, account_id,
          transaction_splits (id, category_id, amount, observation, categories (id, name, category_groups (name, emoji)))
        )
      `;

export async function findAndMarkMatches(accountId: number): Promise<number> {
  const { data, error } = await supabase.rpc('find_and_mark_matches', {
    p_account_id: accountId,
    p_user_id: (await supabase.auth.getUser()).data.user!.id,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getPendingMatchCandidates() {
  const { data, error } = await supabase
    .from('transaction_match_candidates')
    .select(CANDIDATE_WITH_SIDES)
    .eq('status', 'pending')
    .order('score', { ascending: false });

  if (error) throw error;
  return data;
}

export async function findOrCreateMatchCandidate(txIdA: number, txIdB: number): Promise<{ id: number; created: boolean }> {
  // Check for existing candidate in either direction
  const { data: existing } = await supabase
    .from('transaction_match_candidates')
    .select('id')
    .or(`and(transaction_a_id.eq.${txIdA},transaction_b_id.eq.${txIdB}),and(transaction_a_id.eq.${txIdB},transaction_b_id.eq.${txIdA})`)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) return { id: existing.id, created: false };

  const { data: created, error } = await supabase
    .from('transaction_match_candidates')
    .insert({
      user_id: (await supabase.auth.getUser()).data.user!.id,
      transaction_a_id: txIdA,
      transaction_b_id: txIdB,
      score: 1.0,
      confidence: 'high',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: created.id, created: true };
}

export async function getMatchCandidateById(candidateId: number) {
  const { data, error } = await supabase
    .from('transaction_match_candidates')
    .select(CANDIDATE_WITH_SIDES)
    .eq('id', candidateId)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMatchCandidate(candidateId: number): Promise<void> {
  await supabase.from('transaction_match_candidates').delete().eq('id', candidateId);
}

export async function mergeTransactions(
  winnerId: number,
  loserId: number,
  resolvedFields: {
    payee?: string;
    payment_date?: string;
    purchase_date?: string;
    category_id?: number | null;
    notes?: string | null;
  },
  matchCandidateId: number,
  splitSource: 'winner' | 'loser' = 'winner'
): Promise<void> {
  const { error } = await supabase.rpc('merge_transactions', {
    p_winner_id: winnerId,
    p_loser_id: loserId,
    p_resolved_fields: resolvedFields,
    p_match_candidate_id: matchCandidateId,
    p_split_source: splitSource,
  });
  if (error) throw error;
}

export async function explodeTransaction(transactionId: number): Promise<number[]> {
  const { data, error } = await supabase.rpc('explode_transaction', {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return data as number[];
}

export async function collapseTransactions(
  baseId: number,
  otherIds: number[],
  resolvedFields: {
    payee?: string;
    payment_date?: string;
    purchase_date?: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc('collapse_transactions', {
    p_base_id: baseId,
    p_other_ids: otherIds,
    p_resolved_fields: resolvedFields,
  });
  if (error) throw error;
}

export async function dismissMatch(matchCandidateId: number): Promise<void> {
  const { error } = await supabase.rpc('dismiss_match', {
    p_match_candidate_id: matchCandidateId,
  });
  if (error) throw error;
}
