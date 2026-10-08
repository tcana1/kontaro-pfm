import React, { useState } from "react";
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabaseService } from "@/services/supabase-service";
import { CacheUtils } from "@/lib/cacheUtils";
import { DEFAULT_CATEGORY_GROUPS } from "@/lib/default-categories";
import { useMobileHeader } from "@/contexts/mobile-header-context";

const PALETTE = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'];

interface EditableCategory {
  key: string;
  name: string;
  color: string;
}

interface EditableGroup {
  key: string;
  name: string;
  emoji?: string;
  color: string;
  isIncome?: boolean;
  groupId?: number;
  categories: EditableCategory[];
}

const makeKey = () => Math.random().toString(36).slice(2);

export default function CategorySetup() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useMobileHeader(() => (
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('Review the starter set')}</span>
  ), []);

  const [groups, setGroups] = useState<EditableGroup[]>(() =>
    DEFAULT_CATEGORY_GROUPS.map((group) => ({
      key: group.key,
      name: t(group.name),
      emoji: group.emoji,
      color: group.color,
      isIncome: group.isIncome,
      groupId: group.groupId,
      categories: group.categories.map((category) => ({
        key: category.key,
        name: t(category.name),
        color: category.color,
      })),
    }))
  );

  const goBack = () => setLocation('/categories');

  const updateGroup = (groupKey: string, patch: Partial<EditableGroup>) => {
    setGroups((prev) => prev.map((g) => (g.key === groupKey ? { ...g, ...patch } : g)));
  };

  const updateCategory = (groupKey: string, categoryKey: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key !== groupKey
          ? g
          : { ...g, categories: g.categories.map((c) => (c.key === categoryKey ? { ...c, name } : c)) }
      )
    );
  };

  const removeGroup = (groupKey: string) => {
    setGroups((prev) => prev.filter((g) => g.key !== groupKey));
  };

  const addGroup = () => {
    const color = PALETTE[groups.length % PALETTE.length];
    setGroups((prev) => [
      ...prev,
      {
        key: makeKey(),
        name: '',
        emoji: '',
        color,
        categories: [{ key: makeKey(), name: '', color }],
      },
    ]);
  };

  const addCategory = (groupKey: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key !== groupKey ? g : { ...g, categories: [...g.categories, { key: makeKey(), name: '', color: g.color }] }
      )
    );
  };

  const removeCategory = (groupKey: string, categoryKey: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key !== groupKey ? g : { ...g, categories: g.categories.filter((c) => c.key !== categoryKey) }
      )
    );
  };

  const hasEmptyName = groups.some(
    (g) => (!g.groupId && !g.name.trim()) || g.categories.some((c) => !c.name.trim())
  );
  const hasEmptyGroup = groups.some((g) => g.categories.length === 0);
  const canCreate = groups.length > 0 && !hasEmptyName && !hasEmptyGroup;

  const createMutation = useMutation({
    mutationFn: () =>
      supabaseService.createCategoryGroupsAndCategories(
        groups.map((g) => ({
          group_id: g.groupId,
          name: g.groupId ? undefined : g.name.trim(),
          emoji: g.emoji || undefined,
          color: g.color,
          is_income: g.isIncome,
          categories: g.categories.map((c) => ({ name: c.name.trim(), color: c.color })),
        }))
      ),
    onSuccess: () => {
      toast({
        title: t('Default categories created'),
        description: t('A starter set of groups and categories was added. You can edit or delete any of them.'),
      });
      CacheUtils.invalidateCategoryRelated(queryClient);
      goBack();
    },
    onError: (error: Error) => {
      toast({
        title: t('Error'),
        description: `${t('Failed to create default categories:')} ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="h-full min-h-[calc(100vh-4rem)] space-y-6">
      <div className="flex justify-between items-center">
        <div className="hidden md:block">
          <h1 className="text-2xl font-semibold">{t('Review the starter set')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Edit any name you want before creating them. You can always change or delete these later.')}
          </p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={goBack} disabled={createMutation.isPending}>
            {t('Cancel')}
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !canCreate}>
            {createMutation.isPending ? t('Creating...') : t('Create all')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <Card key={group.key} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {!group.groupId && (
                <Input
                  value={group.emoji || ''}
                  onChange={(e) => updateGroup(group.key, { emoji: e.target.value })}
                  className="h-8 w-12 text-center px-1 flex-shrink-0"
                  placeholder={t('Emoji (Optional)')}
                />
              )}
              {group.groupId ? (
                <span className="font-medium">{group.emoji} {group.name}</span>
              ) : (
                <Input
                  value={group.name}
                  onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                  placeholder={t('New Category Group')}
                  className="h-8 font-medium flex-1"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroup(group.key)}
                className="h-8 w-8 p-0 ml-auto text-red-600 hover:text-red-700"
              >
                <span className="sr-only">{t('Remove group')}</span>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {!group.groupId && (
              <div className="flex items-center gap-1.5">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateGroup(group.key, { color })}
                    className={`w-5 h-5 rounded-full border-2 ${group.color === color ? 'border-gray-900 dark:border-gray-100' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  >
                    <span className="sr-only">{color}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {group.categories.map((category) => (
                <div key={category.key} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                  <Input
                    value={category.name}
                    onChange={(e) => updateCategory(group.key, category.key, e.target.value)}
                    placeholder={t('New Category')}
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCategory(group.key, category.key)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <span className="sr-only">{t('Remove category')}</span>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addCategory(group.key)}
                className="h-8 text-sm justify-start px-2"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('Add category to group')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={addGroup}>
        <Plus className="w-4 h-4 mr-2" />
        {t('Add ')} {t('Group')}
      </Button>
    </div>
  );
}
