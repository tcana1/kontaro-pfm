import { roundCents } from '@/lib/currency-formatter';

export interface SplitRow {
  id: number;
  amount?: string | number | null;
}

export interface GroupedSplitRow<T extends SplitRow = SplitRow> {
  splits: T[];
  splitCount: number;
  totalAmount: string;
}

export function groupSplits<T extends SplitRow>(rawRows: T[]): Array<T & GroupedSplitRow<T>> {
  const map = new Map<number, T & GroupedSplitRow<T>>();

  rawRows.forEach((row) => {
    const id = row.id;
    if (map.has(id)) {
      const existing = map.get(id)!;
      existing.splits.push(row);
      existing.splitCount = existing.splits.length;
      const total = roundCents(existing.splits.reduce((sum, s) => sum + parseFloat(String(s.amount || '0')), 0));
      existing.totalAmount = total.toString();
    } else {
      map.set(id, {
        ...row,
        splits: [row],
        splitCount: 1,
        totalAmount: row.amount?.toString() ?? '0',
      });
    }
  });

  return Array.from(map.values());
}
