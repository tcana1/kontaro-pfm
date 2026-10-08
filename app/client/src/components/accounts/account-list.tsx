
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServiceQuery } from '@/hooks/useQuery';
import { getAccountBalances } from '@/services/supabase/accounts';
import {
  Plus,
  Edit,
  Trash2,
  CreditCard,
  Wallet,
  Coins,
  PiggyBank,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CircleDollarSign,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AccountForm from './account-form';
import { CreditCardPaymentForm } from '@/components/transactions/credit-card-payment-form';
import { TransferForm } from '@/components/transactions/transfer-form';
import { isCreditCard } from '@/utils/transfer-utils';
import type { Account } from '@shared/schema';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { cn } from '@/lib/utils';

type ViewMode = 'cards' | 'list';
type SortKey = 'name' | 'type' | 'balance';

const VIEW_MODE_KEY = 'accounts-view-mode';

const getInitialViewMode = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list';
  }
};

const AccountList: React.FC = () => {
  const { t } = useTranslation();
  const { currency, categories } = useFinance();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const isMobile = useIsMobile();
  const effectiveView: ViewMode = isMobile ? 'cards' : viewMode;

  const handleViewModeChange = (value: string) => {
    if (value !== 'cards' && value !== 'list') return;
    setViewMode(value);
    try { localStorage.setItem(VIEW_MODE_KEY, value); } catch {}
  };

  const handleSortChange = (key: SortKey) => {
    setSort(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  // Fetch accounts from the accounts table
  const { data: accounts = [], isLoading } = useServiceQuery('accounts');

  // Fetch calculated balances from RPC (accounts table has no balance column)
  const { data: balanceMap = {} } = useQuery({
    queryKey: ['account-balances'],
    queryFn: getAccountBalances,
  });

  const getBalance = (account: Account): number => balanceMap[(account as any).id] ?? 0;

  // Find transfer category (for payments/transfers)
  const transferCategory = Array.isArray(categories) ? (categories.find(cat => cat.name.toLowerCase().includes('transfer')) ||
                          categories.find(cat => !cat.category_groups?.is_income)) : undefined;  // Fallback to first expense category

  // Calculate total balance
  const totalBalance = accounts?.reduce((sum: number, account: Account) => sum + getBalance(account), 0) || 0;

  // Delete account mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await supabaseService.deleteAccount(id);
      return id;
    },
    onSuccess: () => {
      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateAccountRelated(queryClient);

      toast({
        title: t('Account deleted'),
        description: t('The account has been successfully deleted.'),
      });

      setIsDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: t('Failed to delete account: {{message}}', { message: error.message }),
        variant: 'destructive'
      });
    }
  });

  const getAccountTypeName = (account: Account): string => {
    if ((account as any).type) return (account as any).type.name;
    switch (account.type_id) {
      case 2: return 'credit_card';
      case 3: return 'tracking';
      case 4: return 'savings';
      default: return 'checking';
    }
  };

  const getAccountTypeLabel = (account: Account): string => {
    switch (getAccountTypeName(account)) {
      case 'credit_card': return t('Credit Card');
      case 'savings': return t('Savings');
      case 'investment':
      case 'tracking': return t('Tracking');
      default: return t('Checking');
    }
  };

  // Get icon component based on account type
  const getAccountIcon = (account: Account) => {
    const typeName = getAccountTypeName(account);

    switch (typeName) {
      case 'credit_card':
        return <CreditCard className="h-5 w-5 text-primary" />;
      case 'savings':
        return <PiggyBank className="h-5 w-5 text-primary" />;
      case 'investment':
      case 'tracking':
        return <Coins className="h-5 w-5 text-primary" />;
      default:
        return <Wallet className="h-5 w-5 text-primary" />;
    }
  };

  const openTransfer = (account: Account) => {
    setSelectedAccount(account);
    setIsTransferDialogOpen(true);
  };

  const openPayment = (account: Account) => {
    setSelectedAccount(account);
    setIsPaymentDialogOpen(true);
  };

  const sortedAccounts = [...accounts].sort((a: Account, b: Account) => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    if (sort.key === 'balance') return (getBalance(a) - getBalance(b)) * factor;
    if (sort.key === 'type') {
      return (getAccountTypeLabel(a).localeCompare(getAccountTypeLabel(b)) || a.name.localeCompare(b.name)) * factor;
    }
    return a.name.localeCompare(b.name) * factor;
  });

  const renderSortHead = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => handleSortChange(key)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', className?.includes('text-right') && 'flex-row-reverse')}
      >
        {label}
        {sort.key === key
          ? (sort.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
          : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </TableHead>
  );

  // Handle account edit
  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setIsEditDialogOpen(true);
  };

  // Handle account delete
  const handleDelete = (account: Account) => {
    setSelectedAccount(account);
    setIsDeleteDialogOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = () => {
    if (selectedAccount) {
      deleteMutation.mutate(selectedAccount.id);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-medium">{t('Your Accounts')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Total Balance: {{balance}}', { balance: formatCurrency(totalBalance, currency) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isMobile && (
            <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange} variant="outline" size="sm">
              <ActionTooltip label={t('Card view')}>
                <ToggleGroupItem value="cards" aria-label={t('Card view')}>
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
              </ActionTooltip>
              <ActionTooltip label={t('List view')}>
                <ToggleGroupItem value="list" aria-label={t('List view')}>
                  <ListIcon className="h-4 w-4" />
                </ToggleGroupItem>
              </ActionTooltip>
            </ToggleGroup>
          )}
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t('Add Account')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <p>{t('Loading accounts...')}</p>
        </div>
      ) : accounts.length === 0 ? (
        <Card className="border border-gray-200 dark:border-gray-700">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center justify-center">
              <CreditCard className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('No Accounts Found')}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t("You don't have any accounts yet. Add an account to get started.")}
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> {t('Add Account')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : effectiveView === 'list' ? (
        <Card className="border border-gray-200 dark:border-gray-700">
          <Table>
            <TableHeader>
              <TableRow>
                {renderSortHead('name', t('Name'))}
                {renderSortHead('type', t('Type'))}
                {renderSortHead('balance', t('Current Balance'), 'text-right')}
                <TableHead className="text-right">{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAccounts.map((account: Account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link href={`/accounts/${account.id}/transactions`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        {getAccountIcon(account)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate group-hover:underline">{account.name}</div>
                        {account.last4 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">**** {account.last4}</div>
                        )}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">{getAccountTypeLabel(account)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(getBalance(account), currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <ActionTooltip label={t('Transfer')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('Transfer')} onClick={() => openTransfer(account)}>
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                      {isCreditCard(account) && (
                        <ActionTooltip label={t('Pay Card')}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('Pay Card')} onClick={() => openPayment(account)}>
                            <CircleDollarSign className="h-4 w-4" />
                          </Button>
                        </ActionTooltip>
                      )}
                      <ActionTooltip label={t('Edit')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('Edit')} onClick={() => handleEdit(account)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                      <ActionTooltip label={t('Delete')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('Delete')} onClick={() => handleDelete(account)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account: Account) => (
            <Card key={account.id} className="border border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <Link href={`/accounts/${account.id}/transactions`} className="flex items-center min-w-0 group">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 shrink-0">
                      {getAccountIcon(account)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate group-hover:underline">{account.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {account.last4 ? `**** ${account.last4}` : ''}
                      </p>
                    </div>
                  </Link>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(account)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(account)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <span className="text-lg font-semibold">
                    {formatCurrency(getBalance(account), currency)}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('Current Balance')}
                  </p>
                </div>

                {/* Account Actions */}
                <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openTransfer(account)}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-1" />
                    {t('Transfer')}
                  </Button>

                  {isCreditCard(account) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openPayment(account)}
                    >
                      <CircleDollarSign className="h-4 w-4 mr-1" />
                      {t('Pay Card')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Transfer Funds')}</DialogTitle>
          </DialogHeader>
          {accounts.length > 0 && transferCategory && (
            <TransferForm
              accounts={accounts}
              userId={String(1)}
              specialCategoryId={transferCategory.id}
              onSuccess={() => {
                setIsTransferDialogOpen(false);
                // Fire-and-forget invalidation for better UI responsiveness
                CacheUtils.invalidateAccountRelated(queryClient);
                CacheUtils.invalidateTransactionRelated(queryClient);
                toast({
                  title: t('Transfer completed'),
                  description: t('Funds have been transferred successfully'),
                });
              }}
              onCancel={() => setIsTransferDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Credit Card Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Pay Credit Card')}</DialogTitle>
          </DialogHeader>
          {selectedAccount && transferCategory && (
            <CreditCardPaymentForm
              account={selectedAccount}
              userId={String(1)}
              specialCategoryId={transferCategory.id}
              onSuccess={() => {
                setIsPaymentDialogOpen(false);
                // Fire-and-forget invalidation for better UI responsiveness
                CacheUtils.invalidateAccountRelated(queryClient);
                CacheUtils.invalidateTransactionRelated(queryClient);
                toast({
                  title: t('Payment recorded'),
                  description: t('Credit card payment has been recorded successfully'),
                });
              }}
              onCancel={() => setIsPaymentDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Add New Account')}</DialogTitle>
          </DialogHeader>
          <AccountForm
            onSuccess={() => {
              setIsAddDialogOpen(false);
              // Fire-and-forget invalidation for better UI responsiveness
              CacheUtils.invalidateAccountRelated(queryClient);
            }}
            onCancel={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Edit Account')}</DialogTitle>
          </DialogHeader>
          <AccountForm
            account={selectedAccount}
            onSuccess={() => {
              setIsEditDialogOpen(false);
              // Fire-and-forget invalidation for better UI responsiveness
              CacheUtils.invalidateAccountRelated(queryClient);
            }}
            onCancel={() => setIsEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm Deletion')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete this account? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default AccountList;
