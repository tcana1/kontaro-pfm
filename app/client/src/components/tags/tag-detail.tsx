import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabaseService } from '@/services/supabase-service';
import { useMoney } from '@/hooks/useMoney';
import { formatDateForDisplay } from '@/lib/date-utils';
import { useFinance } from '@/contexts/finance-context';

interface TagDetailProps {
  tagId: number | null;
  tagName: string;
  tagColor: string;
  onClose: () => void;
}

const TagDetail: React.FC<TagDetailProps> = ({ tagId, tagName, tagColor, onClose }) => {
  const { t } = useTranslation();
  const { locale, dateFormat } = useFinance();
  const money = useMoney();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['tagSummary', tagId],
    queryFn: () => supabaseService.getTagSummary(tagId!),
    enabled: tagId !== null,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['tagTransactions', tagId],
    queryFn: () => supabaseService.getTagTransactions(tagId!),
    enabled: tagId !== null,
  });

  const maxBreakdownTotal = summary?.breakdown?.length
    ? Math.max(...summary.breakdown.map(b => b.total))
    : 0;

  return (
    <Sheet open={tagId !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tagColor }} />
            {tagName}
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && summary && (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('Total spent')}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {money(summary.total, { precision: 0 })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('Transactions')}</p>
                <p className="text-2xl font-semibold tabular-nums">{summary.count}</p>
              </div>
            </div>

            {/* Date range */}
            {summary.first_date && summary.last_date && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('Date range')}</p>
                <p className="text-sm">
                  {formatDateForDisplay(new Date(summary.first_date), locale, dateFormat)}
                  {summary.first_date !== summary.last_date && (
                    <> &mdash; {formatDateForDisplay(new Date(summary.last_date), locale, dateFormat)}</>
                  )}
                </p>
              </div>
            )}

            {/* Category breakdown */}
            {summary.breakdown && summary.breakdown.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('By category')}</p>
                <div className="space-y-2">
                  {[...summary.breakdown]
                    .sort((a, b) => b.total - a.total)
                    .map(item => (
                      <div key={item.category_name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.category_color || '#6B7280' }}
                            />
                            <span className="truncate">{item.category_name}</span>
                            <span className="text-muted-foreground text-xs flex-shrink-0">
                              ({item.count})
                            </span>
                          </div>
                          <span className="font-medium tabular-nums flex-shrink-0 ml-2">
                            {money(item.total, { precision: 0 })}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(item.total / maxBreakdownTotal) * 100}%`,
                              backgroundColor: item.category_color || '#6B7280',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Transaction list */}
            {(txLoading || transactions.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('Transactions')}</p>
                {txLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-0 divide-y divide-gray-100 dark:divide-gray-800">
                    {transactions.map(tx => {
                      const amt = parseFloat(tx.amount);
                      const isPositive = amt > 0;
                      let dateStr = tx.payment_date;
                      try { dateStr = formatDateForDisplay(new Date(tx.payment_date), locale, dateFormat); } catch {}
                      const cat = tx.category_group_name
                        ? `${tx.category_group_name}: ${tx.category_name}`
                        : tx.category_name;
                      return (
                        <div key={tx.id} className="flex items-baseline justify-between py-2 gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{tx.payee}</p>
                            <p className="text-xs text-muted-foreground truncate">{dateStr} · {cat}</p>
                          </div>
                          <span className={`text-sm tabular-nums flex-shrink-0 ${isPositive ? 'text-green-600 dark:text-green-400' : ''}`}>
                            {amt < 0 ? '-' : ''}{money(Math.abs(amt))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!isLoading && summary.count === 0 && (
              <p className="text-sm text-muted-foreground">{t('No transactions tagged yet.')}</p>
            )}
          </div>
        )}

        {!isLoading && !summary && (
          <p className="text-sm text-muted-foreground">{t('No data available.')}</p>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default TagDetail;
