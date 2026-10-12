import { ICommand, ICommandWithResult } from "@/lib/commands";
import { supabaseService } from "@/services/supabase-service";
import { QueryClient } from "@tanstack/react-query";
import { sanitizeTransactionForUpdate, sanitizeSplitForUpdate } from '@/utils/transaction-utils';
import { Transaction } from "@shared/schema";
import { CacheUtils } from "@/lib/cacheUtils";
import type { ConvertedLinkedPair } from "@/services/supabase/linked-transactions";

// Fields that sanitizeTransactionForUpdate drops (unsafe for plain updates) but that
// must survive a delete→undo round trip.
const pickRestoreOnlyFields = (tx: Record<string, any>) => {
  const picked: Record<string, any> = {};
  for (const key of ['tag_id', 'statement_identifier', 'import_batch_id']) {
    if (tx[key] != null) picked[key] = tx[key];
  }
  return picked;
};

/**
 * Command to delete a transaction.
 * - execute(): Deletes the transaction from the database.
 * - unexecute(): Restores the transaction by re-creating it.
 */
export class DeleteTransactionCommand implements ICommand {
  private readonly transaction: Transaction;
  private readonly queryClient: QueryClient;
  // Tracks the ID of the transaction re-created by unexecute() (undo). The
  // restored record gets a new DB-generated ID, so execute() (redo) must delete
  // that new ID — not the original one, which no longer exists.
  private restoredId: number | null = null;

  constructor(transaction: Transaction, queryClient: QueryClient) {
    this.transaction = transaction;
    this.queryClient = queryClient;
  }

  public getAffectedIds(): number[] {
    return this.restoredId !== null ? [this.transaction.id, this.restoredId] : [this.transaction.id];
  }

  public async execute(): Promise<void> {
    const idToDelete = this.restoredId ?? this.transaction.id;

    console.log('[DeleteTxCmd] execute — originalId:', this.transaction.id, 'restoredId:', this.restoredId, '→ deleting:', idToDelete);

    // 1. Remove from cache immediately (instant UI feedback).
    // After undo, the cache may hold the transaction under either its original
    // id (if the post-undo refetch hasn't run yet) or the restored id (if it
    // already has). Remove both so the UI updates regardless of timing.
    this.removeTransactionFromCache(this.transaction.id);
    if (this.restoredId !== null) {
      this.removeTransactionFromCache(this.restoredId);
    }

    // 2. Delete from database (awaited so the caller only reports success after
    // the DB confirms; on failure the optimistic cache change is reverted)
    try {
      await supabaseService.delete('transactions', idToDelete);
      this.restoredId = null;
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
      console.log('[DeleteTxCmd] execute — deleted ok, idToDelete:', idToDelete);
    } catch (error) {
      // Failure - restore the transaction to cache and propagate to the caller
      this.addTransactionToCache(this.transaction);
      console.error('DeleteTransactionCommand.execute() - Failed to delete transaction:', error);
      throw error;
    }
  }

  public async unexecute(): Promise<void> {

    // 1. Add transaction back to cache immediately (instant UI feedback)
    this.addTransactionToCache(this.transaction);

    // 2. Create in database in background (don't await)
    // Omit the original ID and splits array as the database will generate new ones.
    const { id, splits, ...restorableData } = this.transaction;

    // Handle splits restoration - use first split data to populate main transaction fields
    if (splits && splits.length > 0) {
      const firstSplit = splits[0];
      if (firstSplit.category_id !== undefined) {
        (restorableData as any).category_id = firstSplit.category_id;
      }
      if (firstSplit.amount !== undefined) {
        restorableData.amount = firstSplit.amount;
      }
      if (firstSplit.observation !== undefined) {
        restorableData.notes = firstSplit.observation ?? undefined;
      }
    }

    const sanitizedData = sanitizeTransactionForUpdate(restorableData);
    Object.assign(sanitizedData, pickRestoreOnlyFields(restorableData));
    // Restore in database (awaited so undo only succeeds after the DB confirms)
    try {
      const restored = await supabaseService.createUniqueTransaction(sanitizedData);
      if (restored?.id) this.restoredId = restored.id;
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      // Failure - remove the transaction from cache since restore failed
      this.removeTransactionFromCache(this.transaction.id);
      console.error('DeleteTransactionCommand.unexecute() - Failed to restore transaction:', error);
      throw error;
    }
  }

