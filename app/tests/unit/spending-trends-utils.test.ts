import { describe, it, expect } from 'vitest';
import { computeSpendingTrends } from '../../client/src/components/reports/spending-trends-utils';

const item = (month: string, label: string, value: number, color = '#000', group_id = 1) => ({
  month, label, value, color, group_id,
});

describe('computeSpendingTrends', () => {
  it('returns empty result for empty input', () => {
    expect(computeSpendingTrends([])).toEqual({ chartData: [], groupColors: {} });
  });

  it('negates values so expenses appear positive', () => {
    const { chartData } = computeSpendingTrends([item('2024-01', 'Food', -100)]);
    expect(chartData[0]['Food']).toBe(100);
  });

  it('treats zero value as 0 (not NaN)', () => {
    const { chartData } = computeSpendingTrends([item('2024-01', 'Food', 0)]);
    expect(chartData[0]['Food']).toBe(0);
  });

  it('groups multiple labels into the same month entry', () => {
    const input = [
      item('2024-01', 'Food', -100, '#f00'),
      item('2024-01', 'Transport', -50, '#0f0', 2),
    ];
    const { chartData } = computeSpendingTrends(input);
    expect(chartData).toHaveLength(1);
    expect(chartData[0]['Food']).toBe(100);
    expect(chartData[0]['Transport']).toBe(50);
  });

  it('produces one entry per distinct month', () => {
    const input = [
      item('2024-01', 'Food', -10),
      item('2024-02', 'Food', -20),
      item('2024-03', 'Food', -30),
    ];
    const { chartData } = computeSpendingTrends(input);
    expect(chartData).toHaveLength(3);
  });

  it('sorts months chronologically regardless of input order', () => {
    const input = [
      item('2024-03', 'Food', -30),
      item('2024-01', 'Food', -10),
      item('2024-02', 'Food', -20),
    ];
    const { chartData } = computeSpendingTrends(input);
    expect(chartData[0].month).toBe('Jan 2024');
    expect(chartData[1].month).toBe('Feb 2024');
    expect(chartData[2].month).toBe('Mar 2024');
  });

  it('formats month label as "MMM yyyy"', () => {
    const { chartData } = computeSpendingTrends([item('2024-12', 'Food', -50)]);
    expect(chartData[0].month).toBe('Dec 2024');
  });

  it('attaches a Date object to each entry', () => {
    const { chartData } = computeSpendingTrends([item('2024-06', 'Food', -50)]);
    expect(chartData[0].date).toBeInstanceOf(Date);
    expect(chartData[0].date.getFullYear()).toBe(2024);
    expect(chartData[0].date.getMonth()).toBe(5); // 0-indexed
  });

  it('builds groupColors from label → color', () => {
    const input = [
      item('2024-01', 'Food', -100, '#ff0000'),
      item('2024-01', 'Transport', -50, '#00ff00', 2),
    ];
    const { groupColors } = computeSpendingTrends(input);
    expect(groupColors).toEqual({ Food: '#ff0000', Transport: '#00ff00' });
  });

  it('last color wins when same label appears in multiple months', () => {
    const input = [
      item('2024-01', 'Food', -100, '#aaa'),
      item('2024-02', 'Food', -200, '#bbb'),
    ];
    const { groupColors } = computeSpendingTrends(input);
    expect(groupColors['Food']).toBe('#bbb');
  });
});
