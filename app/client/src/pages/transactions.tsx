import React from 'react';
import { HistoryProvider } from '@/contexts/history-context';
import TransactionsPageContent from './transactions-page';

const Transactions: React.FC = () => {
  return (
    <HistoryProvider>
      <TransactionsPageContent />
    </HistoryProvider>
  );
};

export default Transactions;
