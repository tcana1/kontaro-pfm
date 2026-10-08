import { useLocation } from 'wouter';

export interface RouteContext {
  isMainTransactions: boolean;
  currentAccountId: number | null;
  isAccountSpecific: boolean;
}

export function useRouteContext(): RouteContext {
  const [location] = useLocation();
  
  // Check if we're on /transactions (main transactions page)
  const isMainTransactions = location === '/transactions';
  
  // Check if we're on /accounts/:id/transactions (account-specific page)
  const accountSpecificMatch = location.match(/^\/accounts\/(\d+)\/transactions$/);
  const isAccountSpecific = !!accountSpecificMatch;
  const currentAccountId = accountSpecificMatch ? parseInt(accountSpecificMatch[1], 10) : null;

  return {
    isMainTransactions,
    currentAccountId,
    isAccountSpecific,
  };
}