  private removeTransactionFromCache(transactionId: number): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((transaction: any) => transaction.id !== transactionId)
        };
      });
    });
  }

  private addTransactionToCache(transaction: Transaction): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: [transaction, ...old.data]
        };
      });
    });
  }
}

/**
 * Command to create a new transaction.
 * - execute(): Creates the transaction and stores its new ID.
 * - unexecute(): Deletes the transaction using the stored ID.
 */
export class CreateTransactionCommand implements ICommandWithResult<Transaction> {
  private readonly transactionData: Omit<Transaction, 'id'>;
  private readonly queryClient: QueryClient;
  private readonly force: boolean;
  private createdTransactionId: number | null = null;
  private readonly optimisticTransactionId: number;

  constructor(transactionData: Omit<Transaction, 'id'>, queryClient: QueryClient, force = false) {
    this.transactionData = transactionData;
    this.queryClient = queryClient;
    this.force = force;
    this.optimisticTransactionId = -Date.now(); // Set once at creation
  }

  public getAffectedIds(): number[] {
    return this.createdTransactionId !== null ? [this.createdTransactionId] : [];
  }

  public async execute(): Promise<Transaction> {
    // Always use optimistic updates for CREATE operations
    const optimisticTransaction = this.createOptimisticTransaction();
    this.addOptimisticTransactionToCache(optimisticTransaction);
    
    try {
      // Make the actual API call
      const newTransaction = await supabaseService.createUniqueTransaction(this.transactionData, this.force);
      if (newTransaction) {
        this.createdTransactionId = newTransaction.id;
        // Replace optimistic transaction with real one
        this.replaceOptimisticWithRealTransaction(optimisticTransaction, newTransaction);
        return newTransaction;
      }
      throw new Error('Failed to create transaction');
    } catch (error) {
      // Remove optimistic transaction on error
      this.removeOptimisticTransaction(optimisticTransaction);
      throw error;
    }
  }

  private createOptimisticTransaction(): any {
    // Get category and account names from cache
    const categoriesData = this.queryClient.getQueryData(['categories']);
    const accountsData = this.queryClient.getQueryData(['accounts']);
    const categoryGroupsData = this.queryClient.getQueryData(['category-groups']);
    
    const categories = (categoriesData as any) || [];
    const accounts = (accountsData as any) || [];
    const categoryGroups = (categoryGroupsData as any) || [];
    
    const txData = this.transactionData as any;
    // Support both camelCase (from the inline form) and snake_case (from imports/undo paths)
    const accountId = txData.account_id ?? txData.accountId;
    const categoryId = txData.category_id ?? txData.categoryId;
    const toAccountId = txData.to_account_id ?? txData.toAccountId;
    const paymentDate = txData.payment_date ?? txData.paymentDate;
    const notes = txData.notes ?? '';

    const category = categories.find((c: any) => c.id === categoryId);
    const account = accounts.find((a: any) => a.id === accountId);
    const categoryGroup = category ? categoryGroups.find((g: any) => g.id === category.group_id) : null;

    return {
      ...this.transactionData,
      transaction_id: this.optimisticTransactionId,
      id: this.optimisticTransactionId,
      user_id: txData.user_id ?? txData.userId,
      payment_date: paymentDate,
      purchase_date: paymentDate,
      amount: this.transactionData.amount.toString(),
      split_id: this.optimisticTransactionId,
      split_amount: this.transactionData.amount,
      category_id: categoryId,
      category_name: category?.name || 'Unknown Category',
      category_group_name: categoryGroup?.name || 'Unknown Group',
      category_group_emoji: categoryGroup?.emoji || '📝',
      // Optimistic is_income derived from the sign of the entered amount — it can
// diverge from the server for 0.00/refund edge cases, but resolves on refetch.
      is_income: Number(this.transactionData.amount) > 0,
      account_name: account?.name || 'Unknown Account',
      account_id: accountId,
      status_name: 'Pending',
      status_id: 1,
      notes: notes,
      split_observation: notes,
      to_account_name: toAccountId ? accounts.find((a: any) => a.id === toAccountId)?.name : null,
      to_account_id: toAccountId,
      installment_number: txData.installment_number ?? txData.installmentNumber ?? null,
      installment_total: txData.installment_total ?? txData.installmentTotal ?? null,
      is_installment: txData.is_installment ?? txData.isInstallment ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      splits: []
    };
  }

