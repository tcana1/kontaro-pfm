
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { importerFetch } from '@/lib/importer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportRule {
  id: string;
  bank: string;
  type: string;
  text_pattern: string | null;
  filename_pattern: string | null;
  account_id: number | null;
  account_slug: string | null;
}

interface Account {
  id: number;
  name: string;
  slug: string;
}

interface AddRuleState {
  bank: string;
  type: string;
  account_id: string;
  text_pattern: string;
  filename_pattern: string;
}

const emptyRule = (): AddRuleState => ({
  bank: '',
  type: 'credit_card',
  account_id: '',
  text_pattern: '',
  filename_pattern: '',
});

const BANKS = [
  { value: 'itau', labelKey: 'Itaú' },
  { value: 'c6', labelKey: 'C6 Bank' },
  { value: 'porto', labelKey: 'Porto' },
  { value: 'btg', labelKey: 'BTG Pactual' },
  { value: 'xp', labelKey: 'XP Investimentos' },
  { value: 'nubank', labelKey: 'Nubank' },
  { value: 'bradesco', labelKey: 'Bradesco' },
  { value: 'santander', labelKey: 'Santander' },
  { value: 'unknown', labelKey: 'Unknown bank' },
] as const;

const TYPES = [
  { value: 'credit_card', labelKey: 'Credit Card' },
  { value: 'bank_account', labelKey: 'Bank Account' },
] as const;

const bankLabel = (value: string): string => BANKS.find((b) => b.value === value)?.labelKey ?? value;
const typeLabel = (value: string): string => TYPES.find((t) => t.value === value)?.labelKey ?? value;

// ── Helper panel ───────────────────────────────────────────────────────────────

const HelpPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 rounded-lg p-4 space-y-3 text-sm">
      <p className="font-medium text-blue-900 dark:text-blue-100">{t('How rules work')}</p>
      <p className="text-blue-800 dark:text-blue-200">
        {t('When you upload a file, the importer automatically detects the bank and type. It then looks for a matching rule to decide which account to import into.')}
      </p>
      <div className="space-y-2 text-blue-800 dark:text-blue-200">
        <p className="font-medium">{t('One card per bank → no extra fields needed.')}</p>
        <p>
          {t('If you have one Itaú credit card, just set bank=itau + type=credit_card + account. Every Itaú credit card PDF goes there.')}
        </p>
      </div>
      <div className="space-y-2 text-blue-800 dark:text-blue-200">
        <p className="font-medium">{t('Two cards from the same bank → use Text Pattern to tell them apart.')}</p>
        <p>
          {t('Example: Itaú Visa + Itaú Mastercard. Open one PDF and find a word that only appears in it (e.g. "Visa" or "Mastercard"). Create two rules with that as the text pattern. The importer searches for that text in the file content.')}
        </p>
      </div>
      <div className="space-y-2 text-blue-800 dark:text-blue-200">
        <p className="font-medium">{t('Filename Pattern — when you control the filename.')}</p>
        <p>
          {t('If you rename files before uploading (e.g. {{first}} vs {{second}}), use a filename pattern instead. Both patterns are regex — simple words work fine.', { first: 'itau-visa.pdf', second: 'itau-master.pdf' })}
        </p>
      </div>
      <p className="text-blue-700 dark:text-blue-300 text-xs">
        {t("If multiple rules match a file, the import is flagged as ambiguous and you'll be asked to choose manually.")}
      </p>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const ImportRulesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [addForm, setAddForm] = useState<AddRuleState>(emptyRule());

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [], isLoading } = useQuery<ImportRule[]>({
    queryKey: ['import-rules'],
    queryFn: async () => {
      const res = await importerFetch('/import-rules');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
      return res.json();
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (form: AddRuleState) => {
      const body: Record<string, string | number> = {
        bank: form.bank,
        type: form.type,
        account_id: parseInt(form.account_id, 10),
      };
      if (form.text_pattern.trim()) body.text_pattern = form.text_pattern.trim();
      if (form.filename_pattern.trim()) body.filename_pattern = form.filename_pattern.trim();

      const res = await importerFetch('/import-rules', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-rules'] });
      setAddForm(emptyRule());
      setShowAddForm(false);
      setShowPatterns(false);
      toast({ title: t('Import rule created') });
    },
    onError: (error) => {
      toast({ title: t('Error creating import rule'), description: String(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await importerFetch(`/import-rules/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-rules'] });
      toast({ title: t('Import rule deleted') });
    },
    onError: (error) => {
      toast({ title: t('Error deleting import rule'), description: String(error), variant: 'destructive' });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-blue-600 dark:text-blue-400 shrink-0"
          onClick={() => setShowHelp((v) => !v)}
        >
          {showHelp ? t('Hide help') : t('How does this work?')}
        </Button>
      </div>

      {showHelp && <HelpPanel />}

      {/* Rules table */}
      {isLoading ? (
        <p className="text-sm text-gray-500">{t('Loading rules…')}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-gray-500">{t('No rules configured yet.')}</p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Bank')}</TableHead>
                <TableHead>{t('Type')}</TableHead>
                <TableHead>{t('Patterns')}</TableHead>
                <TableHead className="border-l border-gray-200 dark:border-gray-700">{t('Account')}</TableHead>
                <TableHead className="text-right">{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const account = accounts.find((a) => a.id === rule.account_id);
                const patterns = [
                  rule.text_pattern && `text: "${rule.text_pattern}"`,
                  rule.filename_pattern && `file: "${rule.filename_pattern}"`,
                ].filter(Boolean).join(', ');
                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-sm">{t(bankLabel(rule.bank))}</TableCell>
                    <TableCell className="text-sm">{t(typeLabel(rule.type))}</TableCell>
                    <TableCell className="text-xs text-gray-500 font-mono">
                      {patterns || <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm border-l border-gray-200 dark:border-gray-700 bg-blue-50/40 dark:bg-blue-950/20">
                      {account ? account.name : rule.account_slug ?? `#${rule.account_id}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {t('Delete')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add rule form */}
      {showAddForm ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-semibold">{t('New Rule')}</h4>

          {/* Condition */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('If a file matches:')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('Bank')}</Label>
                <Select
                  value={addForm.bank}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, bank: v }))}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder={t('Select bank')} />
                  </SelectTrigger>
                  <SelectContent>
                    {BANKS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{t(b.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('Type')}</Label>
                <Select
                  value={addForm.type}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((ty) => (
                      <SelectItem key={ty.value} value={ty.value}>{t(ty.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('Bank and Type are detected automatically from the file — pick the values that should match.')}
            </p>

            {showPatterns ? (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t('Text Pattern')} <span className="text-gray-400 font-normal">{t('(optional — regex matched against file content)')}</span>
                  </Label>
                  <Input
                    value={addForm.text_pattern}
                    onChange={(e) => setAddForm((f) => ({ ...f, text_pattern: e.target.value }))}
                    placeholder='e.g. Visa, Mastercard, "The One"'
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t('Filename Pattern')} <span className="text-gray-400 font-normal">{t('(optional — regex matched against filename)')}</span>
                  </Label>
                  <Input
                    value={addForm.filename_pattern}
                    onChange={(e) => setAddForm((f) => ({ ...f, filename_pattern: e.target.value }))}
                    placeholder={t('e.g. itau-visa, master')}
                    className="text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
                  onClick={() => setShowPatterns(false)}
                >
                  {t('Hide pattern fields')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
                onClick={() => setShowPatterns(true)}
              >
                {t('Add pattern to tell similar files apart (optional)')}
              </button>
            )}
          </div>

          {/* Arrow connecting condition to result */}
          <div className="flex items-center justify-center text-gray-400 dark:text-gray-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Result */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
              {t('Send it to:')}
            </p>
            <Select
              value={addForm.account_id}
              onValueChange={(v) => setAddForm((f) => ({ ...f, account_id: v }))}
            >
              <SelectTrigger className="text-xs h-9 bg-white dark:bg-gray-950">
                <SelectValue placeholder={t('Select account')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setAddForm(emptyRule());
                setShowPatterns(false);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(addForm)}
              disabled={createMutation.isPending || !addForm.bank || !addForm.account_id}
            >
              {createMutation.isPending ? t('Creating…') : t('Add Rule')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAddForm(true)}>
          {t('Add Rule')}
        </Button>
      )}
    </div>
  );
};

export default ImportRulesSettings;
