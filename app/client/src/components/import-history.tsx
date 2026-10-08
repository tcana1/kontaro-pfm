
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { useFinance } from '@/contexts/finance-context';
import { formatNumber } from '@/lib/currency-formatter';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportBatch {
  id: string;
  file_name: string | null;
  source: string | null;
  status: string;
  error_text: string | null;
  transaction_count: number | null;
  inserted_count: number | null;
  failed_count: number | null;
  total_amount: number | null;
  created_at: string;
  finished_at: string | null;
  accounts: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'success') {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-transparent">
        success
      </Badge>
    );
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-transparent">
        partial
      </Badge>
    );
  }
  if (status === 'failed') {
    return <Badge variant="destructive">failed</Badge>;
  }
  return (
    <Badge variant="outline" className="text-gray-500">
      {status}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  if (source === 'pluggy-sync') {
    return (
      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-transparent text-xs">
        Pluggy
      </Badge>
    );
  }
  if (source === 'excel-history') {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-transparent text-xs">
        History
      </Badge>
    );
  }
  if (source === 'api-import') {
    return (
      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-transparent text-xs">
        API
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-transparent text-xs">
      File
    </Badge>
  );
}

function formatDate(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDuration(created: string, finished: string | null): string | null {
  if (!finished) return null;
  const ms = new Date(finished).getTime() - new Date(created).getTime();
  if (ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatAmount(amount: number | null, locale: string) {
  if (amount == null) return '—';
  return formatNumber(amount, locale);
}

// ── Main component ─────────────────────────────────────────────────────────────

const ImportHistory: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { locale } = useFinance();
  const { data: batches = [], isLoading, isFetching, error } = useQuery<ImportBatch[]>({
    queryKey: ['import-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_batches')
        .select(
          'id, file_name, source, status, error_text, transaction_count, inserted_count, failed_count, total_amount, created_at, finished_at, accounts(name)',
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      // supabase-js types the accounts(name) embed as an array, but PostgREST
      // returns an object for this many-to-one FK — matching ImportBatch above.
      return (data ?? []) as unknown as ImportBatch[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium">{t('History')}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('Recent imports — file uploads and Pluggy syncs (last 50).')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.refetchQueries({ queryKey: ['import-batches'] })}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          {t('Refresh')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">{t('Loading…')}</p>
      ) : error ? (
        <p className="text-sm text-red-500">{t('Failed to load import history.')}</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-gray-500">{t('No imports yet.')}</p>
      ) : (
        <>
        <div className="hidden md:block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Source')}</TableHead>
                <TableHead>{t('Account / File')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className="text-right">{t('New')}</TableHead>
                <TableHead className="text-right">{t('Skipped')}</TableHead>
                <TableHead className="text-right">{t('Amount')}</TableHead>
                <TableHead>{t('Date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const inserted = batch.inserted_count ?? 0;
                const total = batch.transaction_count ?? 0;
                const skipped = Math.max(0, total - inserted);
                const duration = formatDuration(batch.created_at, batch.finished_at);

                return (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <SourceBadge source={batch.source} />
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <div className="truncate">
                        {batch.accounts?.name ?? '—'}
                      </div>
                      {batch.file_name && (
                        <div className="text-xs text-gray-400 truncate">{batch.file_name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {batch.error_text ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                <StatusBadge status={batch.status} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {batch.error_text}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <StatusBadge status={batch.status} />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {batch.inserted_count != null ? inserted : '—'}
                      {batch.failed_count != null && batch.failed_count > 0 && (
                        <span className="text-red-500 ml-1 text-xs">({batch.failed_count} failed)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-gray-400">
                      {skipped > 0 ? skipped : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatAmount(batch.total_amount, locale)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      <div>{formatDate(batch.created_at, locale)}</div>
                      {duration && (
                        <div className="text-xs text-gray-400">{duration}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {batches.map((batch) => {
            const inserted = batch.inserted_count ?? 0;
            const total = batch.transaction_count ?? 0;
            const skipped = Math.max(0, total - inserted);
            const duration = formatDuration(batch.created_at, batch.finished_at);

            return (
              <div
                key={batch.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SourceBadge source={batch.source} />
                    <StatusBadge status={batch.status} />
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    <div>{formatDate(batch.created_at, locale)}</div>
                    {duration && <div className="text-gray-400">{duration}</div>}
                  </div>
                </div>
                <div className="text-sm min-w-0">
                  <div className="truncate">{batch.accounts?.name ?? '—'}</div>
                  {batch.file_name && (
                    <div className="text-xs text-gray-400 truncate">{batch.file_name}</div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">{t('New')}</div>
                    <div>
                      {batch.inserted_count != null ? inserted : '—'}
                      {batch.failed_count != null && batch.failed_count > 0 && (
                        <span className="text-red-500 ml-1 text-xs">({batch.failed_count} failed)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{t('Skipped')}</div>
                    <div className="text-gray-400">{skipped > 0 ? skipped : '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{t('Amount')}</div>
                    <div className="font-mono">{formatAmount(batch.total_amount, locale)}</div>
                  </div>
                </div>
                {batch.error_text && (
                  <p className="text-xs text-red-500 break-words">{batch.error_text}</p>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
};

export default ImportHistory;