  private addOptimisticTransactionToCache(optimisticTransaction: any): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: [optimisticTransaction, ...old.data]
        };
      });
    });
  }

  private replaceOptimisticWithRealTransaction(optimisticTransaction: any, realTransaction: Transaction): void {
    // Don't replace - just invalidate queries and let the normal refetch handle it
    // The optimistic transaction will be replaced naturally when the query refetches
    CacheUtils.invalidateTransactionRelated(this.queryClient);
  }

  private removeOptimisticTransaction(optimisticTransaction: any): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((transaction: any) => transaction.id !== this.optimisticTransactionId)
        };
      });
    });
  }

  public async unexecute(): Promise<void> {
    if (this.createdTransactionId) {
      // 1. Remove from cache immediately (instant UI feedback)
      this.removeTransactionFromCache(this.createdTransactionId);
      
      // 2. Delete from database in background (don't await)
      supabaseService.delete('transactions', this.createdTransactionId)
        .then(async () => {
          // Success - invalidate to ensure consistency
          await CacheUtils.invalidateTransactionRelated(this.queryClient);
        })
        .catch(() => {
          // Failure - restore UI to actual state
          CacheUtils.invalidateTransactionRelated(this.queryClient);
        });
    }
  }

  private removeTransactionFromCache(transactionId: number): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((transaction: any) => transaction.id !== transactionId)
        };
      });
    });
  }
}

/**
 * Command to delete multiple transactions in bulk.
 * - execute(): Deletes all transactions from the database.
 * - unexecute(): Restores all transactions by re-creating them.
 */
export class BulkDeleteTransactionCommand implements ICommand {
  private readonly transactions: Transaction[];
  private readonly queryClient: QueryClient;
  // IDs of transactions re-created by unexecute() (undo). Each restored record
  // gets a new DB-generated ID, so execute() (redo) must delete those new IDs —
  // not the originals, which no longer exist.
  private restoredIds: number[] = [];

  constructor(transactions: Transaction[], queryClient: QueryClient) {
    this.transactions = transactions;
    this.queryClient = queryClient;
  }

  public getAffectedIds(): number[] {
    return [...this.transactions.map(t => t.id), ...this.restoredIds];
  }

  public async execute(): Promise<void> {
    const idsToDelete = this.restoredIds.length > 0
      ? this.restoredIds
      : this.transactions.map(t => t.id);

    // After undo, the cache may hold transactions under either their original ids
    // or the restored ids depending on whether the post-undo refetch has run.
    // Remove both sets so the UI updates regardless of timing.
    this.removeTransactionsFromCache(this.transactions.map(t => t.id));
    if (this.restoredIds.length > 0) {
      this.removeTransactionsFromCache(this.restoredIds);
    }

    try {
      await supabaseService.deleteMany('transactions', idsToDelete);
      this.restoredIds = [];
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      console.error('BulkDeleteTransactionCommand.execute() - Failed to delete transactions:', error);
      throw error;
    }
  }

