
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { useMobileHeader } from "@/contexts/mobile-header-context";
import { useServiceQuery } from "@/hooks/useQuery";
import type { Category, CategoryGroup } from "@shared/schema";
import { Plus, Pencil as PencilIcon, DollarSign, Settings, FolderPlus, Sparkles, History, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import CategoryForm from "./category-form";
import CategoryGroupForm from "./category-group-form";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";

interface GroupedCategories {
  [groupId: number]: CategoryGroup & {
    categories: Category[];
  };
}

const COLLAPSED_GROUPS_KEY = 'categories-collapsed-groups';

const getInitialCollapsedGroups = (): Set<number> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : []);
  } catch {
    return new Set();
  }
};

export default function CategoryList() {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(getInitialCollapsedGroups);

  const updateCollapsedGroups = (next: Set<number>) => {
    setCollapsedGroups(next);
    try { localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next])); } catch {}
  };

  const toggleGroup = (groupId: number, open: boolean) => {
    const next = new Set(collapsedGroups);
    if (open) next.delete(groupId); else next.add(groupId);
    updateCollapsedGroups(next);
  };
  const [, setLocation] = useLocation();
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);

  useMobileHeader(() => (
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('Categories')}</span>
  ), []);
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);
  const { data: fetchedCategories, isLoading, error } = useServiceQuery<Category[]>("categories");
  const { data: fetchedCategoryGroups, error: groupsError } = useServiceQuery<CategoryGroup[]>("category_groups");
  const { data: categorizationRules } = useServiceQuery("categorization_rules");

  // Filter out system categories and groups (id <= -2) and "Uncategorized" (id: 0)
  const categories = (fetchedCategories as Category[] | undefined)?.filter((cat: Category) => cat.id !== 0) || [];
  const categoryGroups = ((fetchedCategoryGroups as CategoryGroup[] | undefined)?.filter((group: CategoryGroup) => group.id !== 0 && group.id > -2) || [])
    .sort((a: CategoryGroup, b: CategoryGroup) => {
      // Income groups first, then alphabetical
      // Note: database field is is_income (snake_case), not isIncome (camelCase)
      if (a.is_income && !b.is_income) return -1;
      if (!a.is_income && b.is_income) return 1;
      return a.name.localeCompare(b.name);
    });

  const openCategoryModal = (category: Category) => {
    setSelectedCategory(category);
    setIsCategoryFormOpen(true);
  };

  const openGroupModal = (group: CategoryGroup | null = null) => {
    setSelectedGroup(group);
    setIsGroupFormOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryFormOpen(false);
    setSelectedCategory(null);
  };

  const closeGroupModal = () => {
    setIsGroupFormOpen(false);
    setSelectedGroup(null);
  };

  const [activeAddCategoryGroupId, setActiveAddCategoryGroupId] = useState<number | null>(null);

  const handleAddCategoryClick = (groupId: number) => {
    if (collapsedGroups.has(groupId)) toggleGroup(groupId, true);
    // If the same group's add form is already open, close it. Otherwise, open it.
    setActiveAddCategoryGroupId(prevId => {
      const newId = prevId === groupId ? null : groupId;
      return newId;
    });
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        {t('Loading categories...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4">
        {t('Error loading categories:')} {error.message}
      </div>
    );
  }

  // Group categories by their groups, ensuring all groups are present
  const groupedCategories = (categoryGroups as CategoryGroup[]).reduce<GroupedCategories>(
    (acc: GroupedCategories, group: CategoryGroup) => {
      acc[group.id] = {
        ...group,
        categories: [],
      };
      return acc;
    },
    {},
  );

  (categories as Category[]).forEach((category: Category) => {
    const group = groupedCategories[category.group_id];
    if (group) {
      group.categories.push(category);
      group.categories.sort((a: Category, b: Category) => a.name.localeCompare(b.name));
    }
  });

  // System rows (id <= 0, e.g. Reconciliation, Starting Balance, Transfer/Payment)
  // always exist for every user — only user-owned categories or groups (id > 0)
  // count towards "this user hasn't set anything up yet".
  const hasOwnCategories = categories.some((cat: Category) => cat.id > 0) ||
    categoryGroups.some((g: CategoryGroup) => g.id > 0);

  const allCollapsed = categoryGroups.length > 0 && categoryGroups.every((g: CategoryGroup) => collapsedGroups.has(g.id));

  const emptyStateCards = [
    {
      icon: FolderPlus,
      title: t('Create your first category'),
      description: t('Set up your own groups and categories, organized your way.'),
      onClick: () => openGroupModal(),
      disabled: false,
    },
    {
      icon: Sparkles,
      title: t('Use our starter set'),
      description: t('Start from a ready-made set of common groups and categories, then tweak it as needed.'),
      onClick: () => setLocation('/categories/setup'),
      disabled: false,
    },
  ] as const;

  const mainContent = !hasOwnCategories ? (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-4xl w-full space-y-8 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {t('Set up your categories')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("You don't have any categories yet. Here's how to get started:")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {emptyStateCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.onClick}
              disabled={card.disabled}
              className="group text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm hover:border-primary hover:shadow-md transition-all disabled:opacity-60 disabled:pointer-events-none"
            >
              <card.icon className="h-6 w-6 text-primary mb-3" />
              <p className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
                {card.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.description}
              </p>
            </button>
          ))}

          <Link
            href="/settings?tab=history"
            className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm hover:border-primary hover:shadow-md transition-all"
          >
            <History className="h-6 w-6 text-primary mb-3" />
            <p className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
              {t('Import a categorized history')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Upload an Excel file that already has categories — we\'ll bring them in for you.')}
            </p>
          </Link>
        </div>
      </div>
    </div>
  ) : (
    <div className="h-full min-h-[calc(100vh-4rem)] space-y-6">
      <div className="flex justify-between items-center">
        <div className="hidden md:block">
          <h1 className="text-2xl font-semibold">{t('Categories')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Manage your transaction categories')}
          </p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button
            variant="outline"
            className="h-full"
            onClick={() => updateCollapsedGroups(allCollapsed ? new Set() : new Set(categoryGroups.map((g: CategoryGroup) => g.id)))}
          >
            {allCollapsed ? <ChevronsUpDown className="w-4 h-4 sm:mr-2" /> : <ChevronsDownUp className="w-4 h-4 sm:mr-2" />}
            <span className="hidden sm:inline">{allCollapsed ? t('Expand all') : t('Collapse all')}</span>
          </Button>
          <Link href="/categories/rules">
            <Button variant="outline" className="h-full">
              <Settings className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('Rules')}</span>
              {categorizationRules && categorizationRules.length > 0 ? ` (${categorizationRules.length})` : ''}
            </Button>
          </Link>
          <Button onClick={() => openGroupModal()} className="h-full">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('Add ')} </span>{t('Group')}
          </Button>
        </div>
      </div>

      {categoryGroups.map((group: CategoryGroup) => {
        const isOpen = !collapsedGroups.has(group.id);
        return (
        <Collapsible key={group.id} open={isOpen} onOpenChange={(open) => toggleGroup(group.id, open)} asChild>
        <Card className="overflow-hidden">
          <div
            className={isOpen ? "p-4 border-b" : "p-4"}
            style={{ backgroundColor: (group.color || '#6B7280') + "20" }}
          >
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-left" aria-label={isOpen ? t('Collapse group') : t('Expand group')}>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <span>{group.emoji}</span>
                  {group.name}
                </button>
              </CollapsibleTrigger>
              {!isOpen && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({groupedCategories[group.id].categories.length})
                </span>
              )}
              {group.is_income && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <DollarSign className="w-3 h-3 mr-1" />
                  {t('Income')}
                </span>
              )}
              {/* Only show edit button for non-system groups */}
              {group.id > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openGroupModal(group)}
                  className="h-8 w-8 p-0 ml-2"
                >
                  <span className="sr-only">{t('Edit group')}</span>
                  <PencilIcon className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddCategoryClick(group.id)}
                className="h-8 w-8 p-0 ml-auto"
              >
                <span className="sr-only">{t('Add category to group')}</span>
                <Plus className="h-4 w-4" />
              </Button>
            </h3>
            {isOpen && activeAddCategoryGroupId === group.id && (
              <div className="p-2 border-t">
                <CategoryForm
                  category={{
                    id: 0, // Placeholder for new category
                    name: '',
                    color: '#3B82F6',
                    group_id: group.id,
                    created_at: null,
                    user_id: '',
                  } as Category}
                  onSuccess={() => setActiveAddCategoryGroupId(null)}
                  onCancel={() => setActiveAddCategoryGroupId(null)}
                  isInline={true}
                />
              </div>
            )}
          </div>
          <CollapsibleContent>
          <div className="divide-y">
            {(groupedCategories[group.id].categories || []).map((category: Category) => (
              <div
                key={category.id}
                className="py-2 px-4 flex items-center gap-3"
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: category.color || '#3B82F6' }}
                />
                <span>{category.name}</span>
                <div className="ml-auto flex items-center gap-2">
                  {/* Only show edit button for non-system categories */}
                  {category.id > -1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openCategoryModal(category)}
                      className="h-8 w-8 p-0"
                    >
                      <span className="sr-only">{t('Edit category')}</span>
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </CollapsibleContent>
        </Card>
        </Collapsible>
        );
      })}
    </div>
  );

  return (
    <>
      {mainContent}

      <Dialog open={isCategoryFormOpen} onOpenChange={closeCategoryModal}>
        <DialogContent>
          <DialogTitle>
            {selectedCategory ? t('Edit Category') : t('New Category')}
          </DialogTitle>
          <CategoryForm
            category={selectedCategory}
            onSuccess={closeCategoryModal}
            onCancel={closeCategoryModal}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupFormOpen} onOpenChange={closeGroupModal}>
        <DialogContent>
          <DialogTitle>
            {selectedGroup ? t('Edit Category Group') : t('New Category Group')}
          </DialogTitle>
          <CategoryGroupForm
            group={selectedGroup}
            onSuccess={closeGroupModal}
            onCancel={closeGroupModal}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
