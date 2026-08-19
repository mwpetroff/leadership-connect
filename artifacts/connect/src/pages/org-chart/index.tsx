import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ChevronRight, ChevronDown, Search, Users, GitBranch } from 'lucide-react';
import { useScope } from '@/lib/scope';
import { cn } from '@/lib/utils';

interface OrgNode {
  id: number;
  name: string;
  title: string | null;
  role: string;
  department: string | null;
  homeCity: string;
  homeState: string;
  email: string;
  managerId: number | null;
  hrbpId: number | null;
  hrbpName: string | null;
  muted: boolean;
  children: OrgNode[];
}

interface OrgChartResponse {
  nodes: OrgNode[];
  total: number;
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  executive:        { label: 'Executive',  bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  secondary_leader: { label: 'Leader',     bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  staff:            { label: 'Staff',      bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-400' },
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function avatarBg(role: string) {
  if (role === 'executive') return 'bg-amber-100 text-amber-700';
  if (role === 'secondary_leader') return 'bg-violet-100 text-violet-700';
  return 'bg-sky-100 text-sky-700';
}

/** Check if `node` or any descendant matches the search term */
function nodeMatchesSearch(node: OrgNode, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  if (
    node.name.toLowerCase().includes(lq) ||
    (node.title ?? '').toLowerCase().includes(lq) ||
    (node.department ?? '').toLowerCase().includes(lq)
  ) return true;
  return node.children.some(c => nodeMatchesSearch(c, q));
}

interface TreeNodeProps {
  node: OrgNode;
  depth: number;
  search: string;
  defaultOpen?: boolean;
}

function TreeNode({ node, depth, search, defaultOpen = false }: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const rc = ROLE_CONFIG[node.role] ?? ROLE_CONFIG.staff;
  const hasChildren = node.children.length > 0;

  const visibleChildren = search
    ? node.children.filter(c => nodeMatchesSearch(c, search))
    : node.children;

  const selfMatches = !search || (
    node.name.toLowerCase().includes(search.toLowerCase()) ||
    (node.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (node.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (search && !nodeMatchesSearch(node, search)) return null;

  return (
    <div className={cn('relative', depth > 0 && 'ml-6 pl-4 border-l border-border/60')}>
      <div className={cn(
        'group flex items-center gap-3 py-2 px-3 rounded-xl transition-colors hover:bg-muted/50',
        node.muted && 'opacity-60',
        search && selfMatches && 'bg-primary/5',
      )}>
        {/* Expand toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          className={cn(
            'shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground transition-colors',
            hasChildren ? 'hover:bg-muted hover:text-foreground cursor-pointer' : 'opacity-0 cursor-default',
          )}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Avatar */}
        <div className={cn('h-9 w-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0', avatarBg(node.role))}>
          {initials(node.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/people/${node.id}`}
            className="font-semibold text-sm text-foreground hover:underline block truncate"
          >
            {node.name}
          </Link>
          <div className="text-xs text-muted-foreground truncate">
            {node.title ?? 'No title'}
            {node.department && <> · {node.department}</>}
          </div>
        </div>

        {node.muted && node.hrbpName && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            HRBP: {node.hrbpName}
          </span>
        )}
        <span className={cn('shrink-0 text-xs font-medium px-2 py-0.5 rounded-full', rc.bg, rc.text)}>
          {rc.label}
        </span>

        {/* Reports count */}
        {hasChildren && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {node.children.length} report{node.children.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Children */}
      {open && visibleChildren.length > 0 && (
        <div className="mt-1 space-y-1">
          {visibleChildren.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              search={search}
              defaultOpen={!!search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoxNode({ node }: { node: OrgNode }) {
  const rc = ROLE_CONFIG[node.role] ?? ROLE_CONFIG.staff;
  return (
    <div className="flex flex-col items-center">
      <Link
        href={`/people/${node.id}`}
        className={cn(
          'min-w-[160px] max-w-[200px] rounded-xl border px-3 py-2 text-center shadow-sm bg-card',
          node.muted ? 'border-dashed opacity-60' : 'border-border',
        )}
      >
        <div className="text-sm font-semibold truncate">{node.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{node.title ?? 'No title'}</div>
        <div className={cn('mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full', rc.bg, rc.text)}>
          {rc.label}
        </div>
        {node.muted && node.hrbpName && (
          <div className="text-[10px] text-muted-foreground mt-1">HRBP: {node.hrbpName}</div>
        )}
      </Link>
      {node.children.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-6 border-t border-border/60 pt-4">
          {node.children.map((c) => <BoxNode key={c.id} node={c} />)}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'tree' | 'boxes'>('tree');
  const { queryString } = useScope();

  const { data, isLoading } = useQuery<OrgChartResponse>({
    queryKey: ['org-chart', queryString],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/org-chart?${queryString}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load org chart');
      return res.json();
    },
  });

  const visibleRoots = useMemo(() => {
    if (!data) return [];
    if (!search) return data.nodes;
    return data.nodes.filter(n => nodeMatchesSearch(n, search));
  }, [data, search]);

  // Count nodes that have no manager set
  const unmappedCount = useMemo(() => {
    if (!data) return 0;
    return data.nodes.filter(n => n.managerId === null && n.children.length === 0).length;
  }, [data]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-primary" />
            Org Chart
          </h1>
          <p className="text-muted-foreground mt-1">
            Reporting structure across the organisation.
            {data && <> {data.total} people in focus.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setView('tree')} className={cn('px-3 py-1.5 rounded-lg text-sm', view === 'tree' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>Tree</button>
          <button type="button" onClick={() => setView('boxes')} className={cn('px-3 py-1.5 rounded-lg text-sm', view === 'boxes' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>Boxes</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, title, or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-transparent rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
        />
      </div>

      {unmappedCount > 0 && !search && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Users className="h-4 w-4 text-amber-500 shrink-0" />
          {unmappedCount} {unmappedCount === 1 ? 'person has' : 'people have'} no manager assigned — they appear as top-level entries.
          Set a manager in their profile to place them in the hierarchy.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visibleRoots.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto opacity-20 mb-3" />
          <p>{search ? 'No people match your search.' : 'No org chart data yet. Add people and assign managers to build the hierarchy.'}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm overflow-x-auto">
          {view === 'boxes' ? (
            <div className="flex flex-wrap justify-center gap-8 py-4">
              {visibleRoots.map(node => <BoxNode key={node.id} node={node} />)}
            </div>
          ) : (
            <div className="space-y-1">
              {visibleRoots.map(node => (
                <TreeNode key={node.id} node={node} depth={0} search={search} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
