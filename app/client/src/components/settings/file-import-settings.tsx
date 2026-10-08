
import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { supabase } from '@/lib/supabase';
import ImportRulesSettings from './import-rules-settings';
import PdfPasswordsSettings from './pdf-passwords-settings';

// ── Error parsing ─────────────────────────────────────────────────────────────

function extractErrorMessage(body: string, status: number, t: TFunction): string {
  try {
    const json = JSON.parse(body);
    const detail = json?.detail;

    if (typeof detail === 'string') return detail;

    if (detail && typeof detail === 'object') {
      const code = detail.code as string | undefined;
      const msg = (detail.message as string | undefined)?.replace(/^PDF_PASSWORD_FAILED:/i, '').trim();

      switch (code) {
        case 'unsupported_layout':
          return t('Unsupported file layout — the importer could not recognise this file\'s structure. It may have an unexpected column layout or be the wrong file type.');
        case 'parser_failure':
          return msg ? t('Failed to parse the statement: {{message}}', { message: msg }) : t('Failed to parse the statement.');
        case 'ambiguous':
          return t('Could not determine the account — multiple import rules matched this file. Refine your rules to make the match unique.');
        case 'not_found':
          return t('No matching account — create an import rule below to route this file to the right account.');
        case 'pdf_password_failed':
          return t('Could not decrypt this PDF — add the correct password in PDF Passwords settings below.');
        default:
          return msg ?? t('Server error ({{status}})', { status });
      }
    }
  } catch {
    // body was not JSON — fall through
  }
  return body || t('Server error ({{status}})', { status });
}

// ── Constants ─────────────────────────────────────────────────────────────────

import { getImporterUrl } from '@/lib/config';
const IMPORTER_URL = getImporterUrl();
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const ACCEPTED_EXTENSIONS = ['.pdf', '.xls', '.xlsx'];
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const PREVIEW_ROWS = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewTransaction {
  payment_date: string;
  payee: string;
  amount: number;
}

