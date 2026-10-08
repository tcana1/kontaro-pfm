import { QueryClient } from '@tanstack/react-query';

type InvalidationType = 'transactions' | 'account-balances' | 'accounts' | 'payees' | 'categories' | 'category_groups' | 'settings' | 'categorization_rules' | 'tags' | 'aggregates';

// Dashboard/report queries are keyed by their RPC name (get_*), not by a shared prefix.
const isAggregateQuery = (queryKey: readonly unknown[]) =>
  typeof queryKey[0] === 'string' && queryKey[0].startsWith('get_');

class InvalidationManager {
  private static instance: InvalidationManager;
  private pendingInvalidations = new Set<InvalidationType>();
  private pendingAccountSpecific = new Map<number, Set<InvalidationType>>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private queryClient: QueryClient | null = null;
  private readonly DEBOUNCE_MS = 50; // Very short debounce to batch rapid-fire invalidations

  static getInstance(): InvalidationManager {
    if (!InvalidationManager.instance) {
      InvalidationManager.instance = new InvalidationManager();
    }
    return InvalidationManager.instance;
  }

  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  scheduleInvalidation(types: InvalidationType[], accountId?: number) {
    // Add to pending invalidations
    types.forEach(type => {
      if (accountId) {
        if (!this.pendingAccountSpecific.has(accountId)) {
          this.pendingAccountSpecific.set(accountId, new Set());
        }
        this.pendingAccountSpecific.get(accountId)!.add(type);
      } else {
        this.pendingInvalidations.add(type);
      }
    });

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushInvalidations();
    }, this.DEBOUNCE_MS);
  }

  private async flushInvalidations() {
    if (!this.queryClient) {
      console.warn('InvalidationManager: QueryClient not set, skipping invalidation');
      return;
    }

    const promises: Promise<void>[] = [];

    // Handle general invalidations
    this.pendingInvalidations.forEach(type => {
      if (type === 'aggregates') {
        promises.push(this.queryClient!.invalidateQueries({ predicate: (q) => isAggregateQuery(q.queryKey) }));
      } else {
        promises.push(this.queryClient!.invalidateQueries({ queryKey: [type] }));
      }
    });

    // Handle account-specific invalidations
    this.pendingAccountSpecific.forEach((types, accountId) => {
      types.forEach(type => {
        if (type === 'account-balances') {
          promises.push(this.queryClient!.invalidateQueries({ queryKey: ['account-balances', accountId] }));
        }
        // Add other account-specific invalidations here as needed
      });
    });

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('InvalidationManager: Error during cache invalidation:', error);
    }

    // Clear pending invalidations
    this.pendingInvalidations.clear();
    this.pendingAccountSpecific.clear();
    this.debounceTimer = null;
  }

  // Force immediate flush (for critical operations)
  async flushImmediately() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.flushInvalidations();
  }
}

export class CacheUtils {
  // Batched invalidation methods using InvalidationManager
  static invalidateTransactionRelated(queryClient: QueryClient): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    manager.scheduleInvalidation(['transactions', 'account-balances', 'payees', 'aggregates']);
  }

  static invalidateAccountRelated(queryClient: QueryClient, accountId?: number): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    
    if (accountId) {
      // Account-specific invalidations
      manager.scheduleInvalidation(['account-balances'], accountId);
    }
    
    // General account-related invalidations
    manager.scheduleInvalidation(['accounts', 'account-balances']);
  }

  static invalidateCategoryRelated(queryClient: QueryClient, includeTransactions = false): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    
    const types: InvalidationType[] = ['categories', 'category_groups'];
    if (includeTransactions) {
      types.push('transactions');
    }
    
    manager.scheduleInvalidation(types);
  }

  static invalidateSettings(queryClient: QueryClient): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    manager.scheduleInvalidation(['settings']);
  }

  static invalidateTagRelated(queryClient: QueryClient, includeTransactions = false): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    const types: InvalidationType[] = ['tags'];
    if (includeTransactions) {
      types.push('transactions');
    }
    manager.scheduleInvalidation(types);
  }

  static invalidateCategorizationRules(queryClient: QueryClient): void {
    const manager = InvalidationManager.getInstance();
    manager.setQueryClient(queryClient);
    manager.scheduleInvalidation(['categorization_rules']);
  }

  // Legacy immediate invalidation methods for critical operations that need immediate feedback
  static async invalidateTransactionRelatedImmediate(queryClient: QueryClient): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['account-balances'] }),
      queryClient.invalidateQueries({ queryKey: ['payees'] }),
      queryClient.invalidateQueries({ predicate: (q) => isAggregateQuery(q.queryKey) })
    ]);
  }

  static async invalidateAccountRelatedImmediate(queryClient: QueryClient, accountId?: number): Promise<void> {
    const promises = [
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['account-balances'] })
    ];
    
    if (accountId) {
      promises.push(queryClient.invalidateQueries({ queryKey: ['account-balances', accountId] }));
    }
    
    await Promise.all(promises);
  }

  // For the polling scenario in finance-context.tsx
  static async invalidateAllCore(queryClient: QueryClient): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['category-groups'] })
    ]);
  }
}