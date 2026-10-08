
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, RefreshCw, Pencil, Trash2, Check, AlertCircle, CheckCircle2, History } from 'lucide-react';
import HybridDateInput from '@/components/transactions/inline-form-fields/hybrid-date-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { importerFetch } from '@/lib/importer';
import { toISODateString } from '@/lib/date-utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  provider: string;
  client_id: string;
  pluggy_item_id: string | null;
  enabled: boolean;
  import_from: string | null;
  timezone: string;
  created_at: string;
  connector_accounts: { count: number }[];
}

// Curated list — not the full ~400 IANA zones, just what Pluggy's current and
// likely-near-term institution coverage needs. Add more as connectors expand
// to new countries.
const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: 'América/São Paulo (BRT, UTC-3)' },
  { value: 'America/Manaus', label: 'América/Manaus (AMT, UTC-4)' },
  { value: 'America/Rio_Branco', label: 'América/Rio Branco (ACT, UTC-5)' },
  { value: 'America/New_York', label: 'América/New York (ET)' },
  { value: 'America/Santiago', label: 'América/Santiago' },
  { value: 'America/Bogota', label: 'América/Bogotá' },
  { value: 'America/Mexico_City', label: 'América/Cidade do México' },
  { value: 'Europe/Lisbon', label: 'Europa/Lisboa' },
  { value: 'Europe/Madrid', label: 'Europa/Madri' },
  { value: 'UTC', label: 'UTC' },
] as const;

// Ensures the currently-stored timezone is always shown, even if it is a valid
// IANA zone outside the curated list (e.g. set via the API), so the Select
// never renders blank and the value is not silently lost on save.
const timezoneOptionsWith = (current: string): { value: string; label: string }[] => {
  if (!current || TIMEZONE_OPTIONS.some((tz) => tz.value === current)) {
    return TIMEZONE_OPTIONS as unknown as { value: string; label: string }[];
  }
  return [{ value: current, label: current }, ...TIMEZONE_OPTIONS];
};

interface SyncState {
  last_sync_at: string | null;
  last_error: string | null;
}

interface ConnectorAccount {
  id: string;
  pluggy_account_id: string;
  account_id: number;
  type: string;
  name: string;
  connector_sync_state: SyncState[];
}

interface Account {
  id: number;
  name: string;
  slug: string;
  is_active: boolean | null;
}

interface PluggyAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  number: string | null;
  brand: string | null;
  level: string | null;
}

function toTitleCase(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function formatAccountNumber(a: PluggyAccount): string {
  if (!a.number) return '';
  if (a.subtype === 'CREDIT_CARD') return `····${a.number}`;
  // Bank accounts: drop leading zeros but keep one (00005320-1 → 05320-1)
  return a.number.replace(/^0+(?=\d)/, '0');
}

function pluggyAccountLabel(a: PluggyAccount): string {
  const subtypeLabel: Record<string, string> = {
    CHECKING_ACCOUNT: 'Corrente',
    SAVINGS_ACCOUNT: 'Poupança',
  };
  const suffix = a.subtype === 'CREDIT_CARD'
    ? [a.brand, a.level].filter(Boolean).map(s => toTitleCase(s!)).join(' ')
    : (subtypeLabel[a.subtype] ?? a.subtype);
  const num = formatAccountNumber(a);
  return [toTitleCase(a.name), suffix, num].filter(Boolean).join(' — ');
}

// ── Add Mapping form state ───────────────────────────────────────────────────

interface AddMappingState {
  pluggy_account_id: string;
  account_id: string;
  type: string;
  name: string;
}

const emptyMapping = (): AddMappingState => ({
  pluggy_account_id: '',
  account_id: '',
  type: '',
  name: '',
});

// Map Pluggy account types to internal types
function pluggyTypeToInternal(pluggyType: string): string {
  const upper = pluggyType.toUpperCase();
  if (upper === 'CREDIT') return 'credit_card';
  if (upper === 'BANK') return 'bank';
  return 'bank';
}

// ── Clearable date input ──────────────────────────────────────────────────────

const ClearableDateInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <div className="flex items-center gap-1">
    <div className="flex-1 min-w-0">
      <HybridDateInput value={value} onChange={onChange} placeholder={placeholder} size="default" />
    </div>
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

// ── Re-sync from date ───────────────────────────────────────────────────────

const ResyncButton: React.FC<{
  defaultDate: string;
  disabled?: boolean;
  isPending: boolean;
  onConfirm: (dateFrom: string) => Promise<unknown>;
}> = ({ defaultDate, disabled, isPending, onConfirm }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultDate);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDateFrom(defaultDate); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-1.5"
          title={t('Re-sync from date')}
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="space-y-1">
          <Label className="text-xs">{t('Re-sync from date')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('Re-fetches transactions from this date through today. Existing transactions are not duplicated.')}
          </p>
        </div>
        <HybridDateInput value={dateFrom} onChange={setDateFrom} size="default" />
        <Button
          size="sm"
          className="w-full"
          disabled={!dateFrom || isPending}
          onClick={async () => {
            try {
              await onConfirm(dateFrom);
              setOpen(false);
            } catch {
              // Keep the popover open on failure so the user sees the error
              // toast in context and can retry without reopening it.
            }
          }}
        >
          {isPending ? t('Starting…') : t('Start re-sync')}
        </Button>
      </PopoverContent>
    </Popover>
  );
};

