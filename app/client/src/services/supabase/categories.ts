import { supabase } from '../../lib/supabase';
import type { Json } from '../../lib/database.types';
import { requireUser } from './auth';

const RULE_WITH_CATEGORY = `
        *,
        categories!categorization_rules_category_id_fkey(
          id,
          name,
          color,
          category_groups(id, name, emoji)
        )
      `;

export async function getCategories() {
  const { data, error } = await supabase.from('categories').select('*, category_groups(*)');
  if (error) throw error;
  return data;
}

export async function getCategoryGroups() {
  const { data, error } = await supabase.from('category_groups').select('*');
  if (error) throw error;
  return data;
}

export async function getCategoryTransactionCount(categoryId: number): Promise<number> {
  const { count, error } = await supabase
    .from('transaction_splits')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (error) {
    console.error('Error fetching category transaction count:', error);
    throw error;
  }
  return count || 0;
}

export async function getCategoryGroupCategoryCount(groupId: number): Promise<number> {
  if (!groupId || typeof groupId !== 'number') {
    return 0;
  }

  const { count, error } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) {
    console.error('Error fetching category group category count:', error);
    throw error;
  }
  return count || 0;
}

export async function getCategoryGroupTransactionCount(groupId: number): Promise<number> {
  if (!groupId || typeof groupId !== 'number') {
    return 0;
  }

  const { data: categoriesInGroup, error: categoriesError } = await supabase
    .from('categories')
    .select('id')
    .eq('group_id', groupId);

  if (categoriesError) {
    console.error('Error fetching categories in group:', categoriesError);
    throw categoriesError;
  }

  if (!categoriesInGroup || categoriesInGroup.length === 0) {
    return 0;
  }

  const categoryIds = categoriesInGroup.map(cat => cat.id);

  const { count, error } = await supabase
    .from('transaction_splits')
    .select('id', { count: 'exact', head: true })
    .in('category_id', categoryIds);

  if (error) {
    console.error('Error fetching category group transaction count:', error);
    throw error;
  }
  return count || 0;
}

export interface CategoryGroupBatchInput {
  group_id?: number; // add categories into this existing group instead of creating one
  name?: string;
  emoji?: string;
  color?: string;
  is_income?: boolean;
  categories: { name: string; color: string }[];
}

export async function createCategoryGroupsAndCategories(groups: CategoryGroupBatchInput[]): Promise<void> {
  // Cast through Json: the jsonb RPC arg is typed as Json, which a structured
  // interface array does not satisfy without an index signature.
  const { error } = await supabase.rpc('create_category_groups_and_categories', {
    p_groups: groups as unknown as Json,
  });

  if (error) {
    console.error('Error creating category groups and categories:', error);
    throw error;
  }
}

export async function deleteCategoryWithMove(itemId: number, targetCategoryId: number, isCategory: boolean): Promise<void> {
  const { error } = await supabase.rpc(
    isCategory ? 'delete_category_and_move_transactions' : 'delete_category_group_and_move_transactions',
    {
      p_item_id: itemId,
      p_target_category_id: targetCategoryId,
    }
  );

  if (error) {
    console.error('Error deleting category/group with move:', error);
    throw error;
  }
}

export async function deleteCategoryWithTransactions(itemId: number, isCategory: boolean): Promise<void> {
  const { error } = await supabase.rpc(
    isCategory ? 'delete_category_and_transactions' : 'delete_category_group_and_transactions',
    {
      p_item_id: itemId,
    }
  );

  if (error) {
    console.error('Error deleting category/group with transactions:', error);
    throw error;
  }
}

export async function getCategorizationRules() {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select(RULE_WITH_CATEGORY)
    .order('payee_keyword');

  if (error) throw error;
  return data;
}

export async function createCategorizationRule(data: { payee_keyword: string; category_id: number }) {
  const user = await requireUser();

  const ruleData = {
    ...data,
    user_id: user.id
  };

  const { data: result, error } = await supabase
    .from('categorization_rules')
    .insert(ruleData)
    .select(RULE_WITH_CATEGORY)
    .single();

  if (error) throw error;
  return result;
}

export async function updateCategorizationRule(id: number, data: { payee_keyword?: string; category_id?: number }) {
  const { data: result, error } = await supabase
    .from('categorization_rules')
    .update(data)
    .eq('id', id)
    .select(RULE_WITH_CATEGORY)
    .single();

  if (error) throw error;
  return result;
}

export async function deleteCategorizationRule(id: number) {
  const { error } = await supabase
    .from('categorization_rules')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}