  public async unexecute(): Promise<void> {
    try {
      // 1. Restore in database first (for test compatibility)
      await this.restoreTransactionsInDatabase();

      // 2. Add transactions back to cache after successful database restoration
      this.addTransactionsToCache(this.transactions);

      // 3. Invalidate queries after success
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      console.error('BulkDeleteTransactionCommand.unexecute() - Failed to restore transactions:', error);
      throw error;
    }
  }

  private async restoreTransactionsInDatabase(): Promise<void> {
    const newIds: number[] = [];
    for (const transaction of this.transactions) {
      const { id, splits, ...restorableData } = transaction;
      const sanitizedData = sanitizeTransactionForUpdate(restorableData);
      Object.assign(sanitizedData, pickRestoreOnlyFields(restorableData));

      // Handle splits restoration
      if (splits && splits.length >= 2) {
        // Multi-split transaction: pass all splits so createUniqueTransaction recreates them all
        sanitizedData.isSplitTransaction = true;
        sanitizedData.splits = splits.map((s: any) => ({
          categoryId: s.categoryId ?? s.category_id,
          amount: s.amount,
          notes: s.notes ?? s.split_observation ?? '',
        }));
      } else if (splits && splits.length === 1) {
        const firstSplit = splits[0];
        if (firstSplit.category_id !== undefined) {
          sanitizedData.category_id = firstSplit.category_id;
        }
        if (firstSplit.amount !== undefined) {
          sanitizedData.amount = firstSplit.amount;
        }
        if (firstSplit.observation !== undefined) {
          sanitizedData.notes = firstSplit.observation ?? undefined;
        }
      }

      const restored = await supabaseService.createUniqueTransaction(sanitizedData);
      if (restored?.id) newIds.push(restored.id);
    }
    this.restoredIds = newIds;
  }

  private removeTransactionsFromCache(transactionIds: number[]): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((transaction: any) => !transactionIds.includes(transaction.id))
        };
      });
    });
  }

  private addTransactionsToCache(transactions: Transaction[]): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: [...transactions, ...old.data]
        };
      });
    });
  }
}

/**
 * Command to update an existing transaction.
 * This command is aware of the split between the `transactions` and `transaction_splits` tables.
 * - execute(): Applies the new data to the correct table(s).
 * - unexecute(): Reverts the transaction and/or split to its original state.
 */
export class UpdateTransactionCommand implements ICommand {
  private readonly originalTransaction: Transaction;
  private readonly newTransactionData: Partial<Transaction>;
  private readonly queryClient: QueryClient;
  private databasePromise?: Promise<void>;
  
  // For conversion tracking (undo support)
  private isConversion = false;
  private convertedPair?: ConvertedLinkedPair;
  private newTransactionResult?: any;

  constructor(originalTransaction: Transaction, newTransactionData: Partial<Transaction>, queryClient: QueryClient) {
    this.originalTransaction = originalTransaction;
    this.newTransactionData = newTransactionData;
    this.queryClient = queryClient;
  }

  public getAffectedIds(): number[] {
    const created = this.convertedPair ? [this.convertedPair.primary.id, this.convertedPair.linked.id] : [];
    return [this.originalTransaction.id, ...created];
  }

