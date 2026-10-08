import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { useToast } from '@/hooks/use-toast';
import type { Tag } from '@shared/schema';

interface TagDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tag: Tag;
  transactionCount: number;
  onSuccess: () => void;
}

const TagDeleteDialog: React.FC<TagDeleteDialogProps> = ({
  isOpen,
  onClose,
  tag,
  transactionCount,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => supabaseService.deleteTag(tag.id),
    onSuccess: () => {
      toast({ title: t('Tag removed') });
      CacheUtils.invalidateTagRelated(queryClient, true);
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: t('Error'), description: err.message, variant: 'destructive' });
    },
  });

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Remove tag "{{name}}"?', { name: tag.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {transactionCount > 0
              ? t('This tag is associated with {{count}} transaction{{plural}}. It will be removed from all of them.', { count: transactionCount, plural: transactionCount === 1 ? '' : 's' })
              : t('This tag is not associated with any transactions.')}
            {' '}{t('This action cannot be undone.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('Removing...') : t('Remove')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default TagDeleteDialog;
