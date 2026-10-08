import React, { createContext, useCallback, useContext, useState } from 'react';
import OnboardingWizard from './onboarding-wizard';

interface OnboardingContextType {
  open: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // A monotonic counter lets the wizard reopen on demand (e.g. from Settings)
  // even when it is already mounted and auto-closed.
  const [openSignal, setOpenSignal] = useState(0);
  const open = useCallback(() => setOpenSignal((s) => s + 1), []);

  return (
    <OnboardingContext.Provider value={{ open }}>
      {children}
      <OnboardingWizard openSignal={openSignal} />
    </OnboardingContext.Provider>
  );
};