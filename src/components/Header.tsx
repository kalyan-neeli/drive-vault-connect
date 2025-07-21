
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

interface HeaderProps {
  activeView: 'dashboard' | 'accounts' | 'files';
  onViewChange: (view: 'dashboard' | 'accounts' | 'files') => void;
  accountCount: number;
  onSignOut: () => void;
}

export const Header = ({ activeView, onViewChange, accountCount, onSignOut }: HeaderProps) => {
  const NavigationContent = () => (
    <>
      <Button
        variant={activeView === 'dashboard' ? 'default' : 'ghost'}
        onClick={() => onViewChange('dashboard')}
        className="relative w-full sm:w-auto justify-start sm:justify-center"
      >
        Dashboard
      </Button>
      
      <Button
        variant={activeView === 'accounts' ? 'default' : 'ghost'}
        onClick={() => onViewChange('accounts')}
        className="relative w-full sm:w-auto justify-start sm:justify-center"
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
        className="w-full sm:w-auto justify-start sm:justify-center"
      >
        Files
      </Button>

      <Button
        variant="outline"
        onClick={onSignOut}
        className="w-full sm:w-auto justify-start sm:justify-center sm:ml-4"
      >
        Sign Out
      </Button>
    </>
  );

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
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            <NavigationContent />
          </nav>

          {/* Mobile Navigation */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="flex flex-col space-y-4 mt-8">
                <NavigationContent />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
