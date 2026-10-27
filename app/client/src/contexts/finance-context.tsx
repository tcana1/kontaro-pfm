import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CurrencyCode } from '@/lib/currency-formatter';
import type { Account, Category, CategoryGroup, CategoryWithGroup } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { supabaseService } from '@/services/supabase-service';
import { useAuth } from '@/contexts/auth-context';
import { CacheUtils } from '@/lib/cacheUtils';
import { normalizeDateFormat } from '@/lib/date-utils';

interface User {
  id: string;
  email: string;
  created_at: Date;
}

interface Settings {
  currency: string;
  theme: 'light' | 'dark' | 'system';
  locale: string;
  date_format: string;
  onboarded?: boolean;
  show_installment_projection?: boolean;
}

interface FinanceContextType {
  user: User | null;
  accounts: Account[];
  categories: CategoryWithGroup[];
  categoryGroups: CategoryGroup[];
  settings: Settings | null;
  isLoading: boolean;
  error: Error | null;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  locale: string;
  setLocale: (locale: string) => void;
  dateFormat: string;
  setDateFormat: (dateFormat: string) => void;
  showInstallmentProjection: boolean;
  setShowInstallmentProjection: (enabled: boolean) => void;
}

const defaultFinanceContext: FinanceContextType = {
  user: null,
  accounts: [],
  categories: [],
  categoryGroups: [],
  settings: null,
  isLoading: true,
  error: null,
  currency: 'USD',
  setCurrency: () => {},
  theme: 'light',
  setTheme: () => {},
  locale: 'en-US',
  setLocale: () => {},
  dateFormat: 'default',
  setDateFormat: () => {},
  showInstallmentProjection: false,
  setShowInstallmentProjection: () => {},
};

const FinanceContext = createContext<FinanceContextType>(defaultFinanceContext);

export const useFinance = () => useContext(FinanceContext);

interface FinanceProviderProps {
  children: ReactNode;
}

