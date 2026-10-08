import { createContext, useContext } from 'react';
import { useHistory } from '@/hooks/useHistory';

const HistoryContext = createContext<ReturnType<typeof useHistory> | undefined>(undefined);

export const HistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const history = useHistory();
  return <HistoryContext.Provider value={history}>{children}</HistoryContext.Provider>;
};

export const useHistoryContext = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistoryContext must be used within a HistoryProvider');
  }
  return context;
};
