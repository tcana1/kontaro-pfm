import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { useToast } from '@/hooks/use-toast';
import type { Tag } from '@shared/schema';
import { tKey } from '@/lib/i18n-keys';

const TAG_COLORS = [
  { value: '#EF4444', label: 'Red' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#10B981', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6B7280', label: 'Gray' },
  { value: '#0EA5E9', label: 'Sky' },
  { value: '#F97316', label: 'Orange' },
  { value: '#14B8A6', label: 'Teal' },
];

const formSchema = z.object({
  name: z.string().min(1, tKey('Tag name is required')),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, tKey('Invalid HEX color code')),
});

interface TagFormProps {
  tag?: Tag | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const TagForm: React.FC<TagFormProps> = ({ tag, onSuccess, onCancel }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = !!tag;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name:  tag?.name  ?? '',
      color: tag?.color ?? '#3B82F6',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (isEditing && tag) {
        await supabaseService.updateTag(tag.id, values);
      } else {
        await supabaseService.createTag(values.name, values.color);
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? t('Tag updated') : t('Tag created') });
      CacheUtils.invalidateTagRelated(queryClient);
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: t('Error'), description: err.message, variant: 'destructive' });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('Trip NY')} autoFocus />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Color')}</FormLabel>
              <div className="flex items-center gap-3">
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      className={`w-6 h-6 rounded-full transition-transform ${field.value === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                      onClick={() => field.onChange(c.value)}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={field.value}
                  onChange={e => field.onChange(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                  title={t('Custom color')}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending}>
            {mutation.isPending ? t('Saving...') : isEditing ? t('Save') : t('Create')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default TagForm;
