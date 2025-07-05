
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { GoogleAuthService, GoogleAccount } from "@/services/googleAuth";

interface AccountManagerProps {
  accounts: GoogleAccount[];
  onAccountsChange: () => void;
}

export const AccountManager = ({ accounts, onAccountsChange }: AccountManagerProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [googleAuth] = useState(new GoogleAuthService());

  const handleAddAccount = async () => {
    setLoading(true);
    try {
      await googleAuth.connectAccount();
      onAccountsChange();
      toast({
        title: "Account Connected",
        description: "Successfully connected your Google account",
      });
    } catch (error) {
      console.error('Error connecting account:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect Google account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    try {
      await googleAuth.removeAccount(accountId);
      onAccountsChange();
      toast({
        title: "Account Removed",
        description: "Successfully disconnected the account",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove account",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Management</h2>
        <p className="text-gray-600">Add or remove Google accounts to manage your aggregated storage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Google Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleAddAccount}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Connecting...' : 'Connect Google Account'}
          </Button>
        </CardContent>
      </Card>

      {accounts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Connected Accounts</h3>
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {account.avatar ? (
                      <img 
                        src={account.avatar} 
                        alt={account.name}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {account.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold">{account.name}</h4>
                      <p className="text-sm text-gray-600">{account.email}</p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(account.usedStorage)} of {formatBytes(account.totalStorage)} used
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleRemoveAccount(account.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
