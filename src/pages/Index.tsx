
import { useState } from "react";
import { Header } from "@/components/Header";
import { StorageDashboard } from "@/components/StorageDashboard";
import { AccountManager } from "@/components/AccountManager";
import { FileExplorer } from "@/components/FileExplorer";
import { GoogleAccount } from "@/types/auth";

const Index = () => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'accounts' | 'files'>('dashboard');

  const addAccount = (account: GoogleAccount) => {
    setAccounts(prev => [...prev, account]);
  };

  const removeAccount = (accountId: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== accountId));
  };

  const totalStorage = accounts.reduce((total, acc) => total + acc.totalStorage, 0);
  const usedStorage = accounts.reduce((total, acc) => total + acc.usedStorage, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        activeView={activeView} 
        onViewChange={setActiveView}
        accountCount={accounts.length}
      />
      
      <main className="container mx-auto px-4 py-8">
        {activeView === 'dashboard' && (
          <StorageDashboard 
            accounts={accounts}
            totalStorage={totalStorage}
            usedStorage={usedStorage}
          />
        )}
        
        {activeView === 'accounts' && (
          <AccountManager 
            accounts={accounts}
            onAddAccount={addAccount}
            onRemoveAccount={removeAccount}
          />
        )}
        
        {activeView === 'files' && (
          <FileExplorer accounts={accounts} />
        )}
      </main>
    </div>
  );
};

export default Index;
