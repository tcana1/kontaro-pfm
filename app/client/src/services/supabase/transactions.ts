import { supabase, TransactionSplitRow } from '../../lib/supabase';
import { CurrencyCode } from '../../lib/currency-formatter';
import { localDateString } from '../../lib/date-utils';
import {
  applyFilters,
  applyStatusIgnored,
  applySort,
  fanOutSiblings,
  transformRow,
  parseSearchParams,
} from '../transaction-query-helpers';

export interface QueryOptions {
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  currency?: CurrencyCode;
}

// TransactionSplitRow after transformRow mapping: transaction_id → id, amount number → string, observation → notes
export type TransactionResponse = Omit<TransactionSplitRow, 'amount'> & {
  id: number | null;
  amount: string;
  notes: string | null;
  split_observation: string;
};

export async function getReconciledTransactionIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('reconciliation_items')
    .select('transaction_id, reconciliations!inner(deleted_at)')
    .in('transaction_id', ids);
  if (error) throw error;
  const reconciledIds = new Set(
    (data ?? [])
      .filter(row => (row as any).reconciliations?.deleted_at === null)
      .map(row => row.transaction_id)
  );
  return [...reconciledIds];
}

// 'exact' counts split rows, but the UI groups by transaction — so under
// search/category/tag (and with any multi-split tx) it drifts from the displayed
// rows. This returns the number of distinct transaction_ids via the
// count_filtered_transactions RPC, or null if the RPC is missing/errors (e.g.
// migration not applied) so the caller can fall back to the split-level count.
async function fetchDistinctTransactionCount(options: QueryOptions): Promise<number | null> {
  try {
    const filters = options.filters ?? {};
    const currency = options.currency || 'USD';
    const searchParams = filters.search ? parseSearchParams(filters.search, currency) : null;
    const dateFrom = filters.dateRange?.from;
    const dateTo = filters.dateRange?.to;
    const { data, error } = await supabase.rpc('count_filtered_transactions', {
      p_user_id: filters.user_id ?? undefined,
      p_search: searchParams?.normalized ?? undefined,
      p_amount: searchParams?.amount ?? undefined,
      p_amount_tolerance: searchParams?.tolerance ?? undefined,
      p_categories: filters.categories ?? undefined,
      p_tags: filters.tags ?? undefined,
      p_accounts: filters.accounts ?? undefined,
      p_date_from: dateFrom ? localDateString(typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom) : undefined,
      p_date_to: dateTo ? localDateString(typeof dateTo === 'string' ? new Date(dateTo) : dateTo) : undefined,
      p_status: filters.status ?? undefined,
      p_ignored: filters.ignored?.includes(true) ? true : undefined,
    });
    return !error && typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

export async function getTransactions(options: QueryOptions = {}): Promise<{ data: TransactionResponse[]; count: number }> {
  let query = supabase.from('v_transaction_splits')
    .select(`*`, { count: 'exact' });

  if (options.filters) {
    const currency = options.currency || 'USD';
    query = applyFilters(query, options.filters, currency);
    query = applyStatusIgnored(query, options.filters);
  }

  if (options.sortBy) {
    query = applySort(query, options.sortBy, options.sortDirection || 'desc');
  }

  // Apply pagination
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  // Independent of the page query, so fire it now and let both run in parallel.
  const distinctCountPromise = fetchDistinctTransactionCount(options);

  const { data, error, count } = await query;
  if (error) {
    console.error('Error querying transactions:', error);
    throw error;
  }

  // Fan-out: search and category filters match at the split level, so a
  // multi-split transaction may only be partially represented in `data`.
  // Fetch all sibling splits for every matched transaction_id so the client
  // can group them correctly and display the full split badge.
  const hasSearchFilter = !!options.filters?.search;
  const hasCategoryFilter = (options.filters?.categories?.length ?? 0) > 0;
  const hasTagFilter = (options.filters?.tags?.length ?? 0) > 0;
  let rawData: typeof data = data || [];
  if ((hasSearchFilter || hasCategoryFilter || hasTagFilter) && rawData.length > 0) {
    rawData = await fanOutSiblings(rawData, options.sortBy, options.sortDirection);
  }

  const distinctCount = await distinctCountPromise;
  const finalCount = distinctCount ?? (count || 0);

  return { data: (rawData as any[]).map(transformRow) as TransactionResponse[], count: finalCount };
}

export async function batchUpdateTransactions(
  transactionIds: number[],
  updateData: Record<string, any>,
  userId: string
): Promise<void> {
  // Separate transaction fields from split fields
  const { category_id, notes, user_id: _, ...transactionFields } = updateData;

  // Remove undefined values from transaction fields
  Object.keys(transactionFields).forEach(key => {
    if (transactionFields[key] === undefined) {
      delete transactionFields[key];
    }
  });

  // Only add user_id and update transactions if there are actual transaction fields to update
  const hasTransactionFields = Object.keys(transactionFields).length > 0;

  // Batch update transactions table
  if (hasTransactionFields) {
    const transactionUpdateData: Record<string, any> = {
      ...transactionFields,
      user_id: userId
    };
    const { error: transactionError } = await supabase
      .from('transactions')
      .update(transactionUpdateData)
      .in('id', transactionIds);

    if (transactionError) {
      console.error('Error batch updating transactions:', transactionError);
      throw transactionError;
    }
  }

  // Batch update splits table if category_id or notes provided
  if (category_id !== undefined || notes !== undefined) {
    const splitUpdateData: Record<string, any> = {};
    if (category_id !== undefined) splitUpdateData.category_id = category_id;
    if (notes !== undefined) splitUpdateData.observation = notes || '';

    const { error: splitError } = await supabase
      .from('transaction_splits')
      .update(splitUpdateData)
      .in('transaction_id', transactionIds);

    if (splitError) {
      console.error('Error batch updating splits:', splitError);
      throw splitError;
    }
  }
}
