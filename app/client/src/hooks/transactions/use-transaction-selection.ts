import { useState, useMemo } from 'react';
import type { Transaction } from '@shared/schema';
import { roundCents } from '@/lib/currency-formatter';

export function useTransactionSelection() {
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);

  const selectedTotal = useMemo(() => {
    return roundCents(selectedTransactions.reduce((total, t) => {
      const amount = (t as any).totalAmount ?? t.amount;
      return total + parseFloat(amount as any);
    }, 0));
  }, [selectedTransactions]);

  const selectedIsSplit =
    selectedTransactions.length === 1 && (selectedTransactions[0] as any)?.splitCount >= 2;

  return { selectedTransactions, setSelectedTransactions, selectedTotal, selectedIsSplit };
}
