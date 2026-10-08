import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, Plus, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import type { Tag } from '@shared/schema';

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6B7280', '#0EA5E9', '#F97316', '#14B8A6',
];

interface Props {
  transactionId: number | null;
  currentTagId: number | null;
  onClose: () => void;
}

const MobileTagSheet: React.FC<Props> = ({ transactionId, currentTagId, onClose }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [localTagId, setLocalTagId] = useState<number | null>(currentTagId);
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');

  const queryClient = useQueryClient();
  const { data: tags = [] } = useServiceQuery<Tag[]>('tags');

  useEffect(() => {
    setOpen(transactionId !== null);
    setLocalTagId(currentTagId);
    setCreating(false);
    setNewTagName('');
  }, [transactionId, currentTagId]);

  const setTagMutation = useMutation({
    mutationFn: ({ txId, tagId }: { txId: number; tagId: number | null }) =>
      supabaseService.setTransactionTag(txId, tagId),
    onSuccess: (_, { tagId }) => {
      setLocalTagId(tagId);
      CacheUtils.invalidateTransactionRelated(queryClient);
      CacheUtils.invalidateTagRelated(queryClient);
    },
    onError: (err) => {
      console.error('[MobileTagSheet] setTag error:', err);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async () => supabaseService.createTag(newTagName.trim(), newTagColor),
    onSuccess: async (tag) => {
      CacheUtils.invalidateTagRelated(queryClient);
      if (tag?.id && transactionId) {
        await supabaseService.setTransactionTag(transactionId, tag.id);
        setLocalTagId(tag.id);
        CacheUtils.invalidateTransactionRelated(queryClient);
      }
      setCreating(false);
      setNewTagName('');
      setNewTagColor('#3B82F6');
    },
  });

  return (
    <Sheet open={open} onOpenChange={isOpen => { if (!isOpen) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-xl pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>{t('Tag')}</SheetTitle>
        </SheetHeader>

        <div className="space-y-1">
          {/* Remove option */}
          {localTagId && (
            <button
              className="flex items-center gap-3 w-full px-3 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg"
              onClick={() => setTagMutation.mutate({ txId: transactionId!, tagId: null })}
              disabled={setTagMutation.isPending}
            >
              <X className="h-4 w-4 flex-shrink-0" />
              {t('Remove tag')}
            </button>
          )}

          {/* Tag list */}
          {(tags as Tag[]).map(tag => (
            <button
              key={tag.id}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-3 text-sm rounded-lg hover:bg-accent",
                localTagId === tag.id && "font-medium"
              )}
              onClick={() => {
                const txId = transactionId;
                if (!txId) return;
                setTagMutation.mutate({ txId, tagId: tag.id });
                onClose();
              }}
              disabled={setTagMutation.isPending}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="flex-1 text-left">{tag.name}</span>
              {localTagId === tag.id && <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />}
            </button>
          ))}

          {/* New tag */}
          {!creating ? (
            <button
              className="flex items-center gap-3 w-full px-3 py-3 text-sm text-muted-foreground hover:bg-accent rounded-lg"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              {t('New tag')}
            </button>
          ) : (
            <div className="px-3 py-3 space-y-3 border border-input rounded-lg">
              <input
                autoFocus
                type="text"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTagName.trim()) createTagMutation.mutate();
                  if (e.key === 'Escape') { setCreating(false); setNewTagName(''); }
                }}
                placeholder={t('Tag name')}
                className="w-full text-sm px-3 py-2 rounded-lg border border-input bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex flex-wrap gap-2.5">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={cn("w-6 h-6 rounded-full transition-transform", newTagColor === c && "ring-2 ring-offset-2 ring-gray-400 scale-110")}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 text-sm py-2 rounded-lg border border-input hover:bg-accent text-muted-foreground"
                  onClick={() => { setCreating(false); setNewTagName(''); }}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  disabled={!newTagName.trim() || createTagMutation.isPending}
                  className="flex items-center justify-center gap-1.5 flex-1 text-sm py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  onClick={() => createTagMutation.mutate()}
                >
                  {createTagMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Check className="h-4 w-4" /> {t('Create')}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileTagSheet;
