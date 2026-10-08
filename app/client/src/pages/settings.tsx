import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearch } from 'wouter';
import { useMobileHeader } from '@/contexts/mobile-header-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProfileSettings from '@/components/settings/profile-settings';
import PayeesSettings from '@/components/settings/payees-settings';
import ConnectorsSettings from '@/components/settings/connectors-settings';
import FileImportSettings from '@/components/settings/file-import-settings';
import HistoryImportSettings from '@/components/settings/history-import-settings';
import ImportHistory from '@/components/import-history';

const VALID_TABS = ['profile', 'payees', 'connections', 'statements', 'history', 'activity'] as const;
type SettingsTab = typeof VALID_TABS[number];

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  // Reactive querystring: wouter's useLocation only tracks location.pathname,
  // so a search-only change (?tab=...) does NOT re-render the component —
  // useSearch() subscribes to location.search itself.
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get('tab');
  const activeTab: SettingsTab = (VALID_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as SettingsTab)
    : 'profile';

  useMobileHeader(() => (
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('Settings')}</span>
  ), []);

  return (
    <div className="space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-semibold">{t('Settings')}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/settings?tab=${v}`)}>
        {/* Mobile: dropdown select */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={(v) => navigate(`/settings?tab=${v}`)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profile">{t('Profile')}</SelectItem>
              <SelectItem value="payees">{t('Payees')}</SelectItem>
              <SelectItem value="connections">{t('Connections')}</SelectItem>
              <SelectItem value="statements">{t('Import Statements')}</SelectItem>
              <SelectItem value="history">{t('Import History')}</SelectItem>
              <SelectItem value="activity">{t('Import Activity')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: underline tabs */}
        <TabsList className="hidden md:flex h-auto p-0 bg-transparent rounded-none border-b border-gray-200 dark:border-gray-700 w-full justify-start gap-0">
          {(['profile', 'payees', 'connections', 'statements', 'history', 'activity'] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent -mb-px px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-primary data-[state=active]:text-gray-900 dark:data-[state=active]:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {t({ profile: 'Profile', payees: 'Payees', connections: 'Connections', statements: 'Import Statements', history: 'Import History', activity: 'Import Activity' }[tab])}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="payees" className="mt-6">
          <PayeesSettings />
        </TabsContent>

        <TabsContent value="connections" className="mt-6">
          <ConnectorsSettings />
        </TabsContent>

        <TabsContent value="statements" className="mt-6">
          <FileImportSettings />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryImportSettings />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ImportHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
