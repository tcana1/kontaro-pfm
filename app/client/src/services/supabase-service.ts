/**
 * Aggregate entry point for the Supabase data layer.
 *
 * The implementation lives in the sibling modules under ./supabase (transactions,
 * linked-transactions, transaction-rows, rows, crud, accounts, categories,
 * payees, tags, matching, settings, reports). This module composes them into the
 * `supabaseService` singleton so existing callers keep working unchanged.
 *
 * Prefer importing the specific module in new code — `import { getTags } from
 * '@/services/supabase/tags'` — and mock that module in tests, not this one.
 */
import * as crud from './supabase/crud';
import * as rows from './supabase/rows';
import * as accounts from './supabase/accounts';
import * as categories from './supabase/categories';
import * as linked from './supabase/linked-transactions';
import * as matching from './supabase/matching';
import * as payees from './supabase/payees';
import * as reports from './supabase/reports';
import * as settings from './supabase/settings';
import * as tags from './supabase/tags';
import * as transactions from './supabase/transactions';

export type { QueryOptions, TransactionResponse } from './supabase/transactions';

export const supabaseService = {
  // Generic table access
  create: crud.create,
  update: crud.update,
  delete: crud.remove,
  deleteMany: crud.removeMany,
  rpc: rows.rpc,

  // Transactions
  getTransactions: transactions.getTransactions,
  getReconciledTransactionIds: transactions.getReconciledTransactionIds,
  batchUpdateTransactions: transactions.batchUpdateTransactions,

  // Transfer/payment pairs
  createUniqueTransaction: linked.createUniqueTransaction,
  createLinkedTransactions: linked.createLinkedTransactions,
  updateLinkedTransactions: linked.updateLinkedTransactions,
  deleteLinkedTransactions: linked.deleteLinkedTransactions,
  deletingTransactionIds: linked.deletingTransactionIds,
  convertTransactionToLinked: linked.convertTransactionToLinked,
  undoConvertTransactionToLinked: linked.undoConvertTransactionToLinked,

  // Accounts
  getAccounts: accounts.getAccounts,
  deleteAccount: accounts.deleteAccount,

  // Categories, groups and categorization rules
  getCategories: categories.getCategories,
  getCategoryGroups: categories.getCategoryGroups,
  getCategoryTransactionCount: categories.getCategoryTransactionCount,
  getCategoryGroupTransactionCount: categories.getCategoryGroupTransactionCount,
  getCategoryGroupCategoryCount: categories.getCategoryGroupCategoryCount,
  createCategoryGroupsAndCategories: categories.createCategoryGroupsAndCategories,
  deleteCategoryWithMove: categories.deleteCategoryWithMove,
  deleteCategoryWithTransactions: categories.deleteCategoryWithTransactions,
  getCategorizationRules: categories.getCategorizationRules,
  createCategorizationRule: categories.createCategorizationRule,
  updateCategorizationRule: categories.updateCategorizationRule,
  deleteCategorizationRule: categories.deleteCategorizationRule,

  // Payees
  getPayees: payees.getPayees,
  getAllPayeesWithCounts: payees.getAllPayeesWithCounts,
  renamePayee: payees.renamePayee,
  mergePayees: payees.mergePayees,
  setPayeeDefaultCategory: payees.setPayeeDefaultCategory,

  // Tags
  getTags: tags.getTags,
  getTagsAll: tags.getTagsAll,
  createTag: tags.createTag,
  updateTag: tags.updateTag,
  deleteTag: tags.deleteTag,
  getTagSummary: tags.getTagSummary,
  getTagTransactionCount: tags.getTagTransactionCount,
  getTagStats: tags.getTagStats,
  mergeTag: tags.mergeTag,
  getTagTransactions: tags.getTagTransactions,
  setTransactionTag: tags.setTransactionTag,
  bulkSetTransactionTag: tags.bulkSetTransactionTag,

  // Double-entry matching
  findAndMarkMatches: matching.findAndMarkMatches,
  getPendingMatchCandidates: matching.getPendingMatchCandidates,
  findOrCreateMatchCandidate: matching.findOrCreateMatchCandidate,
  getMatchCandidateById: matching.getMatchCandidateById,
  deleteMatchCandidate: matching.deleteMatchCandidate,
  mergeTransactions: matching.mergeTransactions,
  explodeTransaction: matching.explodeTransaction,
  collapseTransactions: matching.collapseTransactions,
  dismissMatch: matching.dismissMatch,

  // Settings
  getSettings: settings.getSettings,
  updateSettings: settings.updateSettings,
  createSettings: settings.createSettings,

  // Reports
  getExpenseBreakdown: reports.getExpenseBreakdown,
  getCategoryBreakdown: reports.getCategoryBreakdown,
};
