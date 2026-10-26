// Types for account balance calculations
export interface AccountBalance {
  accountId: number;
  accountName: string;
  accountTypeId: number;
  startingBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  totalBalance: number;
  // Installments of a still-open card bill that the provider has not delivered
  // yet — deliberately outside cleared + pending = total.
  projectedBalance: number;
}