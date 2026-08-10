import React, { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  useGetPerson, useGetPersonEngagement, useUpdatePerson, useDeletePerson,
  useCreateVirtualMeeting, useAddVirtualMeetingParticipant, useListPeople,
  getGetPersonQueryKey, getGetPersonEngagementQueryKey,
  getListPeopleQueryKey, getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';
import { Mail, MapPin, Building2, Calendar, Video, Clock, Trash2, UserCircle2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { PersonForm, type PersonFormValues } from '@/components/forms/PersonForm';
import { VirtualMeetingForm, type VirtualMeetingFormValues } from '@/components/forms/VirtualMeetingForm';
import { ConfirmDialog } from '@/components/forms/ConfirmDialog';
import { useAuth } from '@/lib/auth';

function RoleBadge({ role }: { role: string }) {
  if (role === 'executive') return <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase tracking-wider">Executive</span>;
  if (role === 'secondary_leader') return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 uppercase tracking-wider">Leader</span>;
  return <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 uppercase tracking-wider">Staff</span>;
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const personId = parseInt(id ?? '0', 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showEdit, setShowEdit] = useState(false);
  const [showTouchpoint, setShowTouchpoint] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { isAdmin } = useAuth();

  const { data: person, isLoading: loadingPerson } = useGetPerson(personId, {
    query: { enabled: !!personId, queryKey: getGetPersonQueryKey(personId) },
  });

  // Manager + direct reports
  const { data: allPeople } = useListPeople({}, {
    query: { enabled: !!person, staleTime: 60_000 } as any,
  });
  const manager = allPeople?.find(p => p.id === (person as any)?.managerId) ?? null;
  const directReports = allPeople?.filter(p => (p as any).managerId === personId) ?? [];
  const { data: engagement, isLoading: loadingEngagement } = useGetPersonEngagement(personId, {
    query: { enabled: !!personId, queryKey: getGetPersonEngagementQueryKey(personId) },
  });

  const updatePerson = useUpdatePerson({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(personId) });
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        setShowEdit(false);
        toast({ title: 'Profile updated' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to update profile.' }),
    },
  });

  const deletePerson = useDeletePerson({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: 'Person removed' });
        setLocation('/people');
      },
      onError: () => toast({ title: 'Error', description: 'Failed to delete person.' }),
    },
  });

  const createMeeting = useCreateVirtualMeeting();
  const addParticipant = useAddVirtualMeetingParticipant();

  const handleLogTouchpoint = async (values: VirtualMeetingFormValues) => {
    try {
      const meeting = await createMeeting.mutateAsync({
        data: {
          title: values.title,
          scheduledDate: values.scheduledDate || undefined,
          status: 'completed',
          hostId: values.hostId ? parseInt(values.hostId) : undefined,
          notes: values.notes || undefined,
        } as any,
      });
      await addParticipant.mutateAsync({ id: (meeting as any).id, data: { personId } });
      queryClient.invalidateQueries({ queryKey: getGetPersonEngagementQueryKey(personId) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setShowTouchpoint(false);
      toast({ title: 'Touchpoint logged', description: 'Engagement recorded successfully.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to log touchpoint.' });
    }
  };

  if (loadingPerson || loadingEngagement) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading profile…</div>;
  }
  if (!person || !engagement) return <div className="p-8 text-center text-destructive">Person not found.</div>;

  const isBusy = createMeeting.isPending || addParticipant.isPending;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/people" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to People
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
        <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between">
          <div className="flex gap-6 items-center md:items-start">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-3xl shrink-0 border-4 border-card shadow-sm">
              {person.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
            </div>
            <div className="space-y-2">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground">{person.name}</h1>
                <p className="text-lg text-muted-foreground font-medium">{person.title ?? 'No Title'}</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                <RoleBadge role={person.role} />
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  <MapPin className="h-3.5 w-3.5" /> {person.homeCity}, {person.homeState}
                </div>
                {person.department && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                    <Building2 className="h-3.5 w-3.5" /> {person.department}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  <Mail className="h-3.5 w-3.5" /> {person.email}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            {isAdmin && (
              <button
                onClick={() => setShowEdit(true)}
                className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
              >
                Edit Profile
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowTouchpoint(true)}
                className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
              >
                Log Touchpoint
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowDelete(true)}
                className="px-4 py-2 bg-card border border-red-200 text-red-600 font-medium rounded-md hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {person.notes && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{person.notes}</p>
          </div>
        )}
      </div>

      {/* Manager + Direct Reports */}
      {(manager || directReports.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {manager && (
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                <UserCircle2 className="h-3.5 w-3.5" /> Reports To
              </div>
              <Link href={`/people/${manager.id}`} className="flex items-center gap-3 group">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {manager.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </div>
                <div>
                  <div className="font-medium text-sm text-foreground group-hover:underline">{manager.name}</div>
                  <div className="text-xs text-muted-foreground">{manager.title ?? 'No title'}</div>
                </div>
              </Link>
            </div>
          )}
          {directReports.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                <Users className="h-3.5 w-3.5" /> Direct Reports ({directReports.length})
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {directReports.map(dr => (
                  <Link key={dr.id} href={`/people/${dr.id}`} className="flex items-center gap-3 group">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {dr.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-foreground group-hover:underline">{dr.name}</div>
                      <div className="text-xs text-muted-foreground">{dr.title ?? 'No title'}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Engagement Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-sm">Last Touchpoint</span>
          </div>
          <div className="text-2xl font-display font-bold">
            {engagement.daysSinceLastTouchpoint !== null ? (
              <span className={engagement.daysSinceLastTouchpoint > 90 ? 'text-destructive' : ''}>
                {engagement.daysSinceLastTouchpoint} days ago
              </span>
            ) : (
              <span className="text-muted-foreground text-xl">Never</span>
            )}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <MapPin className="h-5 w-5 text-indigo-500" />
            <span className="font-medium text-sm">In-Person Events</span>
          </div>
          <div className="text-2xl font-display font-bold">
            {engagement.totalInPersonAttended ?? 0} <span className="text-sm text-muted-foreground font-normal">attended</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Video className="h-5 w-5 text-purple-500" />
            <span className="font-medium text-sm">Virtual Meetings</span>
          </div>
          <div className="text-2xl font-display font-bold">
            {engagement.totalVirtualCompleted ?? 0} <span className="text-sm text-muted-foreground font-normal">completed</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Events History */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Event Invitations
          </h2>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {engagement.invitations.length > 0 ? (
              <div className="divide-y divide-border">
                {engagement.invitations.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-start justify-between hover:bg-muted/30 transition-colors">
                    <div>
                      <Link href={`/events/${inv.eventId}`} className="font-semibold text-foreground hover:underline">
                        {inv.event?.name}
                      </Link>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        {inv.event?.startDate && format(new Date(inv.event.startDate), 'MMM d, yyyy')}
                        <span>·</span>
                        {inv.event?.location}
                      </div>
                    </div>
                    <div className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-full border',
                      inv.status === 'attended' ? 'bg-green-50 text-green-700 border-green-200' :
                      inv.status === 'invited' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      inv.status === 'declined' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                      'bg-red-50 text-red-700 border-red-200'
                    )}>
                      {inv.status.replace('_', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No event invitations recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Virtual Meetings History */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Video className="h-5 w-5" /> Virtual Meetings
          </h2>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {engagement.virtualMeetings.length > 0 ? (
              <div className="divide-y divide-border">
                {engagement.virtualMeetings.map((vm) => (
                  <div key={vm.id} className="p-4 flex items-start justify-between hover:bg-muted/30 transition-colors">
                    <div>
                      <Link href={`/virtual-meetings/${vm.id}`} className="font-semibold text-foreground hover:underline">
                        {vm.title}
                      </Link>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        {vm.scheduledDate ? format(new Date(vm.scheduledDate), 'MMM d, yyyy') : 'Unscheduled'}
                        {vm.host && <><span>·</span>Hosted by {vm.host.name}</>}
                      </div>
                    </div>
                    <div className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-full border',
                      vm.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                      vm.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      vm.status === 'suggested' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-100 text-slate-700 border-slate-200'
                    )}>
                      {vm.status}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No virtual meetings recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <PersonForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSubmit={(values) => updatePerson.mutate({ id: personId, data: values as any })}
        isPending={updatePerson.isPending}
        defaultValues={person}
        mode="edit"
      />

      <VirtualMeetingForm
        open={showTouchpoint}
        onClose={() => setShowTouchpoint(false)}
        onSubmit={handleLogTouchpoint}
        isPending={isBusy}
        defaultTitle={`Check-in with ${person.name}`}
      />

      <ConfirmDialog
        open={showDelete}
        title={`Remove ${person.name}?`}
        description="This will permanently delete the person and all their engagement history. This cannot be undone."
        confirmLabel="Remove Person"
        isPending={deletePerson.isPending}
        onConfirm={() => deletePerson.mutate({ id: personId })}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
