// Types for account balance calculations
export interface AccountBalance {
  accountId: number;
  accountName: string;
  accountTypeId: number;
  startingBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  totalBalance: number;
}