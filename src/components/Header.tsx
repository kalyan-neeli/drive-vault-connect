
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  activeView: 'dashboard' | 'accounts' | 'files';
  onViewChange: (view: 'dashboard' | 'accounts' | 'files') => void;
  accountCount: number;
  onSignOut: () => void;
}

export const Header = ({ activeView, onViewChange, accountCount, onSignOut }: HeaderProps) => {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">DS</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">DriveSync</h1>
          </div>
          
          <nav className="flex items-center space-x-1">
            <Button
              variant={activeView === 'dashboard' ? 'default' : 'ghost'}
              onClick={() => onViewChange('dashboard')}
              className="relative"
            >
              Dashboard
            </Button>
            
            <Button
              variant={activeView === 'accounts' ? 'default' : 'ghost'}
              onClick={() => onViewChange('accounts')}
              className="relative"
            >
              Accounts
              {accountCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {accountCount}
                </Badge>
              )}
            </Button>
            
            <Button
              variant={activeView === 'files' ? 'default' : 'ghost'}
              onClick={() => onViewChange('files')}
            >
              Files
            </Button>

            <Button
              variant="outline"
              onClick={onSignOut}
              className="ml-4"
            >
              Sign Out
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
};
