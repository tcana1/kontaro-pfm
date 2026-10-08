import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { tKey } from '@/lib/i18n-keys';
import { History, Wallet, Plug, Tags } from 'lucide-react';

const ACTION_CARDS = [
  {
    href: '/settings?tab=history',
    icon: History,
    title: tKey('Import History'),
    description: tKey('Upload an Excel file with your categorized transaction history.'),
  },
  {
    href: '/accounts',
    icon: Wallet,
    title: tKey('Create your first account'),
    description: tKey('Track a checking, savings, or credit card account.'),
  },
  {
    href: '/settings?tab=connections',
    icon: Plug,
    title: tKey('Connect your bank'),
    description: tKey('Link a bank to sync transactions automatically.'),
  },
  {
    href: '/categories',
    icon: Tags,
    title: tKey('Set up categories'),
    description: tKey('Organize expenses and income into groups you can report on.'),
  },
] as const;

const EmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-2xl w-full space-y-8 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {t('Welcome to your financial overview')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Get started by connecting your data. Here are the first steps:')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ACTION_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm hover:border-primary hover:shadow-md transition-all"
            >
              <card.icon className="h-6 w-6 text-primary mb-3" />
              <p className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
                {t(card.title)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(card.description)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmptyState;