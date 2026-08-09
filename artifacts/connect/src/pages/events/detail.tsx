import React, { useState } from 'react';
import { useParams, Link } from 'wouter';
import { 
  useGetEvent, 
  useListEventLeaders, 
  useListEventInvitations, 
  useUpdateInvitation,
  getGetEventQueryKey,
  getListEventLeadersQueryKey,
  getListEventInvitationsQueryKey
} from '@workspace/api-client-react';
import { MapPin, Calendar as CalendarIcon, Users, Building, Plus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { InvitationUpdateStatus } from '@workspace/api-client-react/src/generated/api.schemas';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'invites' | 'leaders'>('invites');

  const { data: event, isLoading: loadingEvent } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) }
  });

  const { data: leaders, isLoading: loadingLeaders } = useListEventLeaders(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventLeadersQueryKey(eventId) }
  });

  const { data: invitations, isLoading: loadingInvites } = useListEventInvitations(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventInvitationsQueryKey(eventId) }
  });

  const updateInvite = useUpdateInvitation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventInvitationsQueryKey(eventId) });
      }
    }
  });

  const handleStatusChange = (inviteId: number, status: InvitationUpdateStatus) => {
    updateInvite.mutate({ id: inviteId, data: { status } });
  };

  if (loadingEvent) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading event details...</div>;
  }

  if (!event) return <div className="p-8 text-center text-destructive">Event not found.</div>;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to Events
      </Link>

      {/* Header Card */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between mb-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase tracking-wider">
                {event.eventType}
              </span>
              <span className={cn(
                "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                new Date(event.startDate) > new Date() ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-slate-50 text-slate-600 ring-slate-500/10"
              )}>
                {new Date(event.startDate) > new Date() ? 'UPCOMING' : 'PAST'}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{event.name}</h1>
            <p className="text-lg text-muted-foreground max-w-3xl">{event.description || 'No description provided.'}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors">
              Edit Event
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
                {event.endDate && ` - ${format(new Date(event.endDate), 'MMM d, yyyy')}`}
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
              <div className="text-sm text-muted-foreground mt-0.5">{event.leaderCount || 0} executives/leaders</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Users className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Guest List</div>
              <div className="text-sm text-muted-foreground mt-0.5">{event.inviteeCount || 0} invited</div>
              <div className="text-xs text-green-600 font-medium">{event.attendeeCount || 0} attended</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6 border-b border-border">
        <button 
          onClick={() => setActiveTab('invites')}
          className={cn(
            "pb-3 text-sm font-medium border-b-2 transition-colors",
            activeTab === 'invites' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Staff Invitations ({invitations?.length || 0})
        </button>
        <button 
          onClick={() => setActiveTab('leaders')}
          className={cn(
            "pb-3 text-sm font-medium border-b-2 transition-colors",
            activeTab === 'leaders' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Attending Leaders ({leaders?.length || 0})
        </button>
      </div>

      {activeTab === 'invites' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Staff Invitations</h2>
            <button className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
              <Plus className="h-4 w-4" /> Invite Staff
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {loadingInvites ? (
              <div className="p-8 text-center animate-pulse">Loading invitations...</div>
            ) : invitations && invitations.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground text-right">Update Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
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
                          "inline-flex px-2.5 py-1 text-xs font-medium rounded-full border",
                          inv.status === 'attended' ? "bg-green-50 text-green-700 border-green-200" :
                          inv.status === 'invited' ? "bg-blue-50 text-blue-700 border-blue-200" :
                          inv.status === 'declined' ? "bg-slate-100 text-slate-700 border-slate-200" :
                          "bg-red-50 text-red-700 border-red-200"
                        )}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <select 
                          value={inv.status}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value as InvitationUpdateStatus)}
                          disabled={updateInvite.isPending}
                          className="text-xs bg-card border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                        >
                          <option value="invited">Invited</option>
                          <option value="attended">Attended</option>
                          <option value="no_show">No Show</option>
                          <option value="declined">Declined</option>
                        </select>
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
            <button className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
              <Plus className="h-4 w-4" /> Add Leader
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {loadingLeaders ? (
              <div className="col-span-full p-8 text-center animate-pulse">Loading leaders...</div>
            ) : leaders && leaders.length > 0 ? (
              leaders.map((leader: any) => ( // Note: API types might need casting, assuming leader is Person
                <div key={leader.id} className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {leader.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/people/${leader.id}`} className="font-semibold text-foreground hover:underline truncate block">
                      {leader.name}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate">{leader.title}</div>
                  </div>
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

    </div>
  );
}