  public async execute(): Promise<void> {
    
    // Only check for conversion if this is an existing transaction (not new/optimistic)
    const isExistingTransaction = this.originalTransaction.id && this.originalTransaction.id > 0;
    
    if (isExistingTransaction) {
      // Check if this is a conversion from regular transaction to linked transaction
      // Forms hand us camelCase (toAccountId); normalize before reading any field.
      const incoming = sanitizeTransactionForUpdate(this.newTransactionData);
      const isCurrentlyRegular = this.originalTransaction.type === 'transaction' && !this.originalTransaction.to_account_id;
      const isBecomingLinked = (incoming.type === 'transfer' || incoming.type === 'payment') && incoming.to_account_id;
      
      if (isCurrentlyRegular && isBecomingLinked) {
        // Check if original transaction is reconciled (using data we already have)
        if ((this.originalTransaction as any).is_reconciled) {
          throw new Error('Cannot convert reconciled transactions to payments/transfers. Remove from reconciliation first.');
        }
        
        return this.executeConversionToLinked();
      }
    }
    
    // Regular update logic
    // 1. Update cache immediately (instant UI feedback)
    this.updateTransactionInCache(this.originalTransaction.id, this.newTransactionData);
    
    // 2. Update in database in background (optimistic updates)
    const sanitizedData = sanitizeTransactionForUpdate(this.newTransactionData);
    const splitId = (this.originalTransaction as any).split_id;
    if (splitId) {
      sanitizedData.split_id = splitId;  // Use snake_case as expected by supabase service
    }
    
    // Remove the removeFromReconciliation flag from sanitized data as it's not a database field
    // (The actual reconciliation removal is handled in the UI before this command runs)
    delete (sanitizedData as any).removeFromReconciliation;
    
    // Store the database promise for optional awaiting by UI
    this.databasePromise = supabaseService.update('transactions', this.originalTransaction.id, sanitizedData)
      .then(async () => {
        // Success - invalidate to ensure consistency
        await CacheUtils.invalidateTransactionRelated(this.queryClient);
      })
      .catch((error) => {
        // Failure - revert the cache changes
        this.updateTransactionInCache(this.originalTransaction.id, this.originalTransaction);
        throw error; // Re-throw so UI can catch it if it waits for the promise
      });
    
    // Return immediately for optimistic UX (don't await database operation)
  }

  // Execute conversion to linked transaction via the convert_transaction_to_linked RPC
  private async executeConversionToLinked(): Promise<void> {
    // For undo purposes, track what we're doing
    this.isConversion = true;
    this.convertedPair = undefined;

    // 1. Update cache immediately (optimistic UI feedback)
    this.updateTransactionInCache(this.originalTransaction.id, this.newTransactionData);

    // 2. Execute the atomic conversion in background
    this.databasePromise = this.performConversion()
      .then(async (newTransactionData) => {
        // Success - invalidate cache
        await CacheUtils.invalidateTransactionRelated(this.queryClient);

        // Store new transaction data for potential undo
        this.newTransactionResult = newTransactionData;
      })
      .catch(async (error) => {
        // Failure - revert cache. The RPC is atomic (single DB transaction), so a
        // failure here means nothing changed — no cleanup needed.
        this.updateTransactionInCache(this.originalTransaction.id, this.originalTransaction);
        throw error;
      });
  }

  // Convert the original transaction into a linked pair in one atomic round trip
  // (previously: a dedupe check + 2 account-name fetches + 2 inserts + 1 delete,
  // each a separate request with no atomicity across them).
  private async performConversion(): Promise<any> {
    const incoming = sanitizeTransactionForUpdate(this.newTransactionData);
    const updates = {
      account_id: incoming.account_id,
      to_account_id: incoming.to_account_id,
      payment_date: incoming.payment_date || this.originalTransaction.payment_date,
      amount: incoming.amount ?? this.originalTransaction.amount,
      payee: incoming.payee || this.originalTransaction.payee,
      notes: incoming.notes ?? this.originalTransaction.notes,
      type: incoming.type,
      category_id: incoming.category_id ?? -4, // Default to Transfer/Payment
    };

    const result = await supabaseService.convertTransactionToLinked(this.originalTransaction.id, updates);

    // Keep the whole result: it carries the snapshot undoConversion() restores from.
    this.convertedPair = result;

    return result.primary;
  }

  // Allow UI to optionally wait for database operation
  public async waitForDatabase(): Promise<void> {
    if (this.databasePromise) {
      await this.databasePromise;
    }
  }

  // Whether execute() routed through the (slower, non-instant) linked-transaction
  // conversion path — lets the UI keep a loading indicator up until it confirms,
  // instead of closing optimistically like it does for regular field edits.
  public isConversionInProgress(): boolean {
    return this.isConversion;
  }