interface PreviewData {
  totalCount: number;
  totalAmount: number;
  samples: PreviewTransaction[];
  file: File;
  accountId: string;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | { status: 'previewing' }
  | { status: 'preview'; preview: PreviewData }
  | { status: 'importing' }
  | { status: 'success'; count: number }
  | { status: 'error'; message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

function formatDate(iso: string): string {
  // Dates come as YYYY-MM-DD from the backend
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Upload Zone ───────────────────────────────────────────────────────────────

interface Account {
  id: number;
  name: string;
  is_active: boolean | null;
}

const UploadZone: React.FC = () => {
  const { t } = useTranslation();
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('__auto__');
  const supportedStatements = [
    { bank: 'Itaú', items: [t('Visa & Master cards (PDF, XLS)'), t('Checking account (XLS)')] },
    { bank: 'C6', items: [t('Card Master (PDF)'), t('Global account (PDF)')] },
    { bank: 'Porto Seguro', items: [t('Visa card (PDF)')] },
    { bank: 'BTG', items: [t('Master card (PDF)')] },
    { bank: 'XP', items: [t('Visa card (PDF)')] },
  ];
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, is_active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const getToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  };

  const buildFormData = (file: File): FormData => {
    const fd = new FormData();
    fd.append('file', file);
    return fd;
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return t('Unsupported file type "{{ext}}". Accepted: {{accepted}}.', { ext, accepted: ACCEPTED_EXTENSIONS.join(', ') });
    }
    if (file.size > MAX_FILE_SIZE) {
      return t('File is too large ({{size}} MB). Maximum is 3 MB.', { size: (file.size / 1024 / 1024).toFixed(1) });
    }
    return null;
  };

  // Step 1: stage the file — no network call yet
  const selectFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadState({ status: 'error', message: error });
      return;
    }
    setUploadState({ status: 'selected', file });
  }, [t]);

  // Step 2: dry run — parse only, no DB writes
  const runPreview = useCallback(async () => {
    if (uploadState.status !== 'selected') return;
    const file = uploadState.file;

    setUploadState({ status: 'previewing' });

    try {
      const token = await getToken();

      const url = new URL(`${IMPORTER_URL}/process-statement/`);
      url.searchParams.set('dry_run', 'true');
      url.searchParams.set('output_format', 'json');
      if (selectedAccountId && selectedAccountId !== '__auto__') url.searchParams.set('account_id', selectedAccountId);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(file),
      });

      if (!res.ok) {
        const body = await res.text();
        setUploadState({ status: 'error', message: extractErrorMessage(body, res.status, t) });
        return;
      }

      const json = await res.json();
      const all: PreviewTransaction[] = (json?.data?.transactions ?? []).map((t: Record<string, unknown>) => {
        const splits = Array.isArray(t.splits) ? (t.splits as Array<{ amount?: unknown }>) : [];
        const amount = splits.length
          ? splits.reduce((s, sp) => s + Number(sp.amount ?? 0), 0)
          : Number(t.amount ?? 0);
        return {
          payment_date: String(t.payment_date ?? ''),
          payee: String(t.payee ?? ''),
          amount,
        };
      });

      setUploadState({
        status: 'preview',
        preview: {
          totalCount: json?.transaction_count ?? all.length,
          totalAmount: all.reduce((s, txn) => s + txn.amount, 0),
          samples: all.slice(0, PREVIEW_ROWS),
          file,
          accountId: selectedAccountId,
        },
      });
    } catch (err) {
      setUploadState({ status: 'error', message: String(err) });
    }
  }, [selectedAccountId, t]);

  // Step 3: confirmed — actual import
  const handleConfirm = useCallback(async () => {
    if (uploadState.status !== 'preview') return;
    const { file, accountId, totalCount } = uploadState.preview;

    setUploadState({ status: 'importing' });

    try {
      const token = await getToken();

      const url = new URL(`${IMPORTER_URL}/process-statement/`);
      url.searchParams.set('output_format', 'none');
      if (accountId && accountId !== '__auto__') url.searchParams.set('account_id', accountId);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(file),
      });

      if (!res.ok) {
        const body = await res.text();
        setUploadState({ status: 'error', message: extractErrorMessage(body, res.status, t) });
        return;
      }

      const headerCount = res.headers.get('X-Transaction-Count');
      const count = headerCount !== null
        ? parseInt(headerCount, 10)
        : (await res.json().catch(() => null))?.transaction_count ?? totalCount;

      setUploadState({ status: 'success', count });
    } catch (err) {
      setUploadState({ status: 'error', message: String(err) });
    }
  }, [uploadState, t]);

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
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-medium">{t('Upload Statement')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t('Upload a bank statement (PDF, XLS, XLSX). Pick an account below to assign it directly, or leave on Auto-detect to route it via import rules.')}
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

      {/* Drop zone + supported banks panel */}
      {uploadState.status === 'idle' && (
        <div className="flex gap-4 items-stretch">
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={[
              'flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
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
              <p className="text-xs text-gray-400 mt-1">{t('PDF, XLS, XLSX · max 3 MB')}</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_MIME_TYPES.join(',') + ',' + ACCEPTED_EXTENSIONS.join(',')}
              className="hidden"
              onChange={handleInputChange}
            />
          </div>

          {/* Supported banks */}
          <div className="w-72 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('Supported statements')}</p>
            <ul className="space-y-2.5 text-sm flex-1">
              {supportedStatements.map((s) => (
                <li key={s.bank}>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{s.bank}</span>
                  <ul className="mt-0.5 space-y-0.5 list-disc list-inside">
                    {s.items.map((item) => (
                      <li key={item} className="text-xs text-gray-500 dark:text-gray-400 pl-1">
                        {item}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
              {t('Other bank? Use')}{' '}
              <Link to="/settings?tab=connections" className="underline hover:text-gray-600 dark:hover:text-gray-300">{t('Connections')}</Link>
              {' '}{t('or')}{' '}
              <Link to="/settings?tab=history" className="underline hover:text-gray-600 dark:hover:text-gray-300">{t('Import History')}</Link>.
            </p>
          </div>
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
            {uploadState.status === 'previewing' ? t('Parsing statement…') : t('Importing…')}
          </p>
        </div>
      )}

      {/* Account selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('Account')}</span>
        <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={isProcessing}>
          <SelectTrigger className="h-8 text-sm max-w-xs">
            <SelectValue placeholder={t('Auto-detect')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">{t('Auto-detect')}</SelectItem>
            {accounts.filter((a) => a.is_active).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview trigger */}
      {uploadState.status === 'selected' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('Nothing imported yet — review the preview first.')}</span>
          <Button size="sm" onClick={runPreview}>{t('Preview statement')}</Button>
        </div>
      )}

      {/* Dry-run preview */}
      {uploadState.status === 'preview' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Summary header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {t('{{count}} transactions found', { count: uploadState.preview.totalCount })}
              </span>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <span className="text-gray-600 dark:text-gray-400">
                {t('{{amount}} total', { amount: formatAmount(uploadState.preview.totalAmount) })}
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
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {uploadState.preview.samples.map((txn, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                      {formatDate(txn.payment_date)}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 truncate max-w-xs">
                      {txn.payee}
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
          {uploadState.preview.totalCount > PREVIEW_ROWS && (
            <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
              {t('…and {{count}} more transactions', { count: uploadState.preview.totalCount - PREVIEW_ROWS })}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('Cancel')}
            </Button>
            <Button size="sm" onClick={handleConfirm}>
              {t('Confirm import')}
            </Button>
          </div>
        </div>
      )}

      {/* Success */}
      {uploadState.status === 'success' && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              {t('{{count}} transactions imported', { count: uploadState.count })}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-green-700 dark:text-green-300" onClick={reset}>
            {t('Upload another')}
          </Button>
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

// ── Main component ─────────────────────────────────────────────────────────────

const FileImportSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* 1. Upload zone */}
      <UploadZone />

      {/* 2 & 3. Accordions */}
      <Accordion type="multiple" className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
        {/* Account Routing Rules */}
        <AccordionItem value="import-rules" className="border-0 px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <p className="text-sm font-medium">{t('Account Routing Rules')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                {t('Route uploaded files to the right account automatically — by bank, card type, filename, or content.')}
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ImportRulesSettings />
          </AccordionContent>
        </AccordionItem>

        {/* PDF Passwords */}
        <AccordionItem value="pdf-passwords" className="border-0 px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <p className="text-sm font-medium">{t('PDF Passwords')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                {t('If your bank sends encrypted PDFs, add the password here so the importer can unlock them.')}
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <PdfPasswordsSettings />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default FileImportSettings;
