import React from 'react';
import AccountList from '@/components/accounts/account-list';

const Accounts: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Manage your financial accounts</p>
      </div> */}

      <AccountList />
    </div>
  );
};

export default Accounts;
