import React, { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { getImporterUrl } from '@/lib/config';
import { CacheUtils } from '@/lib/cacheUtils';

const IMPORTER_URL = getImporterUrl();
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx', '.xlsm'];
const PREVIEW_ROWS = 10;
const ACCEPTED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
];
const SKIP_PREVIEW_LIMIT = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkipDetail {
  row: number;
  reason: string;
}

interface PreviewTransaction {
  purchase_date: string;
  payee: string;
  amount: number;
  category: string | null;
}

interface PreviewData {
  transaction_count: number;
  total_amount: number;
  skipped: number;
  skip_details: SkipDetail[];
  samples: PreviewTransaction[];
  file: File;
}

interface CreatedAccount {
  id: number;
  name: string;
}

interface ImportResult {
  inserted: number;
  duplicates: number;
  skipped: number;
  skip_details: SkipDetail[];
  failed: number;
  accounts_created: CreatedAccount[];
}

// 1=checking, 2=credit_card, 3=tracking, 4=savings
const ACCOUNT_TYPES = [
  { value: 1, labelKey: 'Checking' },
  { value: 2, labelKey: 'Credit Card' },
  { value: 3, labelKey: 'Tracking' },
  { value: 4, labelKey: 'Savings' },
] as const;

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | { status: 'previewing' }
  | { status: 'preview'; preview: PreviewData }
  | { status: 'importing' }
  | { status: 'classify'; result: ImportResult; typeSelections: Record<number, number>; saving: boolean }
  | { status: 'success'; result: ImportResult }
  | { status: 'error'; message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function extractErrorMessage(body: string, status: number): string {
  try {
    const json = JSON.parse(body);
    const detail = json?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      return (detail.message as string | undefined) ?? `Server error (${status})`;
    }
  } catch {
    // not JSON
  }
  return body || `Server error (${status})`;
}

