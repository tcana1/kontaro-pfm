import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useRoute } from 'wouter';
import { Menu, Bell, Moon, Sun, ChevronDown } from 'lucide-react';
import { useFinance } from '@/contexts/finance-context';
import LocaleSelector from '@/components/ui/locale-selector';
import ThemeToggle from '@/components/ui/theme-toggle';
import { Skeleton } from '@/components/ui/skeleton';

type HeaderProps = {
  onOpenSidebar: () => void;
};

const Header: React.FC<HeaderProps> = ({ onOpenSidebar }) => {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { accounts, isLoading: isFinanceLoading } = useFinance();
  const [isAccountRoute, accountParams] = useRoute('/accounts/:accountId/transactions');
  const routeAccountId = isAccountRoute ? Number(accountParams?.accountId) : null;
  const routeAccount = routeAccountId ? accounts?.find(account => account.id === routeAccountId) : null;

  const getPageTitle = (): string => {
    switch (location) {
      case '/':
      case '/dashboard':
        return t('Dashboard');
      case '/transactions':
        return t('Transactions');
      case '/accounts':
        return t('Accounts');
      case '/categories':
        return t('Categories');
      case '/categories/rules':
        return t('Categorization Rules');
      case '/categories/setup':
        return t('Category Setup');
      case '/tags':
        return t('Tags');
      case '/reports':
        return t('Reports');
      case '/settings':
        return t('Settings');
      case '/profile':
        return t('Profile');
      default:
        return t('Page Not Found');
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm z-30 relative">
      <div className="flex items-center justify-between h-16 px-4 md:px-6 border-b md:border-b-0">
        <div className="flex items-center">
          {/* Mobile menu button */}
          <button 
            onClick={onOpenSidebar}
            className="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mr-2"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Breadcrumb */}
          <nav className="hidden md:flex">
            <ol className="flex items-center space-x-1 text-sm">
              <li>
                <Link href="/">
                  <div className="text-gray-500 dark:text-gray-400 hover:text-primary cursor-pointer">{t('Home')}</div>
                </Link>
              </li>
              {isAccountRoute ? (
                <>
                  <li className="flex items-center">
                    <span className="mx-1 text-gray-400 dark:text-gray-600">/</span>
                    <Link href="/accounts">
                      <div className="text-gray-500 dark:text-gray-400 hover:text-primary cursor-pointer">{t('Accounts')}</div>
                    </Link>
                  </li>
                  <li className="flex items-center">
                    <span className="mx-1 text-gray-400 dark:text-gray-600">/</span>
                    {routeAccount ? (
                      <span className="text-gray-900 dark:text-gray-200">{routeAccount.name}</span>
                    ) : isFinanceLoading ? (
                      <Skeleton className="h-4 w-28" />
                    ) : (
                      <span className="text-gray-900 dark:text-gray-200">{t('Account Transactions')}</span>
                    )}
                  </li>
                </>
              ) : (
                <li className="flex items-center">
                  <span className="mx-1 text-gray-400 dark:text-gray-600">/</span>
                  <span className="text-gray-900 dark:text-gray-200">{getPageTitle()}</span>
                </li>
              )}
            </ol>
          </nav>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-3">
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* Notifications */}
          {/*
          <button className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none">
            <Bell className="h-5 w-5" />
          </button>
          */}
        </div>
      </div>
    </header>
  );
};

export default Header;
