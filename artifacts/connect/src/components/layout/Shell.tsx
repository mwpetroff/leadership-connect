import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
  GitBranch,
  User,
  MapPin,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScopeBar } from '@/components/layout/ScopeBar';
import { useScope } from '@/lib/scope';
import { useAuth } from '@/lib/auth';

interface ShellProps {
  children: React.ReactNode;
}

const navItems = [
  { name: 'Dashboard',       href: '/',                icon: LayoutDashboard, roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'People',          href: '/people',           icon: Users,           roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Org Chart',       href: '/org-chart',        icon: GitBranch,       roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Events',          href: '/events',           icon: CalendarDays,    roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Virtual Meetings',href: '/virtual-meetings', icon: Video,           roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Suggestions Hub', href: '/suggestions',      icon: Lightbulb,       roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Engagement Map',  href: '/map',              icon: Map,             roles: ['admin', 'hrbp', 'leader', 'staff'] },
  { name: 'Settings',        href: '/settings',         icon: Settings,        roles: ['admin', 'hrbp']  },
];

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

function userInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
}

function NavLinks({ role, location, onNavigate }: {
  role: string; location: string; onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-0.5 px-3">
      {navItems.filter(item => item.roles.includes(role)).map(item => {
        const isActive = item.href === '/' ? location === '/' : location.startsWith(item.href);
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            )}
          >
            <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandLogo({ orgName }: { orgName?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-sm shrink-0">
        <Heart className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="font-bold text-base tracking-tight font-display text-foreground leading-none truncate">
          {orgName ?? 'Leadership'}
        </div>
        <div className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase leading-none mt-0.5">
          Touchpoint
        </div>
      </div>
    </div>
  );
}

function UserCard({ initials, avatarCls, displayName, displayRole }: {
  initials: string; avatarCls: string; displayName: string; displayRole: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2">
      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0', avatarCls)}>
        {initials}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold leading-none text-foreground truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground mt-0.5 truncate">{displayRole}</span>
      </div>
    </div>
  );
}

// ── Search types ────────────────────────────────────────────────────────────────

interface SearchPerson {
  id: number;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  role: string;
}

interface SearchEvent {
  id: number;
  name: string;
  location: string;
  startDate: string;
  eventType: string;
}

interface SearchMeeting {
  id: number;
  title: string;
  status: string;
  scheduledDate: string | null;
  notes: string | null;
}

interface SearchResults {
  people: SearchPerson[];
  events: SearchEvent[];
  virtualMeetings: SearchMeeting[];
}

type FlatResult =
  | { kind: 'person';  item: SearchPerson }
  | { kind: 'event';   item: SearchEvent }
  | { kind: 'meeting'; item: SearchMeeting };

function flattenResults(results: SearchResults): FlatResult[] {
  return [
    ...results.people.map(item => ({ kind: 'person' as const, item })),
    ...results.events.map(item => ({ kind: 'event' as const, item })),
    ...results.virtualMeetings.map(item => ({ kind: 'meeting' as const, item })),
  ];
}

function resultHref(r: FlatResult): string {
  if (r.kind === 'person')  return `/people/${r.item.id}`;
  if (r.kind === 'event')   return `/events/${r.item.id}`;
  return `/virtual-meetings/${r.item.id}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ── Global search bar ───────────────────────────────────────────────────────────

function GlobalSearch({ autoFocus = false, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { queryString } = useScope();

  // Debounced query for the API call
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery<SearchResults>({
    queryKey: ['search', debouncedQ, queryString],
    queryFn: async () => {
      if (!debouncedQ.trim()) return { people: [], events: [], virtualMeetings: [] };
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/search?q=${encodeURIComponent(debouncedQ)}&${queryString}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQ.trim().length > 0,
    staleTime: 10_000,
  });

  const flat = results ? flattenResults(results) : [];
  const hasResults = flat.length > 0;
  const totalCount =
    (results?.people.length ?? 0) +
    (results?.events.length ?? 0) +
    (results?.virtualMeetings.length ?? 0);
  const showDropdown = open && query.trim().length > 0;

  // Reset active index when results change
  useEffect(() => { setActiveIdx(-1); }, [debouncedQ]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = useCallback((r: FlatResult) => {
    navigate(resultHref(r));
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
    onNavigate?.();
  }, [navigate, onNavigate]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i < flat.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i > 0 ? i - 1 : flat.length - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && flat[activeIdx]) {
        e.preventDefault();
        selectResult(flat[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  }

  // Group results for display
  const groups: { label: string; kind: FlatResult['kind']; items: FlatResult[] }[] = [];
  if (results?.people.length)
    groups.push({ label: 'People', kind: 'person', items: results.people.map(item => ({ kind: 'person' as const, item })) });
  if (results?.events.length)
    groups.push({ label: 'Events', kind: 'event', items: results.events.map(item => ({ kind: 'event' as const, item })) });
  if (results?.virtualMeetings.length)
    groups.push({ label: 'Virtual Meetings', kind: 'meeting', items: results.virtualMeetings.map(item => ({ kind: 'meeting' as const, item })) });

  // Build a flat index map for keyboard nav
  let flatIdx = 0;
  const groupsWithIdx = groups.map(g => ({
    ...g,
    items: g.items.map(r => ({ r, idx: flatIdx++ })),
  }));

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search people, events, meetings…"
        className="w-full bg-muted/60 border border-transparent rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label="Global search"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        role="combobox"
      />

      {showDropdown && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          role="listbox"
        >
          {isFetching && !hasResults && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          )}

          {!isFetching && debouncedQ && !hasResults && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No matches for <span className="font-medium text-foreground">"{debouncedQ}"</span>
            </div>
          )}

          {groupsWithIdx.map(group => (
            <div key={group.label}>
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              {group.items.map(({ r, idx }) => (
                <button
                  key={`${r.kind}-${r.item.id}`}
                  role="option"
                  aria-selected={activeIdx === idx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={e => { e.preventDefault(); selectResult(r); }}
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-3 py-2 transition-colors',
                    activeIdx === idx ? 'bg-primary/10' : 'hover:bg-muted/60',
                  )}
                >
                  <ResultIcon kind={r.kind} />
                  <ResultBody r={r} />
                </button>
              ))}
            </div>
          ))}

          {hasResults && (
            <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
              {totalCount} result{totalCount !== 1 ? 's' : ''} — ↑↓ to navigate · Enter to open · Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultIcon({ kind }: { kind: FlatResult['kind'] }) {
  if (kind === 'person')  return <User className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />;
  if (kind === 'event')   return <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />;
  return <Video className="h-4 w-4 mt-0.5 shrink-0 text-teal-500" />;
}

function ResultBody({ r }: { r: FlatResult }) {
  if (r.kind === 'person') {
    const p = r.item as SearchPerson;
    return (
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {[p.title, p.department].filter(Boolean).join(' · ') || p.email}
        </div>
      </div>
    );
  }
  if (r.kind === 'event') {
    const e = r.item as SearchEvent;
    return (
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{e.name}</div>
        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          {e.location}
          {e.startDate && <> · {formatDate(e.startDate)}</>}
        </div>
      </div>
    );
  }
  const m = r.item as SearchMeeting;
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium text-foreground truncate">{m.title}</div>
      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
        <Clock className="h-3 w-3 shrink-0" />
        {capitalise(m.status)}
        {m.scheduledDate && <> · {formatDate(m.scheduledDate)}</>}
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────────

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? 'staff';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const { data: settings } = useQuery<{ key: string; value: string }[]>({
    queryKey: ['settings-shell'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/settings`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const orgName = settings?.find(s => s.key === 'org_name' || s.key === 'orgName')?.value;
  const displayName = user?.name ?? 'Unknown';
  const displayRole =
    user?.role === 'admin' ? 'Admin' :
    user?.role === 'hrbp' ? 'HRBP' :
    user?.role === 'leader' ? 'Leader' : 'Staff';
  const initials = userInitials(displayName);
  const avatarCls = avatarColor(displayName);

  return (
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
        <div className="flex h-16 items-center px-5 border-b border-border">
          <BrandLogo orgName={orgName} />
        </div>
        <div className="flex-1 overflow-auto py-5">
          <NavLinks role={role} location={location} />
        </div>
        <div className="p-4 border-t border-border space-y-1">
          <UserCard initials={initials} avatarCls={avatarCls} displayName={displayName} displayRole={displayRole} />
          <a
            href="/api/auth/logout"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </a>
        </div>
      </aside>

      {/* ── Mobile drawer backdrop ──────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ───────────────────────────────── */}
      <div className={cn(
        'md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-sidebar border-r border-border',
        'transition-transform duration-300 ease-in-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-16 items-center justify-between px-5 border-b border-border shrink-0">
          <BrandLogo orgName={orgName} />
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto py-5">
          <NavLinks role={role} location={location} onNavigate={() => setDrawerOpen(false)} />
        </div>
        <div className="p-4 border-t border-border space-y-1 shrink-0">
          <UserCard initials={initials} avatarCls={avatarCls} displayName={displayName} displayRole={displayRole} />
          <a
            href="/api/auth/logout"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </a>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card/60 backdrop-blur-sm z-10 sticky top-0 gap-3">
          {mobileSearchOpen ? (
            <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
                aria-label="Close search"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <GlobalSearch autoFocus onNavigate={() => setMobileSearchOpen(false)} />
              </div>
            </div>
          ) : (
            <div className="md:hidden flex items-center gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <BrandLogo orgName={orgName} />
            </div>
          )}
          <div className="hidden md:flex flex-1 max-w-md">
            <GlobalSearch />
          </div>
          <div className={cn('flex items-center gap-2 ml-auto', mobileSearchOpen && 'hidden md:flex')}>
            <button
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-card" />
            </button>
            <div
              className={cn('md:hidden h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs cursor-pointer', avatarCls)}
              onClick={() => setDrawerOpen(true)}
            >
              {initials}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-4">
            <ScopeBar />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
