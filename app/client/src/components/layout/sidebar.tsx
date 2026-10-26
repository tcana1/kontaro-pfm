import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useFinance } from '@/contexts/finance-context';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAccountBalance } from '@/hooks/useAccountBalance';
import { formatCurrency, roundDown } from '@/lib/currency-formatter';
import { LogOut, ChevronDown, ChevronRight, Pencil, Plus, PanelLeftClose, PanelLeftOpen, Pin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AccountForm from '@/components/accounts/account-form';
import type { Account } from '@shared/schema';
import { CacheUtils } from '@/lib/cacheUtils';
import { Skeleton } from '@/components/ui/skeleton';

// Icons
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  FolderKanban,
  BarChart3,
  Settings,
  Wallet,
  X,
  User,
  Tag,
  type LucideIcon,
} from 'lucide-react';

export type DesktopSidebarMode = "expanded" | "collapsed" | "hover";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  desktopMode: DesktopSidebarMode;
  onSelectDesktopMode: (mode: DesktopSidebarMode) => void;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, desktopMode, onSelectDesktopMode }) => {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const { accounts, currency, isLoading: isFinanceLoading } = useFinance();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAccountsExpanded, setIsAccountsExpanded] = useState(false);
  const [isClosedAccountsExpanded, setIsClosedAccountsExpanded] = useState(false);
  const [hoveredAccountId, setHoveredAccountId] = useState<number | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);

  // Mobile drawer: display:none while closed (so iOS 26 Safari ignores this fixed edge-to-edge
  // element when tinting its bottom bar), mounted before sliding in and after sliding out.
  const [isMobileMounted, setIsMobileMounted] = useState(isOpen);
  const [isMobileShown, setIsMobileShown] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setIsMobileMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setIsMobileShown(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setIsMobileShown(false);
    const timer = setTimeout(() => setIsMobileMounted(false), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Reset hover expansion when switching modes
  useEffect(() => {
    if (desktopMode !== "hover") setIsHoverExpanded(false);
  }, [desktopMode]);

  // Fetch all account balances
  const { data: accountBalances = [], isLoading: isBalancesLoading } = useAccountBalance();
  // Hold the account rows back on first load until names, balances and the page's transactions can render together.
  // Latched so later refetches (edits, polling) never bring the skeleton back.
  const isTransactionsFetching = useIsFetching({ queryKey: ['transactions'] }) > 0;
  const [hasInitialLoadFinished, setHasInitialLoadFinished] = useState(false);
  const isInitialLoading = isFinanceLoading || isBalancesLoading || isTransactionsFetching;
  useEffect(() => {
    if (!isInitialLoading) setHasInitialLoadFinished(true);
  }, [isInitialLoading]);
  const isAccountsLoading = !hasInitialLoadFinished && isInitialLoading;

  // Separate active and closed accounts, sort by name
  const activeAccounts = accounts?.filter(account => account.is_active).sort((a, b) => a.name.localeCompare(b.name)) || [];
  const closedAccounts = accounts?.filter(account => !account.is_active).sort((a, b) => a.name.localeCompare(b.name)) || [];

  // Helper function to get account balance by account ID
  const getAccountBalance = (accountId: number) => {
    return accountBalances.find(balance => balance.accountId === accountId);
  };

  // Helper function to get balance text color based on account type
  const getBalanceTextColor = (accountTypeId: number) => {
    // Red for credit_card (2) - Liabilities
    switch (accountTypeId) {
      case 2: // credit_card
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Whether labels are visible: full expand or hover-expanded
  const showText = desktopMode === "expanded" || (desktopMode === "hover" && isHoverExpanded);

  const basicNavItems: { name: string; path: string; Icon: LucideIcon }[] = [
    { name: t('Dashboard'), path: '/dashboard', Icon: LayoutDashboard },
    { name: t('Reports'), path: '/reports', Icon: BarChart3 },
    { name: t('Transactions'), path: '/transactions', Icon: ArrowLeftRight },
    { name: t('Categories'), path: '/categories', Icon: FolderKanban },
    { name: t('Tags'), path: '/tags', Icon: Tag },
  ];

  const isAccountRoute = location.startsWith('/accounts/') && location.includes('/transactions');
  const currentAccountId = isAccountRoute ? location.split('/')[2] : null;

  // Handle account edit
  const handleEditAccount = (account: Account, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAccount(account);
    setIsEditDialogOpen(true);
  };

  // Icon that hints at the current mode
  const ToggleIcon = desktopMode === "expanded" ? PanelLeftClose : desktopMode === "collapsed" ? PanelLeftOpen : Pin;

  const desktopWidthClass = showText ? "md:w-64" : "md:w-16";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out",
        "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm",
        // Mobile: full-width overlay, hidden by default
        "w-64 -translate-x-full",
        !isMobileMounted && "max-md:hidden",
        // Desktop: always visible, width driven by mode
        desktopWidthClass,
        "md:translate-x-0",
        isMobileShown && "translate-x-0"
      )}
      onMouseEnter={() => desktopMode === "hover" && setIsHoverExpanded(true)}
      onMouseLeave={() => desktopMode === "hover" && setIsHoverExpanded(false)}
    >
      <div className="flex flex-col h-full overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Logo / Header */}
        <div className={cn(
          "flex items-center py-5 shrink-0 transition-all duration-200",
          showText ? "justify-between px-4" : "flex-col gap-2 justify-center px-2"
        )}>
          {showText ? (
            <div className="flex items-center space-x-2">
              <Wallet className="text-primary text-2xl shrink-0" />
              <span className="text-xl font-semibold whitespace-nowrap">PFM</span>
            </div>
          ) : (
            <Wallet className="text-primary h-6 w-6" />
          )}

          <div className="flex items-center gap-1">
            {/* Mobile close button */}
            <button
              onClick={onClose}
              className="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
            {/* Desktop mode control */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title={t('Sidebar control')}
                  className="hidden md:flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <ToggleIcon className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{t('Sidebar control')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={desktopMode}
                  onValueChange={(value) => onSelectDesktopMode(value as DesktopSidebarMode)}
                >
                  <DropdownMenuRadioItem value="expanded">{t('Expanded')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="collapsed">{t('Collapsed')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hover">{t('Expand on hover')}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navigation */}
        <nav className={cn(
          "flex-1 py-4 space-y-1 overflow-y-auto scrollbar-hide transition-all duration-200",
          showText ? "px-2" : "px-1"
        )}>
          {/* Basic navigation items */}
          {basicNavItems.map(item => (
            <div key={item.path} className="block">
              <Link href={item.path}>
                <div
                  onClick={onClose}
                  className={cn(
                    "flex items-center py-3 rounded-lg cursor-pointer transition-all duration-200",
                    showText ? "px-4" : "justify-center px-2",
                    location === item.path
                      ? "text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  )}
                >
                  <item.Icon className={cn("shrink-0 h-5 w-5", showText && "mr-3")} />
                  <span className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-200",
                    showText ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                  )}>
                    {item.name}
                  </span>
                </div>
              </Link>
            </div>
          ))}

          {/* Accounts expandable navigation */}
          <div className="block">
            {/* Main Accounts item */}
            <div
              onClick={() => showText && setIsAccountsExpanded(!isAccountsExpanded)}
              className={cn(
                "flex items-center py-3 rounded-lg cursor-pointer transition-all duration-200",
                showText ? "px-4 justify-between" : "justify-center px-2",
                (location === '/accounts' || isAccountRoute)
                  ? "text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              <div className="flex items-center">
                <CreditCard className={cn("shrink-0 h-5 w-5", showText && "mr-3")} />
                <span className={cn(
                  "overflow-hidden whitespace-nowrap transition-all duration-200",
                  showText ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                )}>
                  {t('Accounts')}
                </span>
              </div>
              {showText && (
                isAccountsExpanded
                  ? <ChevronDown className="h-4 w-4 shrink-0" />
                  : <ChevronRight className="h-4 w-4 shrink-0" />
              )}
            </div>

            {/* Accounts submenu — only visible when text is shown */}
            {showText && isAccountsExpanded && (
              <div className="mt-1 space-y-1 pr-2">
                {/* Active accounts */}
                {isAccountsLoading && Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-0.5 py-1.5">
                    <Skeleton className="h-4 w-28 ml-8" />
                    <Skeleton className="h-3 w-12 mr-2" />
                  </div>
                ))}
                {!isAccountsLoading && activeAccounts.map(account => {
                  const accountBalance = getAccountBalance(account.id);
                  return (
                    <div
                      key={account.id}
                      className="relative"
                      onMouseEnter={() => setHoveredAccountId(account.id)}
                      onMouseLeave={() => setHoveredAccountId(null)}
                    >
                      <Link href={`/accounts/${account.id}/transactions`}>
                        <div
                          onClick={onClose}
                          className={cn(
                            "flex items-center justify-between px-0.5 py-1 rounded-lg cursor-pointer text-sm group",
                            currentAccountId === account.id.toString()
                              ? "text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600"
                              : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                          )}
                        >
                          <div className="flex items-center flex-1">
                            {/* Reserve space for pencil icon to prevent text movement */}
                            <div className="w-6 flex items-center justify-center mr-2">
                              {hoveredAccountId === account.id && (
                                <button
                                  onClick={(e) => handleEditAccount(account, e)}
                                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <span className="truncate">{account.name}</span>
                          </div>
                          {accountBalance && (
                            <span
                              className={cn(
                                "text-xs font-medium ml-2 pr-2"
                              )}
                            >
                              {formatCurrency(roundDown(accountBalance.totalBalance), currency, 0)}
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })}

                {/* Add Account Button */}
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => setIsAddAccountDialogOpen(true)}
                    className="flex items-center px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    <span>{t('Add Account')}</span>
                  </button>
                </div>

                {/* Closed accounts submenu */}
                {closedAccounts.length > 0 && (
                  <div>
                    <div
                      onClick={() => setIsClosedAccountsExpanded(!isClosedAccountsExpanded)}
                      className="flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <span>{t('Closed accounts')}</span>
                      {isClosedAccountsExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </div>

                    {/* Closed accounts list */}
                    {isClosedAccountsExpanded && (
                      <div className="mt-1 space-y-1">
                        {closedAccounts.map(account => {
                          const accountBalance = getAccountBalance(account.id);
                          return (
                            <div
                              key={account.id}
                              className="relative"
                              onMouseEnter={() => setHoveredAccountId(account.id)}
                              onMouseLeave={() => setHoveredAccountId(null)}
                            >
                              <Link href={`/accounts/${account.id}/transactions`}>
                                <div
                                  className={cn(
                                    "flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer text-xs group",
                                    currentAccountId === account.id.toString()
                                      ? "text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600"
                                      : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                                  )}
                                >
                                  <div className="flex items-center flex-1">
                                    {/* Reserve space for pencil icon to prevent text movement */}
                                    <div className="w-6 flex items-center justify-center">
                                      {hoveredAccountId === account.id && (
                                        <button
                                          onClick={(e) => handleEditAccount(account, e)}
                                          className="rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                    <span className="truncate">{account.name}</span>
                                  </div>
                                  {accountBalance && (
                                    <span
                                      className={cn(
                                        "text-xs font-medium ml-2 opacity-60"
                                      )}
                                    >
                                      {formatCurrency(roundDown(accountBalance.totalBalance), currency)}
                                    </span>
                                  )}
                                </div>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* User Profile */}
        <div className={cn(
          "border-t border-gray-200 dark:border-gray-700 transition-all duration-200",
          showText ? "p-4" : "p-2"
        )}>
          <Link href="/settings">
            <div
              onClick={onClose}
              className={cn(
                "flex items-center cursor-pointer group rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                showText ? "justify-between p-2" : "justify-center p-2"
              )}
            >
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center group-hover:bg-gray-300 dark:group-hover:bg-gray-600 transition-colors shrink-0">
                  <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </div>
                {showText && (
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">{user?.user_metadata?.full_name || 'User'}</p>
                  </div>
                )}
              </div>
              {showText && (
                <Settings className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors" />
              )}
            </div>
          </Link>
          <div className="mt-2">
            <div
              onClick={() => signOut()}
              className={cn(
                "flex items-center text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-red-600 dark:text-red-400 transition-colors",
                showText ? "px-3 py-2" : "justify-center p-2"
              )}
            >
              <LogOut className={cn("h-4 w-4 shrink-0", showText && "mr-2")} />
              {showText && t('Sign Out')}
            </div>
          </div>
        </div>
      </div>

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
              toast({
                title: t('Account updated'),
                description: t('The account has been successfully updated.'),
              });
            }}
            onCancel={() => setIsEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={isAddAccountDialogOpen} onOpenChange={setIsAddAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Add New Account')}</DialogTitle>
          </DialogHeader>
          <AccountForm
            account={null}
            onSuccess={() => {
              setIsAddAccountDialogOpen(false);
              // Fire-and-forget invalidation for better UI responsiveness
              CacheUtils.invalidateAccountRelated(queryClient);
              toast({
                title: t('Account created'),
                description: t('The account has been successfully created.'),
              });
            }}
            onCancel={() => setIsAddAccountDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default Sidebar;
