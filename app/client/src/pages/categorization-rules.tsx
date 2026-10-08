import React, { useState, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { useServiceQuery } from "@/hooks/useQuery";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseService } from "@/services/supabase-service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import CategorySelect from "@/components/transactions/inline-form-fields/category-select";
import { useToast } from "@/hooks/use-toast";
import { CacheUtils } from '@/lib/cacheUtils';

interface CategorizationRule {
  id: number;
  payee_keyword: string;
  category_id: number;
  user_id: string;
  categories: {
    id: number;
    name: string;
    color: string;
    category_groups: {
      id: number;
      name: string;
      emoji: string;
    };
  };
}

interface GroupedRules {
  [categoryGroupName: string]: {
    groupInfo: {
      id: number;
      name: string;
      emoji: string;
    };
    rules: CategorizationRule[];
  };
}

export default function CategorizationRules() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [newRule, setNewRule] = useState({ payee_keyword: "", category_id: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createButtonRef = React.useRef<HTMLButtonElement>(null);

  const { data: rules, isLoading, error } = useServiceQuery<CategorizationRule[]>("categorization_rules");
  
  const createRuleMutation = useMutation({
    mutationFn: (data: { payee_keyword: string; category_id: number }) => 
      supabaseService.createCategorizationRule(data),
    onSuccess: () => {
      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategorizationRules(queryClient);
      setIsAddDialogOpen(false);
      setNewRule({ payee_keyword: "", category_id: "" });
      toast({ title: t('Rule created successfully') });
    },
    onError: (error: Error) => {
      toast({ title: t('Failed to create rule'), description: error.message, variant: "destructive" });
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { payee_keyword?: string; category_id?: number } }) => 
      supabaseService.updateCategorizationRule(id, data),
    onSuccess: () => {
      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategorizationRules(queryClient);
      setEditingRule(null);
      toast({ title: t('Rule updated successfully') });
    },
    onError: (error: Error) => {
      toast({ title: t('Failed to update rule'), description: error.message, variant: "destructive" });
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => supabaseService.deleteCategorizationRule(id),
    onSuccess: () => {
      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateCategorizationRules(queryClient);
      toast({ title: t('Rule deleted successfully') });
    },
    onError: (error: Error) => {
      toast({ title: t('Failed to delete rule'), description: error.message, variant: "destructive" });
    }
  });

  const filteredRules = useMemo<CategorizationRule[]>(() => {
    if (!rules || !searchTerm.trim()) return rules || [];
    return rules.filter((rule: CategorizationRule) =>
      rule.payee_keyword.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rules, searchTerm]);

  const groupedRules = useMemo<GroupedRules>(() => {
    if (!filteredRules) return {} as GroupedRules;

    return filteredRules.reduce<GroupedRules>((acc, rule: CategorizationRule) => {
      const groupName = rule.categories.category_groups.name;
      if (!acc[groupName]) {
        acc[groupName] = {
          groupInfo: rule.categories.category_groups,
          rules: []
        };
      }
      acc[groupName].rules.push(rule);
      return acc;
    }, {});
  }, [filteredRules]);

  const handleCreateRule = () => {
    if (!newRule.payee_keyword.trim() || !newRule.category_id) {
      toast({ title: t('Please fill in all fields'), variant: "destructive" });
      return;
    }
    createRuleMutation.mutate({
      payee_keyword: newRule.payee_keyword.trim(),
      category_id: parseInt(newRule.category_id)
    });
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;
    updateRuleMutation.mutate({
      id: editingRule.id,
      data: {
        payee_keyword: editingRule.payee_keyword.trim(),
        category_id: editingRule.category_id
      }
    });
  };

  const handleDeleteRule = (ruleId: number) => {
    if (confirm(t('Are you sure you want to delete this rule?'))) {
      deleteRuleMutation.mutate(ruleId);
    }
  };

  const handleCategorySelected = () => {
    // Focus the Create button after category selection
    setTimeout(() => {
      createButtonRef.current?.focus();
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        {t('Loading categorization rules...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4">
        {t('Error loading categorization rules: {{message}}', { message: error.message })}
      </div>
    );
  }

  return (
    <div className="h-full min-h-[calc(100vh-4rem)] space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{t('Categorization Rules')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Manage automatic transaction categorization based on payee keywords')}
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('Add Rule')}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder={t('Search keywords...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {Object.keys(groupedRules).length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          {searchTerm ? t('No rules match your search.') : t('No categorization rules found. Create your first rule to get started.')}
        </Card>
      ) : (
        Object.entries(groupedRules).map(([groupName, group]: [string, GroupedRules[string]]) => (
          <Card key={groupName} className="overflow-hidden">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-800">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span>{group.groupInfo.emoji}</span>
                {groupName}
                <span className="text-sm text-gray-500">({t('{{count}} rules', { count: group.rules.length })})</span>
              </h3>
            </div>
            <div className="divide-y">
              {group.rules.map((rule: CategorizationRule) => (
                <div key={rule.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: rule.categories.color }}
                    />
                    <div>
                      <span className="font-medium">"{rule.payee_keyword}"</span>
                      <span className="text-gray-500 mx-2">→</span>
                      <span>{rule.categories.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingRule(rule)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {/* Add Rule Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Add Categorization Rule')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('Payee Keyword')}</label>
              <Input
                placeholder={t("e.g., Uber, McDonald's, Starbucks")}
                value={newRule.payee_keyword}
                onChange={(e) => setNewRule(prev => ({ ...prev, payee_keyword: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Category')}</label>
              <CategorySelect
                value={newRule.category_id}
                onChange={(value) => setNewRule(prev => ({ ...prev, category_id: value }))}
                size="default"
                openOnFocus={true}
                onSelectionComplete={handleCategorySelected}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button
                ref={createButtonRef}
                onClick={handleCreateRule}
                disabled={createRuleMutation.isPending}
              >
                {createRuleMutation.isPending ? t('Creating...') : t('Create Rule')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Edit Categorization Rule')}</DialogTitle>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('Payee Keyword')}</label>
                <Input
                  value={editingRule.payee_keyword}
                  onChange={(e) => setEditingRule(prev => prev ? { ...prev, payee_keyword: e.target.value } : null)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('Category')}</label>
                <CategorySelect
                  value={editingRule.category_id.toString()}
                  onChange={(value) => setEditingRule(prev => prev ? { ...prev, category_id: parseInt(value) } : null)}
                  size="default"
                  openOnFocus={true}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingRule(null)}>
                  {t('Cancel')}
                </Button>
                <Button
                  onClick={handleUpdateRule}
                  disabled={updateRuleMutation.isPending}
                >
                  {updateRuleMutation.isPending ? t('Updating...') : t('Update Rule')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}