export const FinanceProvider: React.FC<FinanceProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [locale, setLocale] = useState('en-US');
  // Initialize with default, but will be updated from settings
  const [dateFormat, setDateFormat] = useState('DD/MMM/YYYY');
  const [showInstallmentProjection, setShowInstallmentProjection] = useState(false);
  const creatingSettings = useRef(false);

  // Fetch accounts
  const {
    data: accounts = [],
    isLoading: isLoadingAccounts,
    error: accountsError
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => supabaseService.getAccounts(),
    staleTime: 60000, // 30 seconds
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Fetch categories
  const {
    data: categories = [],
    isLoading: isLoadingCategories,
    error: categoriesError
  } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      let fetchedCategories = await supabaseService.getCategories();

      // Ensure 'Uncategorized' category (id: 0) exists
      if (!fetchedCategories.some((cat: any) => cat.id === 0)) {
        fetchedCategories = [
          ...fetchedCategories,
          {
            id: 0,
            name: 'Uncategorized',
            color: '#9CA3AF',
            group_id: 0,
            user_id: null,
            created_at: new Date().toISOString(),
            category_groups: {
              id: 0,
              name: 'System',
              emoji: '⚙️',
              user_id: null,
              color: '#9CA3AF',
              is_income: false,
              created_at: new Date().toISOString(),
            },
          },
        ] as typeof fetchedCategories;
      }
      return fetchedCategories;
    },
    staleTime: 60000,
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Fetch category groups
  const {
    data: categoryGroups = [],
    isLoading: isLoadingCategoryGroups,
    error: categoryGroupsError
  } = useQuery({
    queryKey: ['category-groups'],
    queryFn: () => supabaseService.getCategoryGroups(),
    staleTime: 60000,
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Fetch settings
  const { 
    data: settings = null as Settings | null,
    isLoading: isLoadingSettings,
    error: settingsError,
    isFetched: isSettingsFetched
  } = useQuery<Settings>({ 
    queryKey: ['settings'],
    queryFn: () => supabaseService.getSettings(),
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Update local state when settings are loaded
  useEffect(() => {
    if (settings) {
      const currencySetting = settings.currency || 'USD';
      const themeSetting = settings.theme || 'light';
      const localeSetting = settings.locale || 'en-US';
      const dateFormatSetting = normalizeDateFormat(settings.date_format);
      
      setCurrency(currencySetting as CurrencyCode);
      setTheme(themeSetting as 'light' | 'dark' | 'system');
      setLocale(localeSetting);
      setDateFormat(dateFormatSetting);
      setShowInstallmentProjection(settings.show_installment_projection ?? false);
    } else if (!isLoadingSettings && !settingsError && settings === null && isSettingsFetched && user) {
      // Only create initial settings if:
      // 1. Not currently loading
      // 2. No error occurred
      // 3. Settings are explicitly null (query returned null, meaning no settings exist)
      // 4. Query has been fetched at least once (prevents race conditions)
      // 5. User is authenticated (required for creating settings)
      if (creatingSettings.current) return;
      creatingSettings.current = true;
      const createInitialSettings = async () => {
        try {
          await supabaseService.createSettings({ currency: 'USD', theme: 'light', locale: 'en-US', date_format: 'DD/MMM/YYYY', onboarded: false });
          await CacheUtils.invalidateSettings(queryClient);
        } catch (error) {
          creatingSettings.current = false; // allow retry on next render
          console.error('Failed to create initial settings:', error);
        }
      };
      createInitialSettings();
    }
  }, [settings, isLoadingSettings, settingsError, isSettingsFetched, user, queryClient]);
  
  // Set up polling for data updates
  useEffect(() => {
    if (!user) return; // Only poll when authenticated
    
    const intervalId = setInterval(async () => {
      await CacheUtils.invalidateAllCore(queryClient);
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(intervalId);
  }, [queryClient, user]);

  // Apply theme changes to document
  useEffect(() => {
    const htmlElement = document.documentElement;
    
    const setDocumentTheme = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

      htmlElement.classList.toggle('dark', isDark);

      // Keep the Safari iOS status bar color in sync with the header background
      // (bg-white in light, dark:bg-gray-800 = #1f2937 in dark).
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', isDark ? '#1f2937' : '#ffffff');
    };

    setDocumentTheme();

    // Listen for system theme changes if using system preference
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => setDocumentTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Update settings when currency/theme/locale changes
  const updateSettings = async (key: string, value: string | boolean) => {
    if (!settings) return;
    
    try {
      await supabaseService.updateSettings({ [key]: value });
      
      await CacheUtils.invalidateSettings(queryClient);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  // Handle currency changes
  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    updateSettings('currency', newCurrency);
  };

  // Handle theme changes
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateSettings('theme', newTheme);
  };

  // Handle locale changes
  const handleLocaleChange = (newLocale: string) => {
    setLocale(newLocale);
    updateSettings('locale', newLocale);
  };

  // Handle date format changes
  const handleDateFormatChange = (rawDateFormat: string) => {
    const newDateFormat = normalizeDateFormat(rawDateFormat);
    setDateFormat(newDateFormat);
    updateSettings('date_format', newDateFormat);
  };

  // Handle installment projection toggle
  const handleShowInstallmentProjectionChange = (enabled: boolean) => {
    setShowInstallmentProjection(enabled);
    updateSettings('show_installment_projection', enabled);
  };

  const isLoading = isLoadingAccounts || isLoadingCategories || isLoadingCategoryGroups || isLoadingSettings;
  const error = accountsError || categoriesError || categoryGroupsError || settingsError;

  const value: FinanceContextType = {
    user: null, // Demo mode - no real user
    accounts: accounts as unknown as Account[],
    categories: categories as unknown as CategoryWithGroup[],
    categoryGroups: categoryGroups as unknown as CategoryGroup[],
    settings,
    isLoading,
    error: error as Error | null,
    currency,
    setCurrency: handleCurrencyChange,
    theme,
    setTheme: handleThemeChange,
    locale,
    setLocale: handleLocaleChange,
    dateFormat,
    setDateFormat: handleDateFormatChange,
    showInstallmentProjection,
    setShowInstallmentProjection: handleShowInstallmentProjectionChange,
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
};
