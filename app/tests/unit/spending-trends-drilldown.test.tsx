import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ptBR } from 'date-fns/locale';

vi.mock('@/lib/date-fns-locale', () => ({ useDateFnsLocale: () => ptBR }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/currency-formatter', () => ({ formatMoney: (v: number) => `R$ ${v}` }));
vi.mock('@/contexts/finance-context', () => ({
  useFinance: () => ({
    currency: 'BRL',
    locale: 'pt-BR',
    dateFormat: 'dd/MM/yyyy',
    categories: [{ id: 10, name: 'Lazer', group_id: 1 }],
    categoryGroups: [{ id: 1, name: 'Vida boa' }],
  }),
}));
const queryResult = {
  isLoading: false,
  data: ['2026-02', '2026-10'].map((month) => ({
    month, label: 'Vida boa', value: -100, color: '#ff00ff', group_id: 1,
  })),
};
vi.mock('@/hooks/useServiceQuery', () => ({ useServiceQuery: () => queryResult }));

import SpendingTrendsReport from '@/components/reports/spending-trends-report';

const filters = {
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 11, 31),
  accountIds: [], categoryIds: [], groupIds: [], excludeTagIds: [],
};

describe('SpendingTrendsReport table drilldown', () => {
  let openSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
  });

  it.each([
    ['fev 2026', '2026-02'],
    ['out 2026', '2026-10'],
  ])('opens transactions for the clicked month (%s)', (label, expected) => {
    render(<SpendingTrendsReport filters={filters} />);
    const row = screen.getByText(label).closest('tr')!;
    const cells = row.querySelectorAll('td');
    fireEvent.doubleClick(cells[1]);
    fireEvent.doubleClick(cells[cells.length - 1]);
    expect(openSpy).toHaveBeenCalledTimes(2);
    for (const call of openSpy.mock.calls) {
      expect(call[0]).toContain(`month=${expected}`);
    }
  });
});

describe('SpendingTrendsReport table drilldown on touch', () => {
  it('opens transactions on a double tap, which iOS never reports as dblclick', () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    render(<SpendingTrendsReport filters={filters} />);
    const cell = screen.getByText('out 2026').closest('tr')!.querySelectorAll('td')[1];
    const tap = () => {
      fireEvent.touchStart(cell, { touches: [{ clientX: 5, clientY: 5 }] });
      fireEvent.touchEnd(cell, { changedTouches: [{ clientX: 5, clientY: 5 }] });
    };
    tap();
    expect(openSpy).not.toHaveBeenCalled();
    tap();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('month=2026-10');
  });

  it('does not count a swipe as a tap', () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    render(<SpendingTrendsReport filters={filters} />);
    const cell = screen.getByText('out 2026').closest('tr')!.querySelectorAll('td')[1];
    for (let i = 0; i < 2; i++) {
      fireEvent.touchStart(cell, { touches: [{ clientX: 5, clientY: 5 }] });
      fireEvent.touchEnd(cell, { changedTouches: [{ clientX: 5, clientY: 80 }] });
    }
    expect(openSpy).not.toHaveBeenCalled();
  });
});
