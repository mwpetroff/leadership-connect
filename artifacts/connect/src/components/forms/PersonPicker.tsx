import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useListPeople, getListPeopleQueryKey } from '@workspace/api-client-react';
import { Search } from 'lucide-react';
import type { Person } from '@workspace/api-client-react';

type PersonRole = 'executive' | 'secondary_leader' | 'staff';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (person: Person) => void;
  title: string;
  description?: string;
  excludeIds?: number[];
  roleFilter?: PersonRole;
  multiRole?: PersonRole[];
}

export function PersonPicker({
  open, onClose, onSelect, title, description,
  excludeIds = [], roleFilter, multiRole,
}: Props) {
  const [search, setSearch] = useState('');

  // When multiRole is provided we fetch all and filter client-side, because the
  // API only accepts a single role parameter.
  const peopleParams = { search, role: multiRole ? undefined : roleFilter };
  const { data: people, isLoading } = useListPeople(
    peopleParams,
    { query: { enabled: open, queryKey: getListPeopleQueryKey(peopleParams) } },
  );

  const filtered = (people ?? []).filter(
    (p) =>
      !excludeIds.includes(p.id) &&
      (multiRole ? multiRole.includes(p.role as PersonRole) : true)
  );

  const roleLabel: Record<string, string> = {
    executive: 'Executive',
    secondary_leader: 'Leader',
    staff: 'Staff',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </div>

        <div className="max-h-72 overflow-y-auto -mx-6 px-2 divide-y divide-border">
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No people found.</div>
          )}
          {filtered.map((person) => (
            <button
              key={person.id}
              onClick={() => { onSelect(person); onClose(); setSearch(''); }}
              className="w-full text-left py-3 px-4 flex items-center gap-3 hover:bg-muted/50 rounded-md transition-colors"
            >
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {person.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground text-sm">{person.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {person.title ?? 'No title'} · {person.homeCity}, {person.homeState}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {roleLabel[person.role] ?? person.role}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
