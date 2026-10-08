import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { cn } from '@/lib/utils';
import type { Transaction, Tag as TagType } from '@shared/schema';

interface BatchTagDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  selectedTransactions: Transaction[];
}

const BatchTagDialog: React.FC<BatchTagDialogProps> = ({
  open,
  onClose,
  onApplied,
  selectedTransactions,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tags = [], isLoading } = useServiceQuery<TagType[]>('tags');
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTagColor, setNewTagColor] = useState('#6B7280');

  const filtered = tags.filter(tag =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );
  const canCreate = search.trim().length > 0 && !tags.some(
    tag => tag.name.toLowerCase() === search.trim().toLowerCase()
  );

  const applyTag = async (tagId: number | null) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ids = selectedTransactions.map(txn => txn.id);
      await supabaseService.bulkSetTransactionTag(ids, tagId);
      CacheUtils.invalidateTransactionRelated(queryClient);
      CacheUtils.invalidateTagRelated(queryClient);
      onApplied();
      onClose();
    } finally {
      setIsSubmitting(false);
      setSearch('');
    }
  };

  const createAndApply = async () => {
    if (!search.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tag = await supabaseService.createTag(search.trim(), newTagColor);
      const ids = selectedTransactions.map(txn => txn.id);
      await supabaseService.bulkSetTransactionTag(ids, tag.id);
      CacheUtils.invalidateTransactionRelated(queryClient);
      CacheUtils.invalidateTagRelated(queryClient);
      onApplied();
      onClose();
    } finally {
      setIsSubmitting(false);
      setSearch('');
    }
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {t('Tag {{count}} transaction(s)', { count: selectedTransactions.length })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder={t('Search or create tag...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {isLoading ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">{t('Loading...')}</p>
            ) : filtered.length === 0 && !canCreate ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">{t('No tags found')}</p>
            ) : (
              filtered.map(tag => (
                <button
                  key={tag.id}
                  className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => applyTag(tag.id)}
                  disabled={isSubmitting}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))
            )}

            {/* Inline create */}
            {canCreate && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <div className="flex items-center gap-2 px-2 py-1">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={e => setNewTagColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                    title={t('Tag color')}
                  />
                  <button
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    onClick={createAndApply}
                    disabled={isSubmitting}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('Create "{{name}}"', { name: search.trim() })}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-600 gap-1"
            onClick={() => applyTag(null)}
            disabled={isSubmitting}
          >
            <X className="h-3.5 w-3.5" />
            {t('Clear tags')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClose}>
            {t('Cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchTagDialog;
