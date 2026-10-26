import { useCallback } from 'react';
import { useFinance } from '@/contexts/finance-context';
import { formatMoney, type MoneyFormat } from '@/lib/currency-formatter';

type MoneyOverrides = Pick<MoneyFormat, 'currencyDisplay' | 'hideCents' | 'precision'>;

// Single entry point for rendering money, so every screen picks up the user's
// currency and locale without each component wiring them up by hand.
export const useMoney = () => {
  const { currency, locale } = useFinance();

  return useCallback(
    (amount: number, overrides?: MoneyOverrides) =>
      formatMoney(amount, { currency, locale, ...overrides }),
    [currency, locale]
  );
};
