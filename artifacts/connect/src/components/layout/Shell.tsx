import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  Video, 
  Lightbulb,
  Search,
  Bell,
  LogOut,
  Settings,
  Heart,
  Map,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface ShellProps {
  children: React.ReactNode;
}

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
  { name: 'People', href: '/people', icon: Users, adminOnly: false },
  { name: 'Events', href: '/events', icon: CalendarDays, adminOnly: false },
  { name: 'Virtual Meetings', href: '/virtual-meetings', icon: Video, adminOnly: false },
  { name: 'Suggestions Hub', href: '/suggestions', icon: Lightbulb, adminOnly: false },
  { name: 'Engagement Map', href: '/map', icon: Map, adminOnly: false },
  { name: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
];

// Generates a warm, consistent color per user from their initials
const avatarPalette = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
];

function userInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
}

function NavLinks({
  isAdmin,
  location,
  onNavigate,
}: {
  isAdmin: boolean;
  location: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-0.5 px-3">
      {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const isActive =
          item.href === '/' ? location === '/' : location.startsWith(item.href);
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              isActive
                ? 'bg-primary/10 text-primary shadow-none'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            )}
          >
            <item.icon
              className={cn(
                'h-4 w-4 shrink-0',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();
  const { user, isAdmin } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayName = user?.name ?? 'Unknown';
  const displayRole =
    user?.role === 'admin'
      ? 'Admin'
      : user?.role === 'leader'
        ? 'Leader'
        : 'Staff';

  const initials = userInitials(displayName);
  const avatarCls = avatarColor(displayName);

  return (
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
        {/* Brand header */}
        <div className="flex h-16 items-center px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-sm">
              <Heart className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight font-display text-foreground leading-none">
                Leadership
              </div>
              <div className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase leading-none mt-0.5">
                Connect
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-auto py-5">
          <NavLinks isAdmin={isAdmin} location={location} />
        </div>

        {/* User card + sign-out */}
        <div className="p-4 border-t border-border space-y-1">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <div
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0',
                avatarCls,
              )}
            >
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-none text-foreground truncate">
                {displayName}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5 truncate">{displayRole}</span>
            </div>
          </div>
          <a
            href="/api/auth/logout"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </a>
        </div>
      </aside>

      {/* ── Mobile drawer backdrop ───────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer panel ──────────────────────────────── */}
      <div
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-sidebar border-r border-border',
          'transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Drawer header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-sm">
              <Heart className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight font-display text-foreground leading-none">
                Leadership
              </div>
              <div className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase leading-none mt-0.5">
                Connect
              </div>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer nav */}
        <div className="flex-1 overflow-auto py-5">
          <NavLinks
            isAdmin={isAdmin}
            location={location}
            onNavigate={() => setDrawerOpen(false)}
          />
        </div>

        {/* Drawer user card + sign-out */}
        <div className="p-4 border-t border-border space-y-1 shrink-0">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <div
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0',
                avatarCls,
              )}
            >
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-none text-foreground truncate">
                {displayName}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5 truncate">{displayRole}</span>
            </div>
          </div>
          <a
            href="/api/auth/logout"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </a>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card/60 backdrop-blur-sm z-10 sticky top-0">
          {/* Mobile: hamburger + brand */}
          <div className="md:hidden flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-sm">
                <Heart className="h-3.5 w-3.5" />
              </div>
              <span className="font-bold text-sm tracking-tight font-display text-foreground">
                Connect
              </span>
            </div>
          </div>

          {/* Desktop: search */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search people, events, meetings..."
                className="w-full bg-muted/60 border border-transparent rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-card" />
            </button>
            {/* Mobile: avatar only (name/sign-out live in the drawer) */}
            <div
              className={cn(
                'md:hidden h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs cursor-pointer',
                avatarCls,
              )}
              onClick={() => setDrawerOpen(true)}
              title="Open menu"
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
