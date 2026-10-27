import { useQuery } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';

interface QueryOptions {
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  locale?: string;
  rawQuery?: boolean;
  queryParams?: Record<string, any>;
  options?: {
    transformResponse?: (data: any) => any;
  };
}

export function buildServiceQueryKey(key: string | (string | number)[], options: QueryOptions = {}) {
  if (!Array.isArray(key)) return [key, options];
  return options.queryParams ? [...key, options.queryParams] : key;
}

export function useServiceQuery<T = any>(key: string | (string | number)[], options: QueryOptions = {}) {
  const { rawQuery, queryParams, ...restOptions } = options;

  return useQuery<T>({
    queryKey: buildServiceQueryKey(key, options),
    queryFn: async () => {
      if (rawQuery) {
        const data = await supabaseService.rpc(Array.isArray(key) ? key[0] as string : key, queryParams ?? {});
        if (options.options?.transformResponse) {
          return options.options.transformResponse(data);
        }
        return data;
      }

      switch (Array.isArray(key) ? key[0] : key) {
        case 'transactions':
          return supabaseService.getTransactions(restOptions);
        case 'accounts':
          return supabaseService.getAccounts();
        case 'expense-breakdown':
          return supabaseService.getExpenseBreakdown(restOptions);
        case 'category-breakdown':
          return supabaseService.getCategoryBreakdown(restOptions);
        case 'categories':
          return supabaseService.getCategories();
        case 'category_groups':
          return supabaseService.getCategoryGroups();
        case 'settings':
          return supabaseService.getSettings();
        case 'categoryTransactionCount':
          return supabaseService.getCategoryTransactionCount(key[1] as number);
        case 'categoryGroupTransactionCount':
          return supabaseService.getCategoryGroupTransactionCount(key[1] as number);
        case 'categoryGroupCategoryCount':
          return supabaseService.getCategoryGroupCategoryCount(key[1] as number);
        case 'tags':
          return supabaseService.getTags();
        case 'tagTransactionCount':
          return supabaseService.getTagTransactionCount(key[1] as number);
        default:
          throw new Error(`Unknown query key: ${Array.isArray(key) ? key[0] : key}`);
      }
    },
  });
}
