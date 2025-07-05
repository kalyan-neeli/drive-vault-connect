
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GoogleAccount } from "@/types/auth";
import { formatBytes } from "@/utils/formatBytes";

interface StorageDashboardProps {
  accounts: GoogleAccount[];
  totalStorage: number;
  usedStorage: number;
}

export const StorageDashboard = ({ accounts, totalStorage, usedStorage }: StorageDashboardProps) => {
  const storagePercentage = totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Storage Overview</h2>
        <p className="text-gray-600">Manage your aggregated Google Drive storage across multiple accounts</p>
      </div>

      {accounts.length === 0 ? (
        <Card className="text-center p-8">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">📱</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">No Google Accounts Connected</h3>
            <p className="text-gray-600 mb-4">
              Connect your Google accounts to start aggregating your Drive storage
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Total Storage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Used: {formatBytes(usedStorage)}</span>
                  <span>Total: {formatBytes(totalStorage)}</span>
                </div>
                <Progress value={storagePercentage} className="h-2" />
                <p className="text-center text-sm text-gray-600">
                  {formatBytes(totalStorage - usedStorage)} available
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <Card key={account.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    {account.avatar ? (
                      <img 
                        src={account.avatar} 
                        alt={account.name}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">
                          {account.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm truncate">{account.name}</CardTitle>
                      <p className="text-xs text-gray-600 truncate">{account.email}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>{formatBytes(account.usedStorage)}</span>
                      <span>{formatBytes(account.totalStorage)}</span>
                    </div>
                    <Progress 
                      value={(account.usedStorage / account.totalStorage) * 100} 
                      className="h-1"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