  public async unexecute(): Promise<void> {
    if (this.isConversion) {
      return this.undoConversion();
    }
    
    // Regular update undo
    // 1. Revert cache immediately (instant UI feedback)
    this.updateTransactionInCache(this.originalTransaction.id, this.originalTransaction);
    
    // 2. Update in database (awaited so undo only succeeds after the DB confirms)
    const sanitizedData = sanitizeTransactionForUpdate(this.originalTransaction);
    const splitId = (this.originalTransaction as any).split_id;
    if (splitId) {
      sanitizedData.split_id = splitId;
    }

    try {
      await supabaseService.update('transactions', this.originalTransaction.id, sanitizedData);
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      // Failure - restore UI to actual state and propagate to the caller
      CacheUtils.invalidateTransactionRelated(this.queryClient);
      console.error('UpdateTransactionCommand.unexecute() - Failed to revert transaction:', error);
      throw error;
    }
  }

  // Undo conversion atomically: one RPC deletes the mirror leg and resets the
  // original row and its splits from the snapshot the conversion returned.
  private async undoConversion(): Promise<void> {
    // 1. Revert cache immediately
    this.updateTransactionInCache(this.originalTransaction.id, this.originalTransaction);

    // The command lands on the undo stack as soon as execute() returns, before the
    // background conversion settles. Wait for it here: if it failed nothing was
    // converted (the RPC is atomic), so there is nothing to undo.
    try {
      await this.waitForDatabase();
    } catch {
      this.updateTransactionInCache(this.originalTransaction.id, this.originalTransaction);
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
      return;
    }

    if (!this.convertedPair) return;

    try {
      await supabaseService.undoConvertTransactionToLinked(this.convertedPair);
    } finally {
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    }
  }

  private updateTransactionInCache(transactionId: number, newData: Partial<Transaction>): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((transaction: any) => 
            transaction.id === transactionId 
              ? { ...transaction, ...newData }
              : transaction
          )
        };
      });
    });
  }
}

/**
 * Command to update the status of a transaction.
 * - execute(): Updates the transaction status.
 * - unexecute(): Reverts the transaction status to its original state.
 */
export class UpdateTransactionStatusCommand implements ICommand {
  private readonly transactionId: number;
  private readonly oldStatusId: number;
  private readonly newStatusId: number;
  private readonly queryClient: QueryClient;
  private readonly userId: string;

  constructor(
    transactionId: number,
    oldStatusId: number,
    newStatusId: number,
    userId: string,
    queryClient: QueryClient
  ) {
    this.transactionId = transactionId;
    this.oldStatusId = oldStatusId;
    this.newStatusId = newStatusId;
    this.userId = userId;
    this.queryClient = queryClient;
  }

  public getAffectedIds(): number[] {
    return [this.transactionId];
  }

  public async execute(): Promise<void> {
    // 1. Update cache immediately (instant UI feedback)
    this.updateStatusInCache(this.transactionId, this.newStatusId);

    // 2. Update in database (awaited so the caller only reports success after
    // the DB confirms; on failure the optimistic cache change is reverted)
    try {
      await supabaseService.update("transactions", this.transactionId, {
        status_id: this.newStatusId,
        user_id: this.userId,
      });
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      // Failure - revert the cache changes and propagate to the caller
      this.updateStatusInCache(this.transactionId, this.oldStatusId);
      console.error(`UpdateTransactionStatusCommand.execute() - Failed to update transaction status:`, error);
      throw error;
    }
  }

  public async unexecute(): Promise<void> {
    // 1. Revert cache immediately (instant UI feedback)
    this.updateStatusInCache(this.transactionId, this.oldStatusId);

    // 2. Update in database (awaited so undo only succeeds after the DB confirms)
    try {
      await supabaseService.update("transactions", this.transactionId, {
        status_id: this.oldStatusId,
        user_id: this.userId,
      });
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      // Failure - restore UI to actual state and propagate to the caller
      CacheUtils.invalidateTransactionRelated(this.queryClient);
      console.error(`UpdateTransactionStatusCommand.unexecute() - Failed to revert transaction status:`, error);
      throw error;
    }
  }

