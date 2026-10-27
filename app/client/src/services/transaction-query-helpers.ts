import { supabase, TransactionSplitRow } from '../lib/supabase';
import { parseCurrency, getNumberSeparators } from '../lib/currency-formatter';
import { localDateString } from '../lib/date-utils';

// Parses a search term into the normalized string + amount/tolerance used by
// both the PostgREST search conditions and the count_filtered_transactions RPC.
// Keeping this in one place ensures the client-side query and the server-side
// distinct-count agree on what a search term means.
export function parseSearchParams(
  term: string,
  locale: string
): { normalized: string; amount: number | null; tolerance: number | null } {
  // Strip accents so "Verao" matches "Verão" and vice-versa
  const normalized = term.normalize('NFD').replace(/\p{Mn}/gu, '');

  // Use parseCurrency for locale-aware number parsing
  const numSearchTerm = parseCurrency(term, locale);
  if (numSearchTerm === null) {
    return { normalized, amount: null, tolerance: null };
  }

  const amount = Math.abs(numSearchTerm);

  // Determine tolerance based on decimal precision in the original search term
  let tolerance = 1; // Default for no decimals

  const { decimal: decimalSeparator } = getNumberSeparators(locale);

  if (term.includes(decimalSeparator)) {
    const decimalPart = term.split(decimalSeparator)[1] || '';
    if (decimalPart.length === 1) {
      tolerance = 0.1; // One decimal place: 29.9 -> 29.90 to 29.99
    } else if (decimalPart.length >= 2) {
      tolerance = 0.001; // Two or more decimals: 29.95 -> exactly 29.95
    }
  }

  return { normalized, amount, tolerance };
}

export function buildSearchConditions(term: string, locale: string): string[] {
  const encodeForPostgrest = (s: string) =>
    s.replace(/%/g, '%25').replace(/,/g, '%2C').replace(/\(/g, '%28').replace(/\)/g, '%29');
  const { normalized, amount, tolerance } = parseSearchParams(term, locale);
  const encodedNormalized = encodeForPostgrest(normalized);

  const conditions: string[] = [
    `payee_unaccented.ilike.%${encodedNormalized}%`,
    `observation_unaccented.ilike.%${encodedNormalized}%`,
    `category_name_unaccented.ilike.%${encodedNormalized}%`,
    `category_group_name_unaccented.ilike.%${encodedNormalized}%`,
    `account_name_unaccented.ilike.%${encodedNormalized}%`,
    `tag_name_unaccented.ilike.%${encodedNormalized}%`,
  ];

  if (amount !== null && tolerance !== null) {
    // Round to 3 decimal places to avoid floating-point noise in DB query strings
    const lo = parseFloat((amount - tolerance).toFixed(3));
    const hi = parseFloat((amount + tolerance).toFixed(3));
    conditions.push(`and(amount.gte.${lo},amount.lte.${hi})`);
    conditions.push(`and(amount.gte.${-hi},amount.lte.${-lo})`);
    conditions.push(`and(transaction_amount.gte.${lo},transaction_amount.lte.${hi})`);
    conditions.push(`and(transaction_amount.gte.${-hi},transaction_amount.lte.${-lo})`);
  }

  return conditions;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(query: any, filters: Record<string, any>, locale: string): any {
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return;
    if (key === 'search') {
      query = query.or(buildSearchConditions(value, locale).join(','));
    } else if (key === 'status' || key === 'ignored') {
      // handled separately by applyStatusIgnored
    } else if (key === 'categories') {
      query = query.in('category_id', value);
    } else if (key === 'tags') {
      query = query.in('tag_id', value);
    } else if (key === 'accounts') {
      query = query.in('account_id', value);
    } else if (key === 'dateRange' && value.from) {
      const fromDate = typeof value.from === 'string' ? new Date(value.from) : value.from;
      query = query.gte('payment_date', localDateString(fromDate));
      if (value.to) {
        const toDate = typeof value.to === 'string' ? new Date(value.to) : value.to;
        query = query.lte('payment_date', localDateString(toDate));
      }
    } else {
      query = query.eq(key, value);
    }
  });
  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyStatusIgnored(query: any, filters: Record<string, any>): any {
  const statusFilters: string[] = filters.status || [];
  const ignoredFilters: boolean[] = filters.ignored || [];
  if (statusFilters.length === 0 && ignoredFilters.length === 0) return query;

  const conditions: string[] = [];
  if (statusFilters.length > 0) {
    conditions.push(`status_name.in.(${statusFilters.join(',')})`);
  }
  if (ignoredFilters.includes(true)) {
    conditions.push('is_ignored.eq.true');
  }
  if (conditions.length > 0) {
    query = query.or(conditions.join(','));
  }
  return query;
}

