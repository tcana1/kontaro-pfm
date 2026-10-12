import { useQuery } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
import { AccountBalance } from '@shared/types/account-balance';
import { getTodayISO } from '@/lib/date-utils';
import { useAuth } from '@/contexts/auth-context';

/**
 * Hook to get account balance calculations
 * @param accountId - Optional specific account ID. If not provided, returns all accounts
 * @returns Query result with account balance data
 */
export function useAccountBalance(accountId?: number) {
  const today = getTodayISO();
  // The sidebar mounts inside Layout before ProtectedRoute resolves auth, so without
  // this gate the RPC fires as the anon role (which lacks EXECUTE) and logs a
  // "permission denied for function get_account_balances" error on every login.
  const { user, isLoading: authLoading } = useAuth();
  return useQuery<AccountBalance[]>({
    queryKey: ['account-balances', accountId, today],
    queryFn: async () => {
      const data = await supabaseService.rpc('get_account_balances',
        accountId ? { account_id_param: accountId, p_today: today } : { p_today: today }
      );
      
      if (!data) {
        return [];
      }
      
      // Transform the data to match our TypeScript interface
      return data?.map((row: any) => ({
        accountId: row.account_id,
        accountName: row.account_name,
        accountTypeId: row.account_type_id,
        startingBalance: parseFloat(row.starting_balance || '0'),
        clearedBalance: parseFloat(row.cleared_balance || '0'),
        pendingBalance: parseFloat(row.pending_balance || '0'),
        totalBalance: parseFloat(row.total_balance || '0'),
      })) || [];
    },
    enabled: (accountId === undefined || accountId > 0) && !!user && !authLoading, // Valid account IDs (or all) and only once authenticated
    staleTime: 5000, // Cache for 5 seconds (reduced from 30s for faster updates)
    refetchOnWindowFocus: true, // Refetch when user returns to window
  });
}

/**
 * Hook to get balance for a specific account
 * @param accountId - Account ID to get balance for
 * @param options - Additional query options (like enabled)
 * @returns Single account balance or undefined if not found
 */
export function useSingleAccountBalance(accountId: number, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && accountId > 0; // Don't look up invalid account IDs
  // Reads from the shared all-accounts query so the sidebar and the page summary resolve together with one request
  const { data, ...rest } = useAccountBalance();
  return {
    ...rest,
    isLoading: enabled && rest.isLoading,
    data: enabled ? data?.find(balance => balance.accountId === accountId) : undefined,
  };
}