  private updateStatusInCache(transactionId: number, statusId: number): void {
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });
    
    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((transaction: any) => 
            transaction.id === transactionId 
              ? { ...transaction, status_id: statusId }
              : transaction
          )
        };
      });
    });
  }
}

/**
 * Command to update multiple transactions with the same changes.
 * - execute(): Updates all transactions with the provided changes.
 * - unexecute(): Restores all transactions to their original states.
 * Returns information about failed updates for user notification.
 */
export class BatchUpdateTransactionCommand implements ICommand {
  private readonly originalTransactions: Transaction[];
  private readonly updateData: Partial<Transaction>;
  private readonly queryClient: QueryClient;
  private readonly userId: string;
  private failedTransactionIds: number[] = [];
  private failureErrors: Map<number, string> = new Map();

  constructor(
    originalTransactions: Transaction[],
    updateData: Partial<Transaction>,
    userId: string,
    queryClient: QueryClient
  ) {
    this.originalTransactions = originalTransactions;
    this.updateData = updateData;
    this.userId = userId;
    this.queryClient = queryClient;
  }

  public getAffectedIds(): number[] {
    return this.originalTransactions.map(t => t.id);
  }

  public async execute(): Promise<void> {
    this.failedTransactionIds = [];
    this.failureErrors.clear();

    const transactionIds = this.originalTransactions.map(t => t.id);

    try {
      // 1. Update cache immediately (instant UI feedback), before the DB round-trip
      this.updateTransactionsInCache(transactionIds, this.updateData);

      // Single sanitization call for batch data
      const sanitizedData = sanitizeTransactionForUpdate({ ...this.updateData, user_id: this.userId });

      // Use new batch update method
      await supabaseService.batchUpdateTransactions(transactionIds, sanitizedData, this.userId);
    } catch (error) {
      console.error('BatchUpdateTransactionCommand.execute() - Batch update failed:', error);
      // Failure - revert the optimistic cache changes. For batch operations, all transactions fail together
      this.revertTransactionsInCache(this.originalTransactions);
      this.failedTransactionIds = this.originalTransactions.map(t => t.id);
      this.originalTransactions.forEach(t => {
        this.failureErrors.set(t.id, error instanceof Error ? error.message : 'Unknown error');
      });
      throw new Error(`Failed to batch update ${this.originalTransactions.length} transactions`);
    }

    // Success - invalidate to ensure consistency
    await CacheUtils.invalidateTransactionRelated(this.queryClient);
  }

  public async unexecute(): Promise<void> {
    // 1. Revert cache immediately (instant UI feedback)
    this.revertTransactionsInCache(this.originalTransactions);

    try {
      // Group transactions by their original values for efficient batch restoration
      const restoreGroups = this.groupTransactionsByOriginalState();

      // Execute batch restore operations in parallel
      const restorePromises = Array.from(restoreGroups.entries()).map(([originalData, transactionIds]) => {
        return supabaseService.batchUpdateTransactions(transactionIds, originalData, this.userId);
      });

      await Promise.all(restorePromises);
      // Success - invalidate to ensure consistency
      await CacheUtils.invalidateTransactionRelated(this.queryClient);
    } catch (error) {
      // Failure - restore UI to actual state and propagate to the caller
      CacheUtils.invalidateTransactionRelated(this.queryClient);
      console.error('BatchUpdateTransactionCommand.unexecute() - Batch revert failed:', error);
      throw error;
    }
  }

  // Which of the batch's transactions are split (>=2 splits). Detection must key
  // off this.originalTransactions — the grouped UI objects that carry
  // splitCount/splits — NOT the query cache rows: the cache holds raw per-split
  // rows (from v_transaction_splits) that have neither field, so reading
  // splitCount off them would always be undefined and silently skip the guard.
  private getSplitTransactionIds(): Set<number> {
    const splitIds = new Set<number>();
    for (const t of this.originalTransactions) {
      const isSplitTx = (t as any).splitCount >= 2 || ((t as any).splits?.length ?? 0) >= 2;
      if (isSplitTx) splitIds.add(t.id);
    }
    return splitIds;
  }

