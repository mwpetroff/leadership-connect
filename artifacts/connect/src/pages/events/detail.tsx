import React, { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  useGetEvent, useListEventLeaders, useListEventInvitations,
  useUpdateInvitation, useUpdateEvent, useDeleteEvent,
  useAddEventLeader, useRemoveEventLeader,
  useCreateInvitation, useDeleteInvitation,
  getGetEventQueryKey, getListEventLeadersQueryKey,
  getListEventInvitationsQueryKey, getListEventsQueryKey,
} from '@workspace/api-client-react';
import { MapPin, Calendar as CalendarIcon, Users, Building, Plus, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { EventForm, type EventFormValues } from '@/components/forms/EventForm';
import { PersonPicker } from '@/components/forms/PersonPicker';
import { ConfirmDialog } from '@/components/forms/ConfirmDialog';
import type { InvitationUpdateStatus } from '@workspace/api-client-react';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id ?? '0', 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'invites' | 'leaders'>('invites');
  const [showEdit, setShowEdit] = useState(false);
  const [showInviteStaff, setShowInviteStaff] = useState(false);
  const [showAddLeader, setShowAddLeader] = useState(false);
  const [deleteInviteId, setDeleteInviteId] = useState<number | null>(null);
  const [removeLeaderId, setRemoveLeaderId] = useState<number | null>(null);
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);

  const { data: event, isLoading: loadingEvent } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) },
  });
  const { data: leaders, isLoading: loadingLeaders } = useListEventLeaders(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventLeadersQueryKey(eventId) },
  });
  const { data: invitations, isLoading: loadingInvites } = useListEventInvitations(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventInvitationsQueryKey(eventId) },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    queryClient.invalidateQueries({ queryKey: getListEventInvitationsQueryKey(eventId) });
    queryClient.invalidateQueries({ queryKey: getListEventLeadersQueryKey(eventId) });
  };

  const updateEvent = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        setShowEdit(false);
        toast({ title: 'Event updated' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to update event.' }),
    },
  });

  const deleteEvent = useDeleteEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        toast({ title: 'Event deleted' });
        setLocation('/events');
      },
      onError: () => toast({ title: 'Error', description: 'Failed to delete event.' }),
    },
  });

  const updateInvite = useUpdateInvitation({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEventInvitationsQueryKey(eventId) }),
    },
  });

  const createInvitation = useCreateInvitation({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: 'Invitation sent' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to send invitation.' }),
    },
  });

  const deleteInvitation = useDeleteInvitation({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setDeleteInviteId(null);
        toast({ title: 'Invitation removed' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to remove invitation.' }),
    },
  });

  const addLeader = useAddEventLeader({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: 'Leader added' });
      },
      onError: () => toast({ title: 'Error', description: 'Already attending or failed to add.' }),
    },
  });

  const removeLeader = useRemoveEventLeader({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setRemoveLeaderId(null);
        toast({ title: 'Leader removed' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to remove leader.' }),
    },
  });

  const invitedIds = invitations?.map((i) => i.personId) ?? [];
  const leaderIds = (leaders as any[])?.map((l: any) => l.id) ?? [];

  if (loadingEvent) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading event…</div>;
  if (!event) return <div className="p-8 text-center text-destructive">Event not found.</div>;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to Events
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between mb-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase tracking-wider">
                {event.eventType}
              </span>
              <span className={cn(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                new Date(event.startDate) > new Date()
                  ? 'bg-green-50 text-green-700 ring-green-600/20'
                  : 'bg-slate-50 text-slate-600 ring-slate-500/10'
              )}>
                {new Date(event.startDate) > new Date() ? 'UPCOMING' : 'PAST'}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{event.name}</h1>
            <p className="text-lg text-muted-foreground max-w-3xl">{event.description ?? 'No description provided.'}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
            >
              Edit Event
            </button>
            <button
              onClick={() => setShowDeleteEvent(true)}
              className="px-4 py-2 bg-card border border-red-200 text-red-600 font-medium rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-6 border-t border-border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><CalendarIcon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Date</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {format(new Date(event.startDate), 'MMMM d, yyyy')}
                {event.endDate && ` – ${format(new Date(event.endDate), 'MMM d, yyyy')}`}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><MapPin className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Location</div>
              <div className="text-sm text-muted-foreground mt-0.5">{event.location}</div>
              <div className="text-xs text-muted-foreground">{event.city}, {event.state}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Building className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Attending Leaders</div>
              <div className="text-sm text-muted-foreground mt-0.5">{event.leaderCount ?? 0} executives/leaders</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Users className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Guest List</div>
              <div className="text-sm text-muted-foreground mt-0.5">{event.inviteeCount ?? 0} invited</div>
              <div className="text-xs text-green-600 font-medium">{event.attendeeCount ?? 0} attended</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border">
        {(['invites', 'leaders'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'pb-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'invites' ? `Staff Invitations (${invitations?.length ?? 0})` : `Attending Leaders (${(leaders as any[])?.length ?? 0})`}
          </button>
        ))}
      </div>

      {activeTab === 'invites' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Staff Invitations</h2>
            <button
              onClick={() => setShowInviteStaff(true)}
              className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
            >
              <Plus className="h-4 w-4" /> Invite Staff
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {loadingInvites ? (
              <div className="p-8 text-center animate-pulse">Loading invitations…</div>
            ) : invitations && invitations.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-3 px-4">
                        <Link href={`/people/${inv.personId}`} className="font-medium text-foreground hover:underline">
                          {inv.person?.name}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-0.5">{inv.person?.title}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {inv.person?.homeCity}, {inv.person?.homeState}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          'inline-flex px-2.5 py-1 text-xs font-medium rounded-full border',
                          inv.status === 'attended' ? 'bg-green-50 text-green-700 border-green-200' :
                          inv.status === 'invited' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          inv.status === 'declined' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        )}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={inv.status}
                            onChange={(e) => updateInvite.mutate({ id: inv.id, data: { status: e.target.value as InvitationUpdateStatus } })}
                            disabled={updateInvite.isPending}
                            className="text-xs bg-card border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                          >
                            <option value="invited">Invited</option>
                            <option value="attended">Attended</option>
                            <option value="no_show">No Show</option>
                            <option value="declined">Declined</option>
                          </select>
                          <button
                            onClick={() => setDeleteInviteId(inv.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-600 transition-all rounded"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                No staff have been invited to this event yet.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'leaders' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Attending Leaders</h2>
            <button
              onClick={() => setShowAddLeader(true)}
              className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Leader
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {loadingLeaders ? (
              <div className="col-span-full p-8 text-center animate-pulse">Loading leaders…</div>
            ) : (leaders as any[])?.length > 0 ? (
              (leaders as any[]).map((leader: any) => (
                <div key={leader.id} className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4 group relative">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {leader.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/people/${leader.id}`} className="font-semibold text-foreground hover:underline truncate block">
                      {leader.name}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate">{leader.title}</div>
                  </div>
                  <button
                    onClick={() => setRemoveLeaderId(leader.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-600 transition-all rounded shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl text-muted-foreground">
                No leaders registered for this event.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Forms & Dialogs */}
      <EventForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSubmit={(values) => updateEvent.mutate({
          id: eventId,
          data: { ...values, state: values.state.toUpperCase(), endDate: values.endDate || undefined } as any,
        })}
        isPending={updateEvent.isPending}
        defaultValues={event}
        mode="edit"
      />

      <PersonPicker
        open={showInviteStaff}
        onClose={() => setShowInviteStaff(false)}
        onSelect={(person) => createInvitation.mutate({ id: eventId, data: { personId: person.id } } as any)}
        title="Invite Staff to Event"
        description="Select a staff member to invite. Already-invited staff are excluded."
        excludeIds={invitedIds}
        roleFilter="staff"
      />

      <PersonPicker
        open={showAddLeader}
        onClose={() => setShowAddLeader(false)}
        onSelect={(person) => addLeader.mutate({ eventId, personId: person.id })}
        title="Add Attending Leader"
        description="Select an executive or leader attending this event."
        excludeIds={leaderIds}
      />

      <ConfirmDialog
        open={!!deleteInviteId}
        title="Remove invitation?"
        description="This will remove the person from the invite list. You can re-invite them later."
        confirmLabel="Remove"
        isPending={deleteInvitation.isPending}
        onConfirm={() => deleteInviteId && deleteInvitation.mutate({ id: deleteInviteId })}
        onCancel={() => setDeleteInviteId(null)}
      />

      <ConfirmDialog
        open={!!removeLeaderId}
        title="Remove leader from event?"
        description="This leader will no longer be listed as attending this event."
        confirmLabel="Remove"
        isPending={removeLeader.isPending}
        onConfirm={() => removeLeaderId && removeLeader.mutate({ eventId, personId: removeLeaderId })}
        onCancel={() => setRemoveLeaderId(null)}
      />

      <ConfirmDialog
        open={showDeleteEvent}
        title={`Delete "${event.name}"?`}
        description="This will permanently delete the event and all associated invitations. This cannot be undone."
        confirmLabel="Delete Event"
        isPending={deleteEvent.isPending}
        onConfirm={() => deleteEvent.mutate({ id: eventId })}
        onCancel={() => setShowDeleteEvent(false)}
      />
    </div>
  );
}
