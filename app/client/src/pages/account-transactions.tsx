import React from 'react';
import { useParams } from 'wouter';
import { HistoryProvider } from '@/contexts/history-context';
import TransactionsPageContent from '@/pages/transactions-page';

const AccountTransactions: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();

  return (
    <HistoryProvider>
      <TransactionsPageContent accountId={accountId ? parseInt(accountId, 10) : undefined} />
    </HistoryProvider>
  );
};

export default AccountTransactions;