function downloadSkipCsv(details: SkipDetail[], filename = 'import-errors.csv') {
  const rows = [
    'Row,Reason',
    ...details.map(d => `${d.row},"${d.reason.replace(/"/g, '""')}"`),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Skip details panel ────────────────────────────────────────────────────────

const SkipDetailsPanel: React.FC<{ skipped: number; details: SkipDetail[] }> = ({ skipped, details }) => {
  const { t } = useTranslation();
  if (skipped === 0 || details.length === 0) return null;
  const preview = details.slice(0, SKIP_PREVIEW_LIMIT);
  const hasMore = details.length > SKIP_PREVIEW_LIMIT;

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200 dark:border-amber-800">
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          {t('{{count}} rows skipped', { count: skipped })}
        </span>
        <button
          type="button"
          onClick={() => downloadSkipCsv(details)}
          className="text-xs text-amber-700 dark:text-amber-300 underline hover:no-underline"
        >
          {t('Download CSV')}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
              <th className="px-4 py-1.5 text-left font-medium text-amber-700 dark:text-amber-400 w-16">{t('Row')}</th>
              <th className="px-4 py-1.5 text-left font-medium text-amber-700 dark:text-amber-400">{t('Reason')}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((d, i) => (
              <tr key={i} className="border-b border-amber-100 dark:border-amber-900 last:border-0">
                <td className="px-4 py-1.5 text-amber-800 dark:text-amber-300 tabular-nums">{d.row}</td>
                <td className="px-4 py-1.5 text-amber-700 dark:text-amber-400 font-mono">{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <p className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800">
          {t('Showing {{shown}} of {{total}}. Download the CSV for the full report.', { shown: SKIP_PREVIEW_LIMIT, total: details.length })}
        </p>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const HistoryImportSettings: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  };

  const buildFormData = (file: File, dryRun: boolean): FormData => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('dry_run', String(dryRun));
    return fd;
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 3 MB.`;
    }
    return null;
  };

  const selectFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadState({ status: 'error', message: error });
      return;
    }
    setUploadState({ status: 'selected', file });
  }, []);

  // Step 2: dry run — parse + count, no DB writes
  const runPreview = useCallback(async () => {
    if (uploadState.status !== 'selected') return;
    const file = uploadState.file;
    setUploadState({ status: 'previewing' });

    try {
      const token = await getToken();
      const res = await fetch(`${IMPORTER_URL}/transactions/import-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(file, true),
      });

      if (!res.ok) {
        const body = await res.text();
        setUploadState({ status: 'error', message: extractErrorMessage(body, res.status) });
        return;
      }

      const json = await res.json();
      const samples: PreviewTransaction[] = (json.transactions ?? []).map((t: Record<string, unknown>) => ({
        purchase_date: String(t.purchase_date ?? ''),
        payee: String(t.payee ?? ''),
        amount: Number(t.amount ?? 0),
        category: t.category != null ? String(t.category) : null,
      }));
      setUploadState({
        status: 'preview',
        preview: {
          transaction_count: json.transaction_count ?? 0,
          total_amount: json.total_amount ?? 0,
          skipped: json.skipped ?? 0,
          skip_details: json.skip_details ?? [],
          samples,
          file,
        },
      });
    } catch (err) {
      setUploadState({ status: 'error', message: String(err) });
    }
  }, [uploadState]);

  // Step 3: confirmed — actual import
  const handleConfirm = useCallback(async () => {
    if (uploadState.status !== 'preview') return;
    const { file } = uploadState.preview;
    setUploadState({ status: 'importing' });

    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dry_run', 'false');

      const res = await fetch(`${IMPORTER_URL}/transactions/import-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) {
        const body = await res.text();
        setUploadState({ status: 'error', message: extractErrorMessage(body, res.status) });
        return;
      }

      const json = await res.json();
      const result: ImportResult = {
        inserted: json.inserted ?? 0,
        duplicates: json.duplicates ?? 0,
        skipped: json.skipped ?? 0,
        skip_details: json.skip_details ?? [],
        failed: json.failed ?? 0,
        accounts_created: json.accounts_created ?? [],
      };
      CacheUtils.invalidateTransactionRelated(queryClient);
      if (result.accounts_created.length > 0) {
        const defaultSelections: Record<number, number> = {};
        for (const acc of result.accounts_created) {
          defaultSelections[acc.id] = 1; // default to checking
        }
        setUploadState({ status: 'classify', result, typeSelections: defaultSelections, saving: false });
      } else {
        setUploadState({ status: 'success', result });
      }
    } catch (err) {
      setUploadState({ status: 'error', message: String(err) });
    }
  }, [uploadState]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  }, [selectFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
    e.target.value = '';
  }, [selectFile]);

  const reset = () => setUploadState({ status: 'idle' });

  const isProcessing = uploadState.status === 'previewing' || uploadState.status === 'importing';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Import Transaction History')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t('Upload an Excel file (.xls, .xlsx or .xlsm) with your categorized transaction history. Accounts and categories are created automatically if they don\'t exist.')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('Not sure about the format?')}{' '}
          <a
            href={`${import.meta.env.BASE_URL}pfm-import-template.xlsx`}
            download
            className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
          >
            {t('Download template')}
          </a>
        </p>
      </div>

      {/* Selected file card */}
      {uploadState.status === 'selected' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="h-8 w-8 shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{uploadState.file.name}</p>
                <p className="text-xs text-gray-400">{(uploadState.file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>{t('Remove')}</Button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {uploadState.status === 'idle' && (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors',
            isDragOver
              ? 'cursor-copy border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950'
              : 'cursor-pointer border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900',
          ].join(' ')}
        >
          <svg className="h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragOver ? t('Drop to upload') : t('Drag & drop or click to browse')}
            </p>
            <p className="text-xs text-gray-400 mt-1">{t('XLS, XLSX, XLSM · max 3 MB')}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MIME_TYPES.join(',') + ',' + ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* In progress */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <svg className="h-6 w-6 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm text-gray-500">
            {uploadState.status === 'previewing' ? t('Reading file…') : t('Importing…')}
          </p>
        </div>
      )}

      {/* Preview trigger */}
      {uploadState.status === 'selected' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('Nothing imported yet — review the preview first.')}</span>
          <Button size="sm" onClick={runPreview}>{t('Preview')}</Button>
        </div>
      )}

      {/* Dry-run preview */}
      {uploadState.status === 'preview' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Summary header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {t('{{count}} transactions found', { count: uploadState.preview.transaction_count })}
                </span>
                <span className="text-gray-400 dark:text-gray-500">·</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {t('{{amount}} total', { amount: formatAmount(uploadState.preview.total_amount) })}
                </span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">{t('Preview — nothing saved yet')}</span>
            </div>

            {/* Sample rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('Date')}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 w-full">{t('Payee')}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('Category')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('Amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {uploadState.preview.samples.map((txn, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                        {formatDate(txn.purchase_date)}
                      </td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200 truncate max-w-xs">
                        {txn.payee}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                        {txn.category ?? <span className="italic text-gray-400 dark:text-gray-600">—</span>}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${txn.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                        {formatAmount(txn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* "and N more" footer */}
            {uploadState.preview.transaction_count > PREVIEW_ROWS && (
              <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
                {t('…and {{count}} more transactions', { count: uploadState.preview.transaction_count - PREVIEW_ROWS })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <Button variant="ghost" size="sm" onClick={reset}>{t('Cancel')}</Button>
              <Button size="sm" onClick={handleConfirm}>{t('Confirm import')}</Button>
            </div>
          </div>

          <SkipDetailsPanel skipped={uploadState.preview.skipped} details={uploadState.preview.skip_details} />
        </div>
      )}

      {/* Classify new accounts */}
      {uploadState.status === 'classify' && (() => {
        const saveClassifications = async () => {
          if (uploadState.status !== 'classify') return;
          setUploadState(s => s.status === 'classify' ? { ...s, saving: true } : s);
          try {
            for (const acc of uploadState.result.accounts_created) {
              const typeId = uploadState.typeSelections[acc.id];
              if (typeId) {
                await supabase.from('accounts').update({ type_id: typeId }).eq('id', acc.id);
              }
            }
            CacheUtils.invalidateAccountRelated(queryClient);
          } finally {
            setUploadState({ status: 'success', result: uploadState.result });
          }
        };

        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 overflow-hidden">
              <div className="px-4 py-3 border-b border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {uploadState.result.accounts_created.length === 1
                    ? t('1 new account was created. Classify it so balances and filters work correctly.')
                    : t('{{n}} new accounts were created. Classify them so balances and filters work correctly.', { n: uploadState.result.accounts_created.length })}
                </p>
              </div>
              <div className="divide-y divide-blue-100 dark:divide-blue-900">
                {uploadState.result.accounts_created.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{acc.name}</span>
                    <Select
                      value={String(uploadState.typeSelections[acc.id] ?? 1)}
                      onValueChange={(v) => setUploadState(s =>
                        s.status === 'classify'
                          ? { ...s, typeSelections: { ...s.typeSelections, [acc.id]: Number(v) } }
                          : s
                      )}
                      disabled={uploadState.saving}
                    >
                      <SelectTrigger className="w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((at) => (
                          <SelectItem key={at.value} value={String(at.value)}>
                            {t(at.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline disabled:opacity-50"
                  onClick={() => setUploadState({ status: 'success', result: uploadState.result })}
                  disabled={uploadState.saving}
                >
                  {t('Skip for now')}
                </button>
                <Button size="sm" onClick={saveClassifications} disabled={uploadState.saving}>
                  {uploadState.saving ? t('Saving…') : t('Save')}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Success */}
      {uploadState.status === 'success' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  {t('{{count}} transactions imported', { count: uploadState.result.inserted })}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-green-700 dark:text-green-300" onClick={reset}>
                {t('Import another')}
              </Button>
            </div>
            {(uploadState.result.duplicates > 0 || uploadState.result.failed > 0) && (
              <div className="flex gap-4 text-xs text-green-700 dark:text-green-400 pl-6">
                {uploadState.result.duplicates > 0 && (
                  <span>{t('{{count}} duplicates skipped', { count: uploadState.result.duplicates })}</span>
                )}
                {uploadState.result.failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">{t('{{count}} failed', { count: uploadState.result.failed })}</span>
                )}
              </div>
            )}
          </div>

          <SkipDetailsPanel skipped={uploadState.result.skipped} details={uploadState.result.skip_details} />
        </div>
      )}

      {/* Error */}
      {uploadState.status === 'error' && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-red-800 dark:text-red-200 break-words">{uploadState.message}</span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-red-700 dark:text-red-300 shrink-0" onClick={reset}>
            {t('Try again')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default HistoryImportSettings;
