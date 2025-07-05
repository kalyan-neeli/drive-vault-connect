
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { StorageDashboard } from "@/components/StorageDashboard";
import { AccountManager } from "@/components/AccountManager";
import { FileExplorer } from "@/components/FileExplorer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { GoogleAuthService, GoogleAccount } from "@/services/googleAuth";

const Index = () => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'accounts' | 'files'>('dashboard');
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [googleAuth] = useState(new GoogleAuthService());

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    loadAccounts();
  }, [user, navigate]);

  const loadAccounts = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const connectedAccounts = await googleAuth.getConnectedAccounts();
      setAccounts(connectedAccounts);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to continue</h1>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading your accounts...</p>
        </div>
      </div>
    );
  }

  const totalStorage = accounts.reduce((total, acc) => total + acc.totalStorage, 0);
  const usedStorage = accounts.reduce((total, acc) => total + acc.usedStorage, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        activeView={activeView} 
        onViewChange={setActiveView}
        accountCount={accounts.length}
        onSignOut={handleSignOut}
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
            onAccountsChange={loadAccounts}
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
