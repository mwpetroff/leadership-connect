import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  useListPeople, useCreatePerson, useUpdatePerson,
  getListPeopleQueryKey,
} from '@workspace/api-client-react';
import { Search, Filter, MapPin, Building2, Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { PersonForm, type PersonFormValues } from '@/components/forms/PersonForm';
import type { PersonRole, Person } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

function RoleBadge({ role }: { role: string }) {
  if (role === 'executive') return <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase tracking-wider">Executive</span>;
  if (role === 'secondary_leader') return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 uppercase tracking-wider">Leader</span>;
  return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 uppercase tracking-wider">Staff</span>;
}

export default function PeopleDirectory() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<PersonRole | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: people, isLoading } = useListPeople(
    { search, role: roleFilter },
    { query: { keepPreviousData: true } as any }
  );

  const createPerson = useCreatePerson({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        setShowAdd(false);
        toast({ title: 'Person added', description: 'Profile created successfully.' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to create person.' }),
    },
  });

  const updatePerson = useUpdatePerson({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        setEditPerson(null);
        toast({ title: 'Profile updated' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to update person.' }),
    },
  });

  const handleCreate = (values: PersonFormValues) => {
    createPerson.mutate({ data: values as any });
  };

  const handleEdit = (values: PersonFormValues) => {
    if (!editPerson) return;
    updatePerson.mutate({ id: editPerson.id, data: values as any });
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">People Directory</h1>
          <p className="text-muted-foreground mt-1">Search and filter all team members.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Person
          </button>
        )}
      </div>

      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-transparent rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="bg-muted/50 border border-transparent rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            value={roleFilter ?? ''}
            onChange={(e) => setRoleFilter(e.target.value ? e.target.value as PersonRole : undefined)}
          >
            <option value="">All Roles</option>
            <option value="executive">Executives</option>
            <option value="secondary_leader">Secondary Leaders</option>
            <option value="staff">Staff</option>
          </select>
        </div>
      </div>

      {isLoading && !people ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Role</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Department</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people?.map((person) => (
                  <tr key={person.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {person.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <Link href={`/people/${person.id}`} className="font-medium text-foreground hover:underline block">
                            {person.name}
                          </Link>
                          <div className="text-xs text-muted-foreground mt-0.5">{person.title ?? 'No title'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><RoleBadge role={person.role} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {person.department ?? 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {person.homeCity}, {person.homeState}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => setEditPerson(person)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Link
                          href={`/people/${person.id}`}
                          className="px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-medium rounded hover:bg-secondary/80"
                        >
                          View Profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {people?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      No people found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PersonForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleCreate}
        isPending={createPerson.isPending}
        mode="create"
      />

      <PersonForm
        open={!!editPerson}
        onClose={() => setEditPerson(null)}
        onSubmit={handleEdit}
        isPending={updatePerson.isPending}
        defaultValues={editPerson ?? undefined}
        mode="edit"
      />
    </div>
  );
}