export function resolveColumnName(sortBy: string): string {
  if (sortBy === 'categories.name') return 'category_name';
  if (sortBy === 'notes') return 'observation';
  // The table shows the transaction total (sum of splits) grouped by transaction_id, so sort by that
  // rather than the per-split amount, which scatters multi-split transactions out of order.
  if (sortBy === 'amount') return 'transaction_amount';
  return sortBy;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySort(query: any, sortBy: string, sortDirection: 'asc' | 'desc'): any {
  const isAscending = sortDirection === 'asc';
  query = query.order(resolveColumnName(sortBy), { ascending: isAscending });
  // Add secondary sort by transaction_id for consistency
  // If sorting by payment_date DESC, use transaction_id DESC (newest first)
  // Otherwise, use transaction_id ASC for consistent ordering
  const useDescendingId = sortBy === 'payment_date' && sortDirection === 'desc';
  query = query.order('transaction_id', { ascending: !useDescendingId });
  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fanOutSiblings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData: any[],
  sortBy: string | undefined,
  sortDirection: 'asc' | 'desc' | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const transactionIds = [...new Set(rawData.map((r) => r.transaction_id as number))];
  let siblingQuery = supabase
    .from('v_transaction_splits')
    .select('*')
    .in('transaction_id', transactionIds);

  // Apply the same ordering so grouped-transaction order is preserved
  if (sortBy) {
    siblingQuery = applySort(siblingQuery, sortBy, sortDirection || 'desc');
  } else {
    siblingQuery = siblingQuery.order('transaction_id', { ascending: true });
  }

  const { data: siblingData, error: siblingError } = await siblingQuery;
  if (siblingError) {
    console.error('Fan-out sibling fetch failed:', siblingError);
    return rawData;
  }
  return siblingData ?? rawData;
}

export interface LinkedTransactionLookup {
  id: number;
  transfer_link_id?: string | null;
  account_id: number;
  to_account_id: number;
  type: string;
  payment_date: string;
  amount: string | number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findLinkedTransaction(
  currentTx: LinkedTransactionLookup,
  select = '*',
  // When true, an ambiguous heuristic match (>1 candidate) returns null instead
  // of guessing the first one. The delete path uses this so it never destroys
  // the wrong sibling for a legacy transfer without a transfer_link_id.
  requireUniqueHeuristic = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any> | null> {
  if (currentTx.transfer_link_id) {
    // Deterministic path — prefer link UUID over heuristic
    const { data, error } = await supabase
      .from('transactions')
      .select(select)
      .eq('transfer_link_id', currentTx.transfer_link_id)
      .neq('id', currentTx.id)
      .single();
    if (error) {
      console.warn(`⚠️  findLinkedTransaction: UUID lookup failed:`, error);
      return null;
    }
    return data;
  }

  // Heuristic fallback for transfers created before transfer_link_id existed
  const linkedAmount = -parseFloat(String(currentTx.amount));
  const { data, error } = await supabase
    .from('transactions')
    .select(select)
    .eq('to_account_id', currentTx.account_id)
    .eq('account_id', currentTx.to_account_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('type', currentTx.type as any)
    .eq('payment_date', currentTx.payment_date)
    .eq('amount', linkedAmount);

  if (error) {
    console.error(`❌ findLinkedTransaction: heuristic search failed:`, error);
    return null;
  }
  if (!data || (data as unknown[]).length === 0) return null;
  if ((data as unknown[]).length > 1) {
    if (requireUniqueHeuristic) {
      console.warn(`⚠️  findLinkedTransaction: ${(data as unknown[]).length} heuristic matches for tx ${currentTx.id}, skipping ambiguous sibling`);
      return null;
    }
    console.warn(`⚠️  findLinkedTransaction: multiple heuristic matches for tx ${currentTx.id}, using first`);
  }
  return (data as Record<string, any>[])[0];
}

export function transformRow(t: TransactionSplitRow): Record<string, unknown> {
  return {
    ...t,
    id: t.transaction_id, // Explicitly map the transaction ID
    amount: Number(t.amount).toString(),
    notes: t.observation, // Map observation to notes for backward compatibility
    category_name: t.category_name || 'Uncategorized',
    account_name: t.account_name || 'Unknown Account',
    category_group_emoji: t.category_group_emoji || '',
    split_observation: t.observation ?? '', // Map observation to split_observation
  };
}
