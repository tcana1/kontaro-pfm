import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { supabaseService } from '@/services/supabase-service';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CategoryGroup } from '@shared/schema';
import CategoryDeleteDialog from './category-delete-dialog';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { CacheUtils } from '@/lib/cacheUtils';
import { tKey } from '@/lib/i18n-keys';

interface CategoryGroupFormProps {
  group?: CategoryGroup | null;
  onSuccess: () => void;
  onCancel: () => void;
  isInline?: boolean;
}

// Common colors for category groups
const groupColors = [
  { value: '#EF4444', label: 'Red' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#10B981', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6B7280', label: 'Gray' },
];

// Form schema with validation
const formSchema = z.object({
  name: z.string().min(1, tKey('Category group name is required')).max(255, tKey('Name cannot exceed 255 characters')),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, tKey('Invalid HEX color code')),
  emoji: z.string().optional(),
  isIncome: z.boolean().default(false),
});

const CategoryGroupForm: React.FC<CategoryGroupFormProps> = ({
  group,
  onSuccess,
  onCancel,
  isInline = false,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const isEditing = !!group;

  const defaultValues = {
    name: group?.name || '',
    color: group?.color || '#6B7280',
    emoji: group?.emoji || '',
    isIncome: group?.is_income || false,
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      // Prevent editing system category groups (ID <= -2)
      if (isEditing && group && group.id <= -2) {
        throw new Error('System category groups cannot be modified');
      }

      const payload = {
        name: values.name,
        color: values.color,
        emoji: values.emoji || null,
        is_income: values.isIncome,
        user_id: user?.id,
      };

      if (isEditing) {
        await supabaseService.update('category_groups', group.id, payload);
      } else {
        await supabaseService.create('category_groups', payload);
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? t('Category group updated') : t('Category group created'),
        description: isEditing
          ? t('The category group has been successfully updated')
          : t('The category group has been successfully created'),
      });

      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategoryRelated(queryClient);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: isEditing ? t('Failed to update category group: {{message}}', { message: error.message }) : t('Failed to create category group: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });

  // State for delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch transaction and category counts for the category group
  const { data: transactionCount = 0 } = useServiceQuery(
    ['categoryGroupTransactionCount', group?.id ?? 0]
  );
  const { data: categoryCount = 0 } = useServiceQuery(
    ['categoryGroupCategoryCount', group?.id ?? 0]
  );


  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleBlur = () => {
    if (isInline) {
      form.handleSubmit(onSubmit)();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isInline && event.key === 'Enter') {
      event.preventDefault();
      form.handleSubmit(onSubmit)();
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={isInline ? "flex items-center space-x-2" : "space-y-4"}
        onKeyDown={handleKeyDown}
      >
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className={isInline ? "flex-grow" : ""}>
              <FormLabel className={isInline ? "sr-only" : ""}>{t('Group Name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('Household Expenses')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Color */}
        {!isInline && (
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group Color')}</FormLabel>
                <div className="flex items-center space-x-2">
                  <Select
                    onValueChange={field.onChange}
                    value={groupColors.find(c => c.value === field.value) ? field.value : 'custom'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select a color')}>
                          <div className="flex items-center">
                            <span
                              className="w-4 h-4 rounded-full mr-2"
                              style={{ backgroundColor: field.value }}
                            ></span>
                            {groupColors.find(c => c.value === field.value)?.label || t('Custom')}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {groupColors.map(color => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center">
                            <span
                              className="w-4 h-4 rounded-full mr-2"
                              style={{ backgroundColor: color.value }}
                            ></span>
                            {color.label}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">{t('Custom')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="#RRGGBB"
                      className="w-32"
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                      }}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Emoji */}
        {!isInline && (
          <FormField
            control={form.control}
            name="emoji"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Emoji (Optional)')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="🏠" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Income Group Switch */}
        {!isInline && (
          <FormField
            control={form.control}
            name="isIncome"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">{t('Income Group')}</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    {t('Categories in this group will be treated as income')}
                  </div>
                </div>
                <FormControl>
                  {isEditing && group?.name === 'Income' ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={true}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('This is the default Income group and cannot be changed')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={false}
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {!isInline && (
          <div className="mt-6 flex space-x-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onCancel}
            >
              {t('Cancel')}
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteClick}
                disabled={mutation.isPending}
              >
                {t('Delete')}
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t('Saving...') : isEditing ? t('Update') : t('Save')}
            </Button>
          </div>
        )}
        {isInline && (
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('Saving...') : t('Save')}
          </Button>
        )}
      </form>
      {isEditing && group && (
        <CategoryDeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          item={group}
          itemType="categoryGroup"
          hasTransactions={transactionCount > 0}
          transactionCount={transactionCount} // Pass the actual count
          categoryCount={categoryCount}
          onDeleteSuccess={onSuccess} // Pass onSuccess to the delete dialog
        />
      )}
    </Form>
  );
};

export default CategoryGroupForm;
