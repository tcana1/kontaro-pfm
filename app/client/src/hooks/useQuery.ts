import { useQuery } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
export function useServiceQuery<T>(
  tableName: string,
  filters: Record<string, any> = {},
  options: {
    limit?: number;
    offset?: number;
    orderBy?: {
      column: string;
      ascending?: boolean;
    };
  } = {}
) {
  return useQuery({
    queryKey: [tableName, filters, options],
    queryFn: async () => {
      switch (tableName) {
        case 'accounts':
          return supabaseService.getAccounts();
        case 'categories':
          return supabaseService.getCategories();
        case 'category_groups':
          return supabaseService.getCategoryGroups();
        case 'transactions':
          return supabaseService.getTransactions(options);
        case 'settings':
          return supabaseService.getSettings();
        case 'expense_breakdown':
          return supabaseService.getExpenseBreakdown(options);
        case 'category_breakdown':
          return supabaseService.getCategoryBreakdown(options);
        case 'categorization_rules':
          return supabaseService.getCategorizationRules();
        default:
          throw new Error(`Unknown table name: ${tableName}`);
      }
    },
  });
}
