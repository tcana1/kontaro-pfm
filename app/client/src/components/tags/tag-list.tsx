import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMobileHeader } from '@/contexts/mobile-header-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, GitMerge, ChevronUp, ChevronDown, ChevronsUpDown, Palette, Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { formatCurrency } from '@/lib/currency-formatter';
import { useFinance } from '@/contexts/finance-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Tag } from '@shared/schema';
import TagDetail from './tag-detail';

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6B7280', '#0EA5E9', '#F97316', '#14B8A6',
];

type SortField = 'name' | 'count' | 'total';
type SortDir   = 'asc' | 'desc';

// ── Inline color dot picker ───────────────────────────────────────────────────

function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-4 h-4 rounded-full flex-shrink-0 ring-offset-1 hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-500 transition-all"
          style={{ backgroundColor: color }}
          onClick={e => e.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map(c => (
            <button
              key={c}
              className={cn('w-5 h-5 rounded-full transition-transform', color === c && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
              style={{ backgroundColor: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: SortDir }) {
  if (active !== field) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return dir === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
}

// ── Main component ────────────────────────────────────────────────────────────

const TagList: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { currency } = useFinance();
  const { toast } = useToast();

  useMobileHeader(() => (
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('Tags')}</span>
  ), []);

  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ['tagsAll'],
    queryFn: () => supabaseService.getTagsAll(),
  });
  const { data: stats = {} } = useQuery({
    queryKey: ['tagStats'],
    queryFn: () => supabaseService.getTagStats(),
  });

  const [search,       setSearch]       = useState('');
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set());
  const [sortField,    setSortField]    = useState<SortField>('name');
  const [sortDir,      setSortDir]      = useState<SortDir>('asc');
  const [editingId,    setEditingId]    = useState<number | null>(null);
  const [editingName,  setEditingName]  = useState('');
  const [creating,     setCreating]     = useState(false);
  const [newName,      setNewName]      = useState('');
  const [newColor,     setNewColor]     = useState('#3B82F6');
  const [showArchived, setShowArchived] = useState(false);
  const [detailTagId,  setDetailTagId]  = useState<number | null>(null);

  // dialogs
  const [deleteOpen,    setDeleteOpen]    = useState(false);
  const [mergeOpen,     setMergeOpen]     = useState(false);
  const [survivorId,    setSurvivorId]    = useState<number | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [bulkColor,     setBulkColor]     = useState('#3B82F6');

  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef  = useRef<HTMLInputElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const invalidate = () => {
    CacheUtils.invalidateTagRelated(queryClient, true);
    queryClient.invalidateQueries({ queryKey: ['tagStats'] });
    queryClient.invalidateQueries({ queryKey: ['tagsAll'] });
  };

  // 23505 = unique_violation from the (user_id, lower(btrim(name))) index on tags.
  const tagErrorMessage = (err: Error & { code?: string }) =>
    err.code === '23505' ? t('A tag with this name already exists.') : err.message;

  const filtered = useMemo(() =>
    tags.filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) &&
      (showArchived ? t.archived : !t.archived)
    ),
    [tags, search, showArchived]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name')  cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (sortField === 'count') cmp = (stats[a.id]?.count ?? 0) - (stats[b.id]?.count ?? 0);
    if (sortField === 'total') cmp = (stats[a.id]?.total ?? 0) - (stats[b.id]?.total ?? 0);
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortField, sortDir, stats]);

  const selectedTags       = tags.filter(t => selectedIds.has(t.id));
  const allVisibleSelected = sorted.length > 0 && sorted.every(t => selectedIds.has(t.id));
  const affectedTxnCount   = selectedTags.reduce((s, t) => s + (stats[t.id]?.count ?? 0), 0);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      supabaseService.updateTag(id, { name }),
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (err: Error) => toast({ title: t('Error'), description: tagErrorMessage(err), variant: 'destructive' }),
  });

  const colorMutation = useMutation({
    mutationFn: ({ id, color }: { id: number; color: string }) =>
      supabaseService.updateTag(id, { color }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast({ title: t('Error'), description: err.message, variant: 'destructive' }),
  });

  const bulkColorMutation = useMutation({
    mutationFn: async (color: string) => {
      for (const id of Array.from(selectedIds)) await supabaseService.updateTag(id, { color });
    },
    onSuccess: () => { invalidate(); setColorPickerOpen(false); setSelectedIds(new Set()); },
    onError: (err: Error) => toast({ title: t('Error'), description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      for (const id of Array.from(selectedIds)) await supabaseService.deleteTag(id);
    },
    onSuccess: () => {
      toast({ title: `${selectedIds.size} ${t('tag')}${selectedIds.size > 1 ? t('s') : ''} ${t('deleted')}` });
      invalidate();
      setSelectedIds(new Set());
      setDeleteOpen(false);
    },
    onError: (err: Error) => toast({ title: t('Error'), description: err.message, variant: 'destructive' }),
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!survivorId) return;
      const sources = selectedTags.filter(t => t.id !== survivorId);
      for (const t of sources) await supabaseService.mergeTag(t.id, survivorId);
    },
    onSuccess: () => {
      toast({ title: t('Tags merged') });
      invalidate();
      setSelectedIds(new Set());
      setMergeOpen(false);
    },
    onError: (err: Error) => toast({ title: t('Error'), description: err.message, variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: () => supabaseService.createTag(newName.trim(), newColor),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setNewName('');
      setNewColor('#3B82F6');
    },
    onError: (err: Error) => toast({ title: t('Error'), description: tagErrorMessage(err), variant: 'destructive' }),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      supabaseService.updateTag(id, { archived }),
    onSuccess: (_, { archived }) => {
      toast({ title: archived ? t('Tag archived') : t('Tag restored') });
      invalidate();
    },
    onError: (err: Error) => toast({ title: t('Error'), description: err.message, variant: 'destructive' }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(sorted.map(t => t.id)));

  const startEditing = (tag: Tag) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    const original = tags.find(t => t.id === editingId)?.name;
    if (!trimmed || trimmed === original) { setEditingId(null); return; }
    renameMutation.mutate({ id: editingId, name: trimmed });
  };

  const openMerge = () => {
    setSurvivorId(selectedTags[0]?.id ?? null);
    setMergeOpen(true);
  };

  const startCreating = () => {
    setCreating(true);
    setTimeout(() => newInputRef.current?.focus(), 0);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder={t('Search tags…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-0 max-w-xs"
        />

        {selectedIds.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.size} {t('selected')}</span>

            {/* Color */}
            <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  {t('Color')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2">
                <p className="text-xs text-muted-foreground mb-2">{t('Apply color to {{count}} tag{{plural}}', { count: selectedIds.size, plural: selectedIds.size > 1 ? 's' : '' })}</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {TAG_COLORS.map(c => (
                    <button
                      key={c}
                      className={cn('w-6 h-6 rounded-full transition-transform', bulkColor === c && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
                      style={{ backgroundColor: c }}
                      onClick={() => setBulkColor(c)}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full h-7"
                  disabled={bulkColorMutation.isPending}
                  onClick={() => bulkColorMutation.mutate(bulkColor)}
                >
                  {bulkColorMutation.isPending ? t('Applying…') : t('Apply')}
                </Button>
              </PopoverContent>
            </Popover>

            {/* Merge */}
            {selectedIds.size >= 2 && (
              <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={openMerge}>
                <GitMerge className="h-3.5 w-3.5" />
                {t('Merge {{count}}', { count: selectedIds.size })}
              </Button>
            )}

            {/* Delete */}
            <Button size="sm" variant="outline" className="flex items-center gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('Delete {{count}}', { count: selectedIds.size })}
            </Button>
          </>
        )}

        <Button size="sm" className="ml-auto flex items-center gap-1.5" onClick={startCreating} disabled={creating}>
          <Plus className="h-4 w-4" />
          {t('New Tag')}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
        </div>
      ) : (
        <>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col />
              <col className="hidden md:table-column" style={{ width: 120 }} />
              <col className="hidden md:table-column" style={{ width: 140 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t('Select all')}
                  />
                </th>
                <th className="px-1 py-2 w-8" />
                <th className="px-3 py-2 text-left font-medium">
                  <button className="flex items-center hover:text-foreground" onClick={() => toggleSort('name')}>
                    {t('Name')} <SortIcon field="name" active={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-right font-medium">
                  <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleSort('count')}>
                    {t('Transactions')} <SortIcon field="count" active={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-right font-medium">
                  <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleSort('total')}>
                    {t('Total')} <SortIcon field="total" active={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="px-1 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">

              {/* Inline create row */}
              {creating && (
                <tr className="bg-blue-50/40 dark:bg-blue-900/10">
                  <td className="px-3 py-1.5" />
                  <td className="px-1 py-1.5">
                    <ColorDot color={newColor} onChange={setNewColor} />
                  </td>
                  <td className="px-3 py-1.5" colSpan={4}>
                    <div className="flex items-center gap-2">
                      <input
                        ref={newInputRef}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newName.trim()) createMutation.mutate();
                          if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                        }}
                        placeholder={t('Tag name')}
                        className="text-sm px-2 py-1 rounded border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-transparent flex-1 min-w-0"
                      />
                      <Button
                        size="sm"
                        className="h-7 shrink-0"
                        disabled={!newName.trim() || createMutation.isPending}
                        onClick={() => createMutation.mutate()}
                      >
                        {createMutation.isPending ? t('Creating…') : t('Create')}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => { setCreating(false); setNewName(''); }}>
                        {t('Cancel')}
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {sorted.length === 0 && !creating && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    {search ? t('No tags match your search.') : t('No tags yet.')}
                  </td>
                </tr>
              )}

              {sorted.map(tag => (
                <tr
                  key={tag.id}
                  className={cn('hover:bg-muted/30 transition-colors', selectedIds.has(tag.id) && 'bg-muted/50')}
                >
                  <td className="px-3 py-1.5">
                    <Checkbox checked={selectedIds.has(tag.id)} onCheckedChange={() => toggleSelect(tag.id)} />
                  </td>

                  <td className="px-1 py-1.5">
                    <ColorDot
                      color={tag.color}
                      onChange={c => colorMutation.mutate({ id: tag.id, color: c })}
                    />
                  </td>

                  <td className="px-3 py-1.5 truncate">
                    {editingId === tag.id ? (
                      <Input
                        ref={editInputRef}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        className="h-7 text-sm"
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0 group/name">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span
                            className="cursor-pointer hover:underline truncate"
                            onClick={() => setDetailTagId(tag.id)}
                          >
                            {tag.name}
                          </span>
                          {/* stats inline on mobile only */}
                          <span className="md:hidden text-xs text-muted-foreground tabular-nums">
                            {stats[tag.id]?.count
                              ? `${stats[tag.id].count} txn${stats[tag.id].count !== 1 ? 's' : ''} · ${formatCurrency(stats[tag.id].total, currency, 0)}`
                              : '—'}
                          </span>
                        </div>
                        <button
                          className="opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted shrink-0"
                          onClick={e => { e.stopPropagation(); startEditing(tag); }}
                          title={t('Rename')}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="hidden md:table-cell px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {stats[tag.id]?.count ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>

                  <td className="hidden md:table-cell px-3 py-1.5 text-right tabular-nums">
                    {stats[tag.id]?.total
                      ? <span className="font-medium">{formatCurrency(stats[tag.id].total, currency, 0)}</span>
                      : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>

                  <td className="px-1 py-1.5">
                    <button
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={tag.archived ? t('Restore') : t('Archive')}
                      onClick={() => archiveMutation.mutate({ id: tag.id, archived: !tag.archived })}
                    >
                      {tag.archived
                        ? <ArchiveRestore className="h-3.5 w-3.5" />
                        : <Archive className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          {tags.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {sorted.length === (showArchived ? tags.filter(t => t.archived) : tags.filter(t => !t.archived)).length
                ? `${sorted.length} ${t('tag')}${sorted.length !== 1 ? t('s') : ''}`
                : `${sorted.length} ${t('matching')}`}
            </span>
          ) : (
            <span />
          )}
          {tags.some(t => t.archived) && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              onClick={() => setShowArchived(v => !v)}
            >
              {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {showArchived ? t('Hide archived') : t('Show archived')}
            </button>
          )}
        </div>
        </>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete {{count}} tag{{plural}}?', { count: selectedIds.size, plural: selectedIds.size > 1 ? 's' : '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedTxnCount > 0
                ? t('{{count}} transaction{{plural}} will have its tag removed.', { count: affectedTxnCount, plural: affectedTxnCount === 1 ? '' : 's' })
                : t('No transactions will be affected.')}
              {' '}{t('This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('Deleting…') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tag detail sheet */}
      {(() => {
        const detailTag = tags.find(t => t.id === detailTagId);
        return detailTag ? (
          <TagDetail
            tagId={detailTagId}
            tagName={detailTag.name}
            tagColor={detailTag.color}
            onClose={() => setDetailTagId(null)}
          />
        ) : null;
      })()}

      {/* Merge dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Merge tags')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('Choose which name to keep. All transactions will be moved to the surviving tag.')}
          </p>
          <RadioGroup
            value={survivorId?.toString() ?? ''}
            onValueChange={v => setSurvivorId(Number(v))}
            className="gap-3 pt-1"
          >
            {selectedTags.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <RadioGroupItem value={t.id.toString()} id={`survivor-${t.id}`} />
                <Label htmlFor={`survivor-${t.id}`} className="font-normal cursor-pointer flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                  <span className="text-muted-foreground text-xs">
                    ({stats[t.id]?.count ?? 0} transaction{(stats[t.id]?.count ?? 0) !== 1 ? 's' : ''})
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>{t('Cancel')}</Button>
            <Button
              disabled={!survivorId || mergeMutation.isPending}
              onClick={() => mergeMutation.mutate()}
            >
              {mergeMutation.isPending ? t('Merging…') : t('Merge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default TagList;
