import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabaseService } from '@/services/supabase-service';
import { useToast } from '@/hooks/use-toast';
import { useServiceQuery } from '@/hooks/useQuery';
import type { Category, CategoryGroup } from '@shared/schema';
import { CacheUtils } from '@/lib/cacheUtils';

interface CategoryDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: Category | CategoryGroup | null;
  itemType: 'category' | 'categoryGroup';
  hasTransactions: boolean;
  transactionCount: number; // Add this prop
  categoryCount?: number; // Only relevant for itemType === 'categoryGroup'
  onDeleteSuccess?: () => void;
}

const CategoryDeleteDialog: React.FC<CategoryDeleteDialogProps> = ({
  isOpen,
  onClose,
  item,
  itemType,
  hasTransactions,
  transactionCount, // Destructure the new prop
  categoryCount = 0,
  onDeleteSuccess,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedOption, setSelectedOption] = useState<'move' | 'delete' | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const [showSecondaryConfirmation, setShowSecondaryConfirmation] = useState(false);

  const isCategory = itemType === 'category';
  // A group can still have empty categories under it even with zero transactions;
  // those would violate the categories_category_group_id_fkey if we tried a plain delete.
  const hasCategoriesOnly = !isCategory && !hasTransactions && categoryCount > 0;
  const dialogTitle = `${t('Delete')} ${isCategory ? t('Category') : t('Category Group')}: ${item?.name}?`;
  const warningMessage = t(
    'This {{itemType}} has {{count}} associated transactions. Please choose how to handle them before proceeding with the deletion.',
    { itemType: isCategory ? t('category') : t('group'), count: transactionCount }
  );
  type RuleRef = { category_id: number; categories?: { category_groups?: { id: number } | null } | null };
  const { data: categorizationRules } = useServiceQuery<RuleRef[]>('categorization_rules');
  const ruleCount = (categorizationRules ?? []).filter((rule: RuleRef) =>
    isCategory ? rule.category_id === item?.id : rule.categories?.category_groups?.id === item?.id
  ).length;
  const rulesWillMove = hasTransactions && selectedOption === 'move';
  const rulesMessage = ruleCount === 0 || (hasTransactions && !selectedOption) ? null : rulesWillMove
    ? t('{{count}} categorization rule(s) linked to this {{itemType}} will be moved to the selected category, or removed if you choose Uncategorized.', { count: ruleCount, itemType: isCategory ? t('category') : t('group') })
    : t('{{count}} categorization rule(s) linked to this {{itemType}} will also be deleted.', { count: ruleCount, itemType: isCategory ? t('category') : t('group') });
  const categoriesOnlyMessage = t(
    'This group has {{count}} associated categories. There are no transactions in this group. This action cannot be undone.',
    { count: categoryCount }
  );



  // Fetch all categories and category groups for the "move to" option
  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => supabaseService.getCategories(),
    enabled: isOpen && hasTransactions && selectedOption === 'move',
  });

  const { data: allCategoryGroups = [] } = useQuery({
    queryKey: ['category_groups'],
    queryFn: () => supabaseService.getCategoryGroups(),
    enabled: isOpen && hasTransactions && selectedOption === 'move',
  });

  // Filter categories for the dropdown: exclude the current category/group's categories
  // Negative ids are system categories (Transfer, Payment, …) that can't hold ordinary spending.
  const availableCategories = allCategories.filter(cat => {
    if (cat.id < 0) return false;
    if (isCategory) {
      return cat.id !== item?.id;
    } else {
      // If deleting a group, exclude all categories belonging to this group
      return cat.group_id !== item?.id;
    }
  });

  // Group categories by category group
  const groupedCategories = React.useMemo(() => {
    const groups: Record<string, Category[]> = {};
    const uncategorizedGroup: Category[] = [];

    // Add Uncategorized (ID 0) if it's not the item being deleted
    const uncategorizedOption = allCategories.find(cat => cat.id === 0);
    if (uncategorizedOption && !(isCategory && item?.id === 0)) {
      uncategorizedGroup.push(uncategorizedOption as unknown as Category);
    }

    availableCategories.forEach(cat => {
      if (cat.id === 0) return; // Skip if it's the uncategorized category, already handled
      const group = allCategoryGroups.find(g => g.id === cat.group_id);
      const groupName = group ? group.name : 'Other'; // Fallback for categories without a group
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(cat as unknown as Category);
    });

    // Sort categories within each group by name
    for (const groupName in groups) {
      groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Sort groups by name, with 'Other' and 'Uncategorized' (if present) at the end
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    const sortedGroups: Record<string, Category[]> = {};
    sortedGroupNames.forEach(name => {
      sortedGroups[name] = groups[name];
    });

    if (uncategorizedGroup.length > 0) {
      sortedGroups['Uncategorized'] = uncategorizedGroup;
    }

    return sortedGroups;
  }, [availableCategories, allCategoryGroups, isCategory, item]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;

      if (hasTransactions) {
        if (selectedOption === 'move') {
          if (!targetCategoryId) {
            throw new Error('Please select a target category to move transactions to.');
          }
          await supabaseService.deleteCategoryWithMove(item.id, parseInt(targetCategoryId), isCategory);
        } else if (selectedOption === 'delete') {
          await supabaseService.deleteCategoryWithTransactions(item.id, isCategory);
        }
      } else if (hasCategoriesOnly) {
        // Group has categories but no transactions: still must go through the RPC
        // so its categories get deleted before the group (FK on category_group_id).
        await supabaseService.deleteCategoryWithTransactions(item.id, false);
      } else {
        // No transactions and no categories, simple delete
        if (isCategory) {
          await supabaseService.delete('categories', item.id);
        } else {
          await supabaseService.delete('category_groups', item.id);
        }
      }
    },
    onSuccess: () => {
      toast({
        title: `${isCategory ? t('Category') : t('Category Group')} ${t('deleted')}`,
        description: `${t('The')} ${isCategory ? t('category') : t('group')} ${t('has been successfully deleted.')}`,
      });
      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategoryRelated(queryClient, true); // includeTransactions = true
      onClose();
      resetState();
      if (onDeleteSuccess) {
        onDeleteSuccess();
      }
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: isCategory ? t('Failed to delete category: {{message}}', { message: error.message }) : t('Failed to delete category group: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
      setShowSecondaryConfirmation(false); // Hide secondary confirmation on error
    },
  });

  const handleDelete = () => {
    if (selectedOption === 'delete') {
      setShowSecondaryConfirmation(true);
    } else {
      deleteMutation.mutate();
    }
  };

  const handleSecondaryConfirm = () => {
    setShowSecondaryConfirmation(false);
    deleteMutation.mutate();
  };

  const resetState = () => {
    setSelectedOption(null);
    setTargetCategoryId('');
    setShowSecondaryConfirmation(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !deleteMutation.isPending) {
      event.preventDefault();
      // Check if we can proceed with the delete
      if (!hasTransactions || (selectedOption && (selectedOption === 'delete' || targetCategoryId))) {
        handleDelete();
      }
    }
  };

  const handleSecondaryKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !deleteMutation.isPending) {
      event.preventDefault();
      handleSecondaryConfirm();
    }
  };

  return (
    <>
      <AlertDialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          onClose();
          resetState();
        }
      }}>
        <AlertDialogContent onKeyDown={handleKeyDown}>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            {hasTransactions && (
              <AlertDialogDescription className="text-red-600 font-semibold">
                {warningMessage}
              </AlertDialogDescription>
            )}
            {hasCategoriesOnly && (
              <AlertDialogDescription>
                {categoriesOnlyMessage}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          {hasTransactions ? (
            <div className="space-y-4">
              <RadioGroup onValueChange={(value: 'move' | 'delete') => setSelectedOption(value)} value={selectedOption || ''}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="move" id="option-move" />
                  <Label htmlFor="option-move">{t('Move associated transactions to an existing category:')}</Label>
                </div>
                {selectedOption === 'move' && (
                  <Select onValueChange={setTargetCategoryId} value={targetCategoryId}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue placeholder={t('Select a category')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedCategories).map(([groupName, categoriesInGroup]) => (
                        <React.Fragment key={groupName}>
                          <p className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                            {groupName}
                          </p>
                          {categoriesInGroup.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id.toString()}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div className="flex items-center space-x-2 mt-4">
                  <RadioGroupItem value="delete" id="option-delete" />
                  <Label htmlFor="option-delete">{t('Permanently delete associated transactions.')}</Label>
                </div>
                {selectedOption === 'delete' && (
                  <p className="text-sm text-red-500 font-medium">
                    {t('Warning: This action is irreversible and will delete {{count}} associated transactions and cannot be undone.', { count: transactionCount })}
                  </p>
                )}
              </RadioGroup>
            </div>
          ) : hasCategoriesOnly ? null : (
            <AlertDialogDescription>
              {t('Are you sure you want to delete "{{name}}"? This action cannot be undone.', { name: item?.name })}
            </AlertDialogDescription>
          )}
          {rulesMessage && (
            <p className="text-sm text-amber-600 dark:text-amber-400">{rulesMessage}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              onClose();
              resetState();
            }}>{t('Cancel')}</AlertDialogCancel>
            <Button
              onClick={handleDelete}
              disabled={deleteMutation.isPending || (hasTransactions && (!selectedOption || (selectedOption === 'move' && !targetCategoryId)))}
              variant="destructive"
            >
              {deleteMutation.isPending ? t('Deleting...') : (hasTransactions ? t('Confirm Delete') : t('Delete'))}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Secondary Confirmation Dialog */}
      <AlertDialog open={showSecondaryConfirmation} onOpenChange={setShowSecondaryConfirmation}>
        <AlertDialogContent onKeyDown={handleSecondaryKeyDown}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you absolutely sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This action will permanently delete all associated transactions. This cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSecondaryConfirmation(false)}>{t('No, Go Back')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSecondaryConfirm} className="bg-red-600 hover:bg-red-700">
              {t('Yes, Delete Permanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CategoryDeleteDialog;
