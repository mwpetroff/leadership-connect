import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  Video, 
  Lightbulb,
  Search,
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShellProps {
  children: React.ReactNode;
}

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'People', href: '/people', icon: Users },
  { name: 'Events', href: '/events', icon: CalendarDays },
  { name: 'Virtual Meetings', href: '/virtual-meetings', icon: Video },
  { name: 'Suggestions Hub', href: '/suggestions', icon: Lightbulb },
];

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight font-display text-primary">
            <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm">
              L
            </div>
            Connect
          </div>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => {
              // Basic active logic: exact match for root, prefix match for others
              const isActive = item.href === '/' 
                ? location === '/' 
                : location.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-xs">
              JS
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none text-foreground">John Smith</span>
              <span className="text-xs text-muted-foreground mt-1">VP Operations</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0">
          <div className="md:hidden flex items-center gap-2 font-bold text-xl tracking-tight font-display text-primary">
            <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm">
              L
            </div>
            Connect
          </div>
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input 
                type="search" 
                placeholder="Search people, events, meetings..." 
                className="w-full bg-muted/50 border border-transparent rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive border-2 border-card"></span>
            </button>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