  // Optimistically patches the given transactions in the cache with newData.
  // Split transactions keep their existing category_id/notes — those live per-split
  // (transaction_splits rows), so a single batch value would misrepresent them
  // until the post-invalidation refetch brings the real per-split data back.
  private updateTransactionsInCache(transactionIds: number[], newData: Partial<Transaction>): void {
    const idSet = new Set(transactionIds);
    const splitIds = this.getSplitTransactionIds();
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });

    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((transaction: any) => {
            if (!idSet.has(transaction.id)) return transaction;
            const patch = splitIds.has(transaction.id)
              ? { ...newData, category_id: transaction.category_id, notes: transaction.notes }
              : newData;
            return { ...transaction, ...patch };
          })
        };
      });
    });
  }

  // Reverts each transaction in the cache to its own original values (used on
  // execute() failure and at the start of unexecute()).
  private revertTransactionsInCache(originalTransactions: Transaction[]): void {
    const originalsById = new Map(originalTransactions.map(t => [t.id, t]));
    const splitIds = this.getSplitTransactionIds();
    const cache = this.queryClient.getQueryCache();
    const transactionQueries = cache.findAll({ queryKey: ['transactions'] });

    transactionQueries.forEach((query) => {
      this.queryClient.setQueryData(query.queryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((transaction: any) => {
            const original = originalsById.get(transaction.id);
            if (!original) return transaction;
            // Split rows keep their own per-split category_id/notes: the optimistic
            // patch never touched them, and the grouped original carries only a
            // single collapsed value that would clobber the individual splits.
            if (splitIds.has(transaction.id)) {
              const { category_id: _c, notes: _n, ...rest } = original as any;
              return { ...transaction, ...rest };
            }
            return { ...transaction, ...original };
          })
        };
      });
    });
  }

  private groupTransactionsByOriginalState(): Map<Record<string, any>, number[]> {
    const groups = new Map<string, { data: Record<string, any>, ids: number[] }>();
    
    for (const transaction of this.originalTransactions) {
      // Skip transactions that failed during original execution
      if (this.failedTransactionIds.includes(transaction.id)) {
        continue;
      }
      
      // Create restore data from original transaction; strip GroupedTransaction-only fields
      // that don't exist on the transactions table (splits, isSplitTransaction, splitCount, totalAmount)
      const restoreData = sanitizeTransactionForUpdate(transaction);
      delete restoreData.splits;
      delete restoreData.isSplitTransaction;
      delete restoreData.splitCount;
      delete restoreData.totalAmount;

      // For split transactions, category_id and notes live in transaction_splits rows —
      // passing them to batchUpdateTransactions would overwrite ALL splits with the same
      // single value (the first split's), corrupting the per-split data.
      const isSplitTx = (transaction as any).splitCount >= 2 || ((transaction as any).splits?.length ?? 0) >= 2;
      if (isSplitTx) {
        delete restoreData.category_id;
        delete restoreData.notes;
      }

      const dataKey = JSON.stringify(restoreData);
      
      if (!groups.has(dataKey)) {
        groups.set(dataKey, { data: restoreData, ids: [] });
      }
      
      groups.get(dataKey)!.ids.push(transaction.id);
    }
    
    // Convert to Map<data, ids[]> format
    const result = new Map<Record<string, any>, number[]>();
    for (const { data, ids } of Array.from(groups.values())) {
      result.set(data, ids);
    }
    
    return result;
  }

  // Public method to get failed transaction info for UI notification
  public getFailedTransactions(): { ids: number[], errors: Map<number, string> } {
    return { ids: [...this.failedTransactionIds], errors: new Map(this.failureErrors) };
  }
}