// ── Add Connector form state ─────────────────────────────────────────────────

interface AddConnectorState {
  provider: string;
  client_id: string;
  client_secret: string;
  pluggy_item_id: string;
  import_from: string;
  timezone: string;
}

const emptyConnector = (): AddConnectorState => ({
  provider: '',
  client_id: '',
  client_secret: '',
  pluggy_item_id: '',
  import_from: '',
  timezone: 'America/Sao_Paulo',
});

// ── Edit Connector form state ─────────────────────────────────────────────────

interface EditConnectorState {
  client_id: string;
  client_secret: string;
  pluggy_item_id: string;
  import_from: string;
  timezone: string;
}

// ── Mask helper ──────────────────────────────────────────────────────────────

function maskClientId(client_id: string): string {
  if (client_id.length <= 4) return '••••';
  return `···${client_id.slice(-4)}`;
}

// ── Sync status helpers ───────────────────────────────────────────────────────

function formatSyncDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

function SyncStatusBadge({ state, t }: { state: SyncState | null; t: (k: string) => string }) {
  if (!state?.last_sync_at) return null;
  if (state.last_error) {
    return (
      <div className="flex items-center gap-1 mt-0.5" title={t(state.last_error)}>
        <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
        <span className="text-xs text-red-500 truncate max-w-[200px]">{t(state.last_error)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
      <span className="text-xs text-muted-foreground">{formatSyncDate(state.last_sync_at)}</span>
    </div>
  );
}

// ── ConnectorAccountsSection ─────────────────────────────────────────────────

interface ConnectorAccountsSectionProps {
  connector_id: string;
  accounts: Account[];
}

const ConnectorAccountsSection: React.FC<ConnectorAccountsSectionProps> = ({
  connector_id,
  accounts,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addForm, setAddForm] = useState<AddMappingState>(emptyMapping());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editMappingForm, setEditMappingForm] = useState<{ name: string; account_id: string }>({ name: '', account_id: '' });

  const { data: connector_accounts = [], isLoading } = useQuery<ConnectorAccount[]>({
    queryKey: ['connector-accounts', connector_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connector_accounts')
        .select('id, pluggy_account_id, account_id, type, name, connector_sync_state(last_sync_at, last_error)')
        .eq('connector_id', connector_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pluggyAccounts = [], isLoading: pluggyLoading, error: pluggyError } = useQuery<PluggyAccount[]>({
    queryKey: ['pluggy-accounts', connector_id],
    queryFn: async () => {
      const res = await importerFetch(`/connectors/${connector_id}/pluggy-accounts`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pluggy error ${res.status}: ${text}`);
      }
      return res.json();
    },
    enabled: showAddForm,
    retry: false,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('connector_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-accounts', connector_id] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (error) => {
      toast({
        title: t('Error removing mapping'),
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (form: AddMappingState) => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');
      const { error } = await supabase.from('connector_accounts').insert({
        connector_id,
        user_id: user.id,
        pluggy_account_id: form.pluggy_account_id,
        account_id: parseInt(form.account_id, 10),
        type: form.type,
        name: form.name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-accounts', connector_id] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setAddForm(emptyMapping());
      setShowAddForm(false);
    },
    onError: (error) => {
      toast({
        title: t('Error adding mapping'),
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, name, account_id }: { id: string; name: string; account_id: number }) => {
      const { error } = await supabase
        .from('connector_accounts')
        .update({ name, account_id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-accounts', connector_id] });
      setEditingMappingId(null);
    },
    onError: (error) => {
      toast({ title: t('Error updating mapping'), description: String(error), variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <p className="text-sm text-gray-500">{t('Loading mappings…')}</p>;
  }

  return (
    <div className="space-y-0">
      <div className="hidden md:block border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-44" />
            <col />
            <col className="w-[32%]" />
            <col className="w-14" />
          </colgroup>
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t('Provider Account ID')}</th>
              <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t('Provider Account Name')}</th>
              <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t('Mapped Account')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {connector_accounts.length === 0 && !showAddForm && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t('No account mappings yet.')}
                </td>
              </tr>
            )}

            {connector_accounts.map((ca) => {
              const pfm_account = accounts.find((a) => a.id === ca.account_id);
              const shortId = ca.pluggy_account_id.slice(0, 8) + '···';

              if (editingMappingId === ca.id) {
                return (
                  <tr key={ca.id} className="bg-muted/20">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground" title={ca.pluggy_account_id}>{shortId}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={editMappingForm.name}
                        onChange={(e) => setEditMappingForm((f) => ({ ...f, name: e.target.value }))}
                        className="h-8 text-xs"
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={editMappingForm.account_id}
                        onValueChange={(v) => setEditMappingForm((f) => ({ ...f, account_id: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {accounts.filter((a) => a.is_active || String(a.id) === editMappingForm.account_id).map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateMappingMutation.mutate({ id: ca.id, name: editMappingForm.name, account_id: Number(editMappingForm.account_id) })}
                          disabled={updateMappingMutation.isPending || !editMappingForm.name || !editMappingForm.account_id}
                          className="text-green-600 hover:text-green-700 disabled:opacity-40"
                          title={t('Save')}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingMappingId(null)} className="text-muted-foreground hover:text-foreground" title={t('Cancel')}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={ca.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground cursor-default" title={ca.pluggy_account_id}>{shortId}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm">{ca.name}</span>
                    <SyncStatusBadge state={ca.connector_sync_state?.[0] ?? null} t={t} />
                  </td>
                  <td className="px-3 py-2.5 text-sm">{pfm_account ? pfm_account.name : `#${ca.account_id}`}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setEditingMappingId(ca.id); setEditMappingForm({ name: ca.name, account_id: String(ca.account_id) }); }}
                        className="text-muted-foreground hover:text-foreground"
                        title={t('Edit Mapping')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeMutation.mutate(ca.id)}
                        disabled={removeMutation.isPending}
                        className="text-red-400 hover:text-red-600 disabled:opacity-40"
                        title={t('Remove')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Inline add row — only rendered once Pluggy accounts have loaded, to avoid a flash of half-populated inputs */}
            {showAddForm && pluggyLoading && (
              <tr className="bg-muted/10">
                <td colSpan={4} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {t('Loading accounts…')}
                </td>
              </tr>
            )}
            {showAddForm && !pluggyLoading && (
              <tr className="bg-muted/10">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {addForm.pluggy_account_id ? addForm.pluggy_account_id.slice(0, 8) + '···' : '—'}
                </td>
                <td className="px-3 py-2">
                  {pluggyError ? (
                    <span className="text-xs text-red-500">{t('Failed to load accounts')}</span>
                  ) : (
                    <Select
                      value={addForm.pluggy_account_id}
                      onValueChange={(v) => {
                        const acct = pluggyAccounts.find((a) => a.id === v);
                        setAddForm((f) => ({
                          ...f,
                          pluggy_account_id: v,
                          name: acct?.name ?? f.name,
                          type: acct ? pluggyTypeToInternal(acct.type) : f.type,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t('Select provider account')} />
                      </SelectTrigger>
                      <SelectContent>
                        {pluggyAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{pluggyAccountLabel(a)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={addForm.account_id}
                    onValueChange={(v) => setAddForm((f) => ({ ...f, account_id: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t('Select mapped account')} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.is_active).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => addMutation.mutate(addForm)}
                      disabled={addMutation.isPending || !!pluggyError || !addForm.pluggy_account_id || !addForm.account_id}
                      className="text-green-600 hover:text-green-700 disabled:opacity-40"
                      title={t('Save')}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setAddForm(emptyMapping()); }}
                      className="text-muted-foreground hover:text-foreground"
                      title={t('Cancel')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-border">
            <tr>
              <td colSpan={4} className="px-3 pt-4 pb-2">
                <div className="flex justify-end min-h-[32px] items-center">
                  {!showAddForm && (
                    <Button
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      + {t('Add Mapping')}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {connector_accounts.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('No account mappings yet.')}</p>
        )}

        {connector_accounts.map((ca) => {
          const pfm_account = accounts.find((a) => a.id === ca.account_id);
          const shortId = ca.pluggy_account_id.slice(0, 8) + '···';

          if (editingMappingId === ca.id) {
            return (
              <div key={ca.id} className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                <span className="font-mono text-xs text-muted-foreground block" title={ca.pluggy_account_id}>{shortId}</span>
                <Input
                  value={editMappingForm.name}
                  onChange={(e) => setEditMappingForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-8 text-xs"
                  autoFocus
                />
                <Select
                  value={editMappingForm.account_id}
                  onValueChange={(v) => setEditMappingForm((f) => ({ ...f, account_id: v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.is_active || String(a.id) === editMappingForm.account_id).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => updateMappingMutation.mutate({ id: ca.id, name: editMappingForm.name, account_id: Number(editMappingForm.account_id) })}
                    disabled={updateMappingMutation.isPending || !editMappingForm.name || !editMappingForm.account_id}
                    className="text-green-600 hover:text-green-700 disabled:opacity-40"
                    title={t('Save')}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingMappingId(null)} className="text-muted-foreground hover:text-foreground" title={t('Cancel')}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={ca.id} className="border border-border rounded-md p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium truncate">{ca.name}</p>
                <p className="font-mono text-xs text-muted-foreground truncate" title={ca.pluggy_account_id}>{shortId}</p>
                <p className="text-xs text-muted-foreground">
                  {t('Mapped Account')}: {pfm_account ? pfm_account.name : `#${ca.account_id}`}
                </p>
                <SyncStatusBadge state={ca.connector_sync_state?.[0] ?? null} t={t} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => { setEditingMappingId(ca.id); setEditMappingForm({ name: ca.name, account_id: String(ca.account_id) }); }}
                  className="text-muted-foreground hover:text-foreground"
                  title={t('Edit Mapping')}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => removeMutation.mutate(ca.id)}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40"
                  title={t('Remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add-mapping card — only rendered once Pluggy accounts have loaded, to avoid a flash of half-populated inputs */}
        {showAddForm && pluggyLoading && (
          <div className="border border-border rounded-md p-3 bg-muted/10 text-center text-xs text-muted-foreground">
            {t('Loading accounts…')}
          </div>
        )}
        {showAddForm && !pluggyLoading && (
          <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
            {pluggyError ? (
              <span className="text-xs text-red-500">{t('Failed to load accounts')}</span>
            ) : (
              <Select
                value={addForm.pluggy_account_id}
                onValueChange={(v) => {
                  const acct = pluggyAccounts.find((a) => a.id === v);
                  setAddForm((f) => ({
                    ...f,
                    pluggy_account_id: v,
                    name: acct?.name ?? f.name,
                    type: acct ? pluggyTypeToInternal(acct.type) : f.type,
                  }));
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t('Select provider account')} />
                </SelectTrigger>
                <SelectContent>
                  {pluggyAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{pluggyAccountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={addForm.account_id}
              onValueChange={(v) => setAddForm((f) => ({ ...f, account_id: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t('Select mapped account')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.is_active).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => addMutation.mutate(addForm)}
                disabled={addMutation.isPending || !!pluggyError || !addForm.pluggy_account_id || !addForm.account_id}
                className="text-green-600 hover:text-green-700 disabled:opacity-40"
                title={t('Save')}
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setShowAddForm(false); setAddForm(emptyMapping()); }}
                className="text-muted-foreground hover:text-foreground"
                title={t('Cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          {!showAddForm && (
            <Button
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              + {t('Add Mapping')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ConnectorsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // Which connector is showing the edit-credentials form
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditConnectorState>({
    client_id: '',
    client_secret: '',
    pluggy_item_id: '',
    import_from: '',
    timezone: 'America/Sao_Paulo',
  });

  // Add connector form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddConnectorState>(emptyConnector());

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: connectors = [], isLoading: connectorsLoading } = useQuery<Connector[]>({
    queryKey: ['connectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connectors')
        .select('id, provider, client_id, pluggy_item_id, schedule, enabled, import_from, timezone, created_at, connector_accounts(count)')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Connector[];
    },
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, slug, is_active')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (form: AddConnectorState) => {
      const body: Record<string, string> = {
        provider: 'pluggy',
        client_id: form.client_id,
        client_secret: form.client_secret,
        pluggy_item_id: form.pluggy_item_id,
        schedule: 'daily',
        timezone: form.timezone,
      };
      if (form.import_from) body.import_from = form.import_from;
      const res = await importerFetch('/connectors', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setAddForm(emptyConnector());
      setShowAddForm(false);
      toast({ title: t('Connector created'), description: t('Add account mappings below to enable sync.') });
    },
    onError: (error) => {
      toast({ title: t('Error creating connector'), description: String(error), variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: EditConnectorState }) => {
      const body: Record<string, string> = {
        client_id: form.client_id,
        client_secret: form.client_secret,
        schedule: 'daily',
        timezone: form.timezone,
      };
      if (form.pluggy_item_id) body.pluggy_item_id = form.pluggy_item_id;
      if (form.import_from) body.import_from = form.import_from;
      const res = await importerFetch(`/connectors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['pluggy-accounts', id] });
      setEditingConnectorId(null);
      toast({ title: t('Connector updated') });
    },
    onError: (error) => {
      toast({ title: t('Error updating connector'), description: String(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await importerFetch(`/connectors/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      toast({ title: t('Connector deleted') });
    },
    onError: (error) => {
      toast({ title: t('Error deleting connector'), description: String(error), variant: 'destructive' });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await importerFetch(`/connectors/${id}/sync`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      toast({ title: t('Sync started'), description: t('Transactions will appear shortly.') });
    },
    onError: (error) => {
      toast({ title: t('Error starting sync'), description: String(error), variant: 'destructive' });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async ({ id, dateFrom }: { id: string; dateFrom: string }) => {
      const res = await importerFetch(`/connectors/${id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      toast({ title: t('Re-sync started'), description: t('Transactions will appear shortly.') });
    },
    onError: (error) => {
      toast({ title: t('Error starting re-sync'), description: String(error), variant: 'destructive' });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('connectors')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
    },
    onError: (error) => {
      toast({ title: t('Error toggling connector'), description: String(error), variant: 'destructive' });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleEditOpen = (connector: Connector) => {
    setEditingConnectorId(connector.id);
    setEditForm({
      client_id: connector.client_id,
      client_secret: '',
      pluggy_item_id: connector.pluggy_item_id ?? '',
      import_from: connector.import_from ?? '',
      timezone: connector.timezone ?? 'America/Sao_Paulo',
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">{t('Connectors')}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('Manage Pluggy connectors for automatic transaction import.')}
          </p>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white">
            + {t('Add Connector')}
          </Button>
        )}
      </div>

      {/* Add Connector section */}
      {showAddForm && (
        <Card className="border border-gray-200 dark:border-gray-700 mx-4">
          <CardHeader>
            <CardTitle className="text-sm">{t('New Connector')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Provider selector — starts blank */}
            <div className="space-y-1">
              <Label className="text-xs">{t('Provider')}</Label>
              <Select
                value={addForm.provider}
                onValueChange={(v) => setAddForm((f) => ({ ...f, provider: v }))}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder={t('Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pluggy">Pluggy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Credentials — revealed once provider is chosen */}
            {addForm.provider && (
              <>
                {/* Client ID / Item ID / Client Secret / Import from: one per line on mobile, 2-col on desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Client ID')}</Label>
                    <Input
                      value={addForm.client_id}
                      onChange={(e) => setAddForm((f) => ({ ...f, client_id: e.target.value }))}
                      placeholder="client_id"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Item ID')}</Label>
                    <Input
                      value={addForm.pluggy_item_id}
                      onChange={(e) => setAddForm((f) => ({ ...f, pluggy_item_id: e.target.value }))}
                      placeholder={t('Pluggy item ID')}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Client Secret')}</Label>
                    <Input
                      type="password"
                      value={addForm.client_secret}
                      onChange={(e) => setAddForm((f) => ({ ...f, client_secret: e.target.value }))}
                      placeholder="client_secret"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Import from (optional)')}</Label>
                    <ClearableDateInput
                      value={addForm.import_from}
                      onChange={(v) => setAddForm((f) => ({ ...f, import_from: v }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Timezone')}</Label>
                    <Select
                      value={addForm.timezone}
                      onValueChange={(v) => setAddForm((f) => ({ ...f, timezone: v }))}
                    >
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm(emptyConnector());
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => createMutation.mutate(addForm)}
                disabled={
                  createMutation.isPending ||
                  !addForm.provider ||
                  !addForm.client_id ||
                  !addForm.client_secret ||
                  !addForm.pluggy_item_id
                }
              >
                {createMutation.isPending ? t('Creating…') : t('Create Connector')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connector list */}
      {connectorsLoading ? (
        <p className="text-sm text-gray-500">{t('Loading connectors…')}</p>
      ) : connectors.length === 0 ? (
        <p className="text-sm text-gray-500">{t('No connectors configured yet.')}</p>
      ) : (
        <div className="space-y-3 mx-4">
          {connectors.map((connector) => {
            const mappingCount = connector.connector_accounts?.[0]?.count ?? 0;
            const canEnable = mappingCount > 0;
            return (
              <Card key={connector.id} className="border border-gray-200 dark:border-gray-700">
                <CardHeader className="px-6 pt-5 pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-sm font-semibold">
                        {toTitleCase(connector.provider)} ({maskClientId(connector.client_id)}{connector.pluggy_item_id ? ` · item ···${connector.pluggy_item_id.slice(-4)}` : ''})
                      </CardTitle>
                    </div>
                    <div className="flex items-center justify-between gap-2 w-full sm:w-auto sm:justify-end">
                      <Switch
                        checked={connector.enabled}
                        onCheckedChange={(checked) =>
                          toggleEnabledMutation.mutate({ id: connector.id, enabled: checked })
                        }
                        disabled={toggleEnabledMutation.isPending || !canEnable}
                        title={connector.enabled ? t('Enabled') : canEnable ? t('Disabled') : t('Add a mapping to enable')}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncMutation.mutate(connector.id)}
                          disabled={syncMutation.isPending || !canEnable}
                          className="flex items-center gap-1.5"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">{syncMutation.isPending ? t('Syncing…') : t('Sync')}</span>
                        </Button>
                        <ResyncButton
                          defaultDate={connector.import_from ?? toISODateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))}
                          disabled={!canEnable}
                          isPending={resyncMutation.isPending}
                          onConfirm={(dateFrom) => resyncMutation.mutateAsync({ id: connector.id, dateFrom })}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            editingConnectorId === connector.id
                              ? setEditingConnectorId(null)
                              : handleEditOpen(connector)
                          }
                          className="flex items-center gap-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t('Edit')}</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(connector.id)}
                          disabled={deleteMutation.isPending}
                          className="flex items-center gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t('Delete')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 px-6 pt-4 pb-6">
                  {/* Edit credentials form */}
                  {editingConnectorId === connector.id && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded p-3 space-y-3">
                      <h4 className="text-sm font-medium">{t('Edit Credentials')}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Client ID')}</Label>
                          <Input
                            value={editForm.client_id}
                            onChange={(e) => setEditForm((f) => ({ ...f, client_id: e.target.value }))}
                            placeholder="client_id"
                            className="text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Client Secret')}</Label>
                          <Input
                            type="password"
                            value={editForm.client_secret}
                            onChange={(e) => setEditForm((f) => ({ ...f, client_secret: e.target.value }))}
                            placeholder={t('New secret (leave blank to keep current)')}
                            className="text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Pluggy Item ID')}</Label>
                          <Input
                            value={editForm.pluggy_item_id}
                            onChange={(e) => setEditForm((f) => ({ ...f, pluggy_item_id: e.target.value }))}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Import from (optional)')}</Label>
                          <ClearableDateInput
                            value={editForm.import_from}
                            onChange={(v) => setEditForm((f) => ({ ...f, import_from: v }))}
                            placeholder={t('(optional, leave blank to import everything available)')}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Timezone')}</Label>
                          <Select
                            value={editForm.timezone}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, timezone: v }))}
                          >
                            <SelectTrigger className="text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timezoneOptionsWith(editForm.timezone).map((tz) => (
                                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingConnectorId(null)}
                        >
                          {t('Cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateMutation.mutate({ id: connector.id, form: editForm })
                          }
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? t('Saving…') : t('Save')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Account mappings */}
                  <ConnectorAccountsSection
                    connector_id={connector.id}
                    accounts={accounts}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConnectorsSettings;
