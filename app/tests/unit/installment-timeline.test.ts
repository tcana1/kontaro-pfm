import { describe, it, expect } from 'vitest';
import { enUS } from 'date-fns/locale';
import { buildTimeline } from '@/components/dashboard/installment-panel';

// October 2026 selected: the first bar is November.
const OCT = new Date(2026, 9, 1);

const series = (remaining: number, monthly_amount: number, is_due_this_month?: boolean) => ({
  payee: 'x',
  purchase_date: '2026-01-01',
  installment_total: 10,
  paid: 10 - remaining,
  remaining,
  monthly_amount,
  is_due_this_month,
});

const totals = (active: ReturnType<typeof series>[]) =>
  buildTimeline(active, OCT, enUS).map(e => e.total);

describe('buildTimeline', () => {
  it('starts a series that already landed this month in the next month', () => {
    expect(totals([series(2, 100)]).slice(0, 3)).toEqual([100, 100, 0]);
  });

  it('starts a series still owing this month on this month, which is not charted', () => {
    // 2 left, the first of them in October: only November remains on the chart.
    expect(totals([series(2, 100, true)]).slice(0, 3)).toEqual([100, 0, 0]);
  });

  it('drops a due series with one installment left, because it ends this month', () => {
    expect(totals([series(1, 100, true)]).every(v => v === 0)).toBe(true);
  });

  it('adds the two kinds up month by month', () => {
    expect(totals([series(3, 100), series(3, 50, true)]).slice(0, 4)).toEqual([150, 150, 100, 0]);
  });
});
