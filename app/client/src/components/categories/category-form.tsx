import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useToast } from '@/hooks/use-toast';
import { supabaseService } from '@/services/supabase-service';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import type { Category, CategoryGroup } from '@shared/schema';
import CategoryDeleteDialog from './category-delete-dialog';
import { CacheUtils } from '@/lib/cacheUtils';
import { tKey } from '@/lib/i18n-keys';

interface CategoryFormProps {
  category?: Category | null;
  onSuccess: () => void;
  onCancel: () => void;
  isInline?: boolean;
}

// Common colors for categories
const categoryColors = [
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
  name: z.string().min(1, tKey('Category name is required')),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, tKey('Invalid HEX color code')),
  groupId: z.string().min(1, tKey('Category group is required')),
});

const CategoryForm: React.FC<CategoryFormProps> = ({
  category,
  onSuccess,
  onCancel,
  isInline = false,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch category groups
  const { data: categoryGroups = [] } = useServiceQuery('category_groups');

  // Dialog title based on mode
  const dialogTitle = category ? t('Edit Category') : t('New Category');

  // Determine if we're editing or creating
  const isEditing = !!category && category.id !== 0;

  // Default form values
  const defaultValues = {
    name: category?.name || '',
    color: category?.color || '#3B82F6',
    groupId: category?.group_id?.toString() || '', // Use snake_case field name from database
  };

  // Setup form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    // Reset form with proper default values when categoryGroups load or category changes
    if (categoryGroups.length > 0) {
      const updatedDefaults = {
        name: category?.name || '',
        color: category?.color || '#3B82F6',
        groupId: category?.group_id?.toString() || '', // Use snake_case field name from database
      };
      form.reset(updatedDefaults);
    }
  }, [categoryGroups, category, form]);

  // Create or update mutation
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      // Prevent editing system categories (ID <= -1)
      if (isEditing && category && category.id <= -1) {
        throw new Error('System categories cannot be modified');
      }

      const payload = {
        name: values.name,
        color: values.color,
        group_id: parseInt(values.groupId),
        user_id: user?.id,
      };

      if (isEditing) {
        await supabaseService.update('categories', category.id, payload);
      } else {
        await supabaseService.create('categories', payload);
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? t('Category updated') : t('Category created'),
        description: isEditing
          ? t('The category has been successfully updated')
          : t('The category has been successfully created'),
      });

      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategoryRelated(queryClient);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: isEditing ? t('Failed to update category: {{message}}', { message: error.message }) : t('Failed to create category: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });

  // State for delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch transaction count for the category
  const { data: transactionCount = 0 } = useServiceQuery(
    ['categoryTransactionCount', category?.id ?? 0]
  );

  // Form submit handler
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
    if (isInline && event.key === 'Escape') {
      event.preventDefault();
      onCancel();
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
              <FormLabel className={isInline ? "sr-only" : ""}>{t('Category Name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('Food & Dining')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Color */}
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem className={isInline ? "w-32" : ""}>
              <FormLabel className={isInline ? "sr-only" : ""}>{t('Category Color')}</FormLabel>
              <div className="flex items-center space-x-2">
                <Select
                  onValueChange={field.onChange}
                  value={categoryColors.find(c => c.value === field.value) ? field.value : 'custom'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select a color')}>
                        <div className="flex items-center">
                          <span
                            className="w-4 h-4 rounded-full mr-2"
                            style={{ backgroundColor: field.value }}
                          ></span>
                          {!isInline && (categoryColors.find(c => c.value === field.value)?.label || t('Custom'))}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categoryColors.map(color => (
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
                {!isInline && (
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
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Group - Only visible if not inline */}
        {!isInline && (
          <FormField
            control={form.control}
            name="groupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Category Group')}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select a group')}>
                        {categoryGroups
                          .filter((group: CategoryGroup) => group.id > 0) // Only show user category groups
                          .find((group: CategoryGroup) => group.id.toString() === field.value)?.name}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categoryGroups
                      .filter((group: CategoryGroup) => group.id > 0) // Only show user category groups, not system ones (ID <= 0)
                      .sort((a: CategoryGroup, b: CategoryGroup) => a.name.localeCompare(b.name)) // Sort alphabetically by name
                      .map((group: CategoryGroup) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
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
            {isEditing && category?.id !== 0 && ( // Only show delete button for existing categories, not "Uncategorized"
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
          <div className="flex items-center space-x-2">
            <Button
              type="submit"
              size="sm"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t('Saving...') : t('Save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0"
            >
              <span className="sr-only">{t('Cancel')}</span>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </form>
      {isEditing && category && (
        <CategoryDeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          item={category}
          itemType="category"
          hasTransactions={transactionCount > 0}
          transactionCount={transactionCount} // Pass the actual count
          onDeleteSuccess={onSuccess} // Pass onSuccess to the delete dialog
        />
      )}
    </Form>
  );
};

export default CategoryForm;
