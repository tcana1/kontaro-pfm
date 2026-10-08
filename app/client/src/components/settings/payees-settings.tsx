import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
import { useFinance } from '@/contexts/finance-context';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import CategorySelect from '@/components/transactions/inline-form-fields/category-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Merge, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

type Payee = {
  id: number;
  name: string;
  default_category_id: number | null;
  transaction_count: number;
};

type SortField = 'name' | 'category' | 'transaction_count';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PayeesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { categories } = useFinance();

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSurvivorId, setMergeSurvivorId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: payees = [], isLoading } = useQuery({
    queryKey: ['payees-management'],
    queryFn: () => supabaseService.getAllPayeesWithCounts(),
  });

  // Map category id → display name for sorting
  const categoryNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const cat of categories) {
      const displayName = cat.category_groups
        ? `${cat.category_groups.name}: ${cat.name}`
        : cat.name;
      map.set(cat.id, displayName);
    }
    return map;
  }, [categories]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payees-management'] });
    queryClient.invalidateQueries({ queryKey: ['payees'] });
  };

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      supabaseService.renamePayee(id, name),
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (err: any) => {
      const isDuplicate = err?.code === '23505' || err?.message?.includes('unique');
      toast({
        title: isDuplicate ? t('Name already exists') : t('Rename failed'),
        description: isDuplicate
          ? t('A payee with that name already exists. Use Merge to combine them.')
          : err?.message,
        variant: 'destructive',
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceIds, targetId }: { sourceIds: number[]; targetId: number }) => {
      for (const sourceId of sourceIds) {
        await supabaseService.mergePayees(sourceId, targetId);
      }
    },
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      setMergeDialogOpen(false);
      toast({ title: t('Payees merged') });
    },
    onError: (err: any) => {
      toast({ title: t('Merge failed'), description: err?.message, variant: 'destructive' });
    },
  });

  const setCategoryMutation = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number | null }) =>
      supabaseService.setPayeeDefaultCategory(id, categoryId),
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      toast({ title: t('Failed to update category'), description: err?.message, variant: 'destructive' });
    },
  });

  // Reset to page 1 when search or sort changes
  useEffect(() => { setPage(1); }, [search, sortField, sortDir]);

  const filtered = useMemo(() =>
    payees.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [payees, search]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      } else if (sortField === 'transaction_count') {
        cmp = a.transaction_count - b.transaction_count;
      } else if (sortField === 'category') {
        const aName = a.default_category_id ? (categoryNameMap.get(a.default_category_id) ?? '') : '';
        const bName = b.default_category_id ? (categoryNameMap.get(b.default_category_id) ?? '') : '';
        cmp = aName.localeCompare(bName, undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir, categoryNameMap]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const selectedPayees = payees.filter(p => selectedIds.has(p.id));

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1" />
      : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const startEditing = (payee: Payee) => {
    setEditingId(payee.id);
    setEditingName(payee.name);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    const original = payees.find(p => p.id === editingId)?.name;
    if (!trimmed || trimmed === original) { setEditingId(null); return; }
    renameMutation.mutate({ id: editingId, name: trimmed });
  };

  const openMergeDialog = () => {
    setMergeSurvivorId(selectedPayees[0]?.id ?? null);
    setMergeDialogOpen(true);
  };

  const commitMerge = () => {
    if (!mergeSurvivorId || selectedPayees.length < 2) return;
    const sources = selectedPayees.filter(p => p.id !== mergeSurvivorId);
    mergeMutation.mutate({ sourceIds: sources.map(s => s.id), targetId: mergeSurvivorId });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium">{t('Manage your payees')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('Rename a payee, set a default category, or merge payees to consolidate transaction history.')}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {selectedIds.size >= 2 && (
          <Button variant="outline" onClick={openMergeDialog} className="flex items-center gap-1.5">
            <Merge className="h-4 w-4" />
            {t('Merge {{count}} payees', { count: selectedIds.size })}
          </Button>
        )}
        <Input
          placeholder={t('Search payees…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm ml-auto"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
      ) : (
        <>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '52%' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium">
                    <button
                      className="flex items-center hover:text-foreground"
                      onClick={() => handleSortClick('name')}
                    >
                      {t('Name')} <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    <button
                      className="flex items-center hover:text-foreground"
                      onClick={() => handleSortClick('category')}
                    >
                      {t('Default Category')} <SortIcon field="category" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <button
                      className="flex items-center justify-end w-full hover:text-foreground"
                      onClick={() => handleSortClick('transaction_count')}
                    >
                      {t('Transactions')} <SortIcon field="transaction_count" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-sm">
                      {search ? t('No payees match your search.') : t('No payees yet.')}
                    </td>
                  </tr>
                )}
                {paginated.map(payee => (
                  <tr
                    key={payee.id}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      selectedIds.has(payee.id) && 'bg-muted/50'
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedIds.has(payee.id)}
                        onCheckedChange={() => toggleSelect(payee.id)}
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      {editingId === payee.id ? (
                        <Input
                          ref={editInputRef}
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="h-10"
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => startEditing(payee)}
                            title={t('Click to rename')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <span className="truncate">{payee.name}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-1.5 overflow-hidden">
                      <div className="flex items-center gap-1 min-w-0">
                        <div className="min-w-0 flex-1">
                          <CategorySelect
                            value={payee.default_category_id?.toString() ?? ''}
                            onChange={val => {
                              const categoryId = val ? Number(val) : null;
                              setCategoryMutation.mutate({ id: payee.id, categoryId });
                            }}
                            size="default"
                          />
                        </div>
                        {payee.default_category_id != null && (
                          <button
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded shrink-0"
                            title={t('Clear default category')}
                            onClick={() => setCategoryMutation.mutate({ id: payee.id, categoryId: null })}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="tabular-nums text-muted-foreground">{payee.transaction_count}</span>
                        <button
                          onClick={() => window.open(`/transactions?search=${encodeURIComponent(payee.name)}`, '_blank')}
                          title={t('View transactions')}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — count + arrows */}
          <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-2">
            <span>
              {sorted.length === 0
                ? t('0 payees')
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Page size selector — right-aligned, matching transaction table style */}
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>{t('Show')}</span>
            <Select
              value={String(pageSize)}
              onValueChange={val => { setPageSize(Number(val)); setPage(1); }}
            >
              <SelectTrigger className="h-7 w-[65px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{t('per page')}</span>
          </div>
        </>
      )}

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Merge Payees')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('Choose which name to keep. All transactions will be moved to the surviving payee.')}
          </p>
          <RadioGroup
            value={mergeSurvivorId?.toString() ?? ''}
            onValueChange={val => setMergeSurvivorId(Number(val))}
            className="gap-3 pt-1"
          >
            {selectedPayees.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <RadioGroupItem value={p.id.toString()} id={`survivor-${p.id}`} />
                <Label htmlFor={`survivor-${p.id}`} className="font-normal cursor-pointer">
                  {p.name}
                  <span className="ml-2 text-muted-foreground text-xs">
                    ({p.transaction_count} transaction{p.transaction_count !== 1 ? 's' : ''})
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>{t('Cancel')}</Button>
            <Button onClick={commitMerge} disabled={mergeMutation.isPending || !mergeSurvivorId || selectedPayees.length < 2}>
              {mergeMutation.isPending ? t('Merging…') : t('Merge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayeesSettings;
