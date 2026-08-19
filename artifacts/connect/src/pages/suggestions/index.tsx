import React, { useState } from 'react';
import { Link } from 'wouter';
import { 
  useGetMeetupSuggestions, 
  useGetVirtualSuggestions,
  useCreateInvitation,
  useBulkCreateInvitations,
  useCreateVirtualMeeting,
  useAddVirtualMeetingParticipant,
  getGetMeetupSuggestionsQueryKey,
  getGetVirtualSuggestionsQueryKey
} from '@workspace/api-client-react';
import { MapPin, Calendar, Video, ArrowRight, UserPlus, Zap, Check, UsersRound, X } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useScope } from '@/lib/scope';

// ── Invite-all confirmation modal ─────────────────────────────────────────────

interface InviteAllConfirmProps {
  open: boolean;
  eventName: string;
  count: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function InviteAllConfirm({ open, eventName, count, isPending, onConfirm, onCancel }: InviteAllConfirmProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Invite all {count} staff?</h2>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          This will create invitations for all {count} suggested staff member{count !== 1 ? 's' : ''} for <strong>{eventName}</strong>.
          Already-invited people will be skipped automatically.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <UsersRound className="h-4 w-4" />
            {isPending ? 'Inviting…' : 'Invite all'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SuggestionsHub() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isLeader } = useAuth();
  const { queryString } = useScope();

  const { data: coverage } = useQuery<{
    people: Array<{
      person: { id: number; name: string; title?: string | null } | null;
      overdueCount: number;
      gaps: Array<{ kind: string; overdue: boolean; notApplicable: boolean; daysSince: number | null }>;
    }>;
  }>({
    queryKey: ['suggestions-coverage', queryString],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/suggestions/coverage?${queryString}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load coverage suggestions');
      return res.json();
    },
  });

  // Track which event card has the "Invite all" confirmation open.
  const [inviteAllTarget, setInviteAllTarget] = useState<{
    eventId: number;
    eventName: string;
    personIds: number[];
  } | null>(null);

  const { data: meetupSuggestions, isLoading: loadingMeetups } = useGetMeetupSuggestions();
  const { data: virtualSuggestions, isLoading: loadingVirtual } = useGetVirtualSuggestions();

  const createInvite = useCreateInvitation({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Invitation sent successfully' });
        queryClient.invalidateQueries({ queryKey: getGetMeetupSuggestionsQueryKey() });
      }
    }
  });

  const bulkCreateInvite = useBulkCreateInvitations({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetMeetupSuggestionsQueryKey() });
        toast({
          title: `${data.created} invitation${data.created !== 1 ? 's' : ''} created`,
          description: data.skipped > 0 ? `${data.skipped} already invited — skipped.` : undefined,
        });
        setInviteAllTarget(null);
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to send bulk invitations.' });
        setInviteAllTarget(null);
      },
    }
  });

  const createMeeting = useCreateVirtualMeeting();
  const addParticipant = useAddVirtualMeetingParticipant();

  const handleInvite = (eventId: number, personId: number) => {
    createInvite.mutate({
      id: eventId,
      data: { personId, notes: 'Suggested from meetup hub', createCalendarEvent: true } as any,
    });
  };

  const handleInviteAll = (eventId: number, eventName: string, personIds: number[]) => {
    setInviteAllTarget({ eventId, eventName, personIds });
  };

  const confirmInviteAll = () => {
    if (!inviteAllTarget) return;
    bulkCreateInvite.mutate({
      id: inviteAllTarget.eventId,
      data: { personIds: inviteAllTarget.personIds, createCalendarEvent: false },
    });
  };

  const handleScheduleVirtual = async (personId: number, leaderId?: number) => {
    try {
      const meeting = await createMeeting.mutateAsync({
        data: {
          title: 'Leadership Check-in',
          status: 'suggested',
          hostId: leaderId,
          notes: 'Suggested touchpoint from the hub',
        } as any,
      });
      await addParticipant.mutateAsync({ id: (meeting as any).id, data: { personId } });
      toast({ title: 'Check-in suggested', description: 'A virtual touchpoint has been queued.' });
      queryClient.invalidateQueries({ queryKey: getGetVirtualSuggestionsQueryKey() });
    } catch {
      toast({ title: 'Error', description: 'Failed to create virtual touchpoint.' });
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Zap className="h-8 w-8 text-amber-500" />
          Suggestions Hub
        </h1>
        <p className="text-muted-foreground mt-1 text-lg">Close the four coverage clocks, then nearby events and 1:1s.</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border bg-amber-50/80">
          <h2 className="text-lg font-bold text-amber-950">Coverage gaps in this view</h2>
          <p className="text-sm text-amber-900/80 mt-1">
            Ranked by how many clocks are overdue. Open a person to log the matching 1:1 or onsite.
          </p>
        </div>
        <div className="divide-y divide-border">
          {(coverage?.people ?? []).filter((row) => row.overdueCount > 0 && row.person).slice(0, 12).map((row) => (
            <Link
              key={row.person!.id}
              href={`/people/${row.person!.id}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-muted/20"
            >
              <div>
                <div className="font-medium text-foreground">{row.person!.name}</div>
                <div className="text-xs text-muted-foreground">{row.person!.title}</div>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {row.gaps.filter((g) => g.overdue && !g.notApplicable).map((g) => (
                  <span key={g.kind} className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                    {g.kind.replace(/_/g, ' ')}
                    {g.daysSince == null ? ' · never' : ` · ${g.daysSince}d`}
                  </span>
                ))}
              </div>
            </Link>
          ))}
          {(coverage?.people ?? []).filter((row) => row.overdueCount > 0).length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No overdue clocks in this lens.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Panel: In-Person Meetups */}
        <div className="space-y-5">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
            <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5" />
              In-Person Meetups
            </h2>
            <p className="text-sm text-indigo-700/80">
              Staff who live near your upcoming events and haven't had a recent touchpoint.
            </p>
          </div>

          {loadingMeetups ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2].map(i => <div key={i} className="h-64 bg-card rounded-xl border border-border"></div>)}
            </div>
          ) : meetupSuggestions && meetupSuggestions.length > 0 ? (
            meetupSuggestions.map((meetup, idx) => {
              const suggestionIds = meetup.suggestedPeople.map((sp) => sp.person.id);
              return (
                <div key={idx} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-border bg-muted/20">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <Link href={`/events/${meetup.event.id}`} className="text-xl font-bold text-foreground hover:text-primary transition-colors">
                          {meetup.event.name}
                        </Link>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {format(new Date(meetup.event.startDate), 'MMM d')}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {meetup.event.city}, {meetup.event.state}</span>
                        </div>
                      </div>
                      {/* Invite all button — only when there are suggestions and user is a leader */}
                      {isLeader && suggestionIds.length > 0 && (
                        <button
                          onClick={() => handleInviteAll(meetup.event.id, meetup.event.name, suggestionIds)}
                          disabled={createInvite.isPending || bulkCreateInvite.isPending}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          title={`Invite all ${suggestionIds.length} suggested staff`}
                        >
                          <UsersRound className="h-3.5 w-3.5" />
                          Invite all ({suggestionIds.length})
                        </button>
                      )}
                    </div>
                    
                    {meetup.leaders.length > 0 && (
                      <div className="mt-4 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-medium">Attending Execs:</span>
                        <div className="flex -space-x-2">
                          {meetup.leaders.map(l => (
                            <div key={l.id} className="h-6 w-6 rounded-full bg-primary text-primary-foreground border-2 border-card flex items-center justify-center font-bold text-[10px]" title={l.name}>
                              {l.name.charAt(0)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-0">
                    {meetup.suggestedPeople.length > 0 ? (
                      <div className="divide-y divide-border">
                        {meetup.suggestedPeople.map((sp, sIdx) => (
                          <div key={sIdx} className="p-4 flex items-center justify-between hover:bg-muted/10">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                                {sp.person.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                              </div>
                              <div>
                                <Link href={`/people/${sp.person.id}`} className="font-semibold text-foreground hover:underline text-sm">
                                  {sp.person.name}
                                </Link>
                                <div className="text-xs text-muted-foreground mt-0.5">{sp.person.title}</div>
                                <div className="text-xs font-medium text-amber-600 mt-1 bg-amber-50 inline-block px-1.5 rounded">
                                  {sp.reason}
                                </div>
                              </div>
                            </div>
                            {isLeader && (
                              <button 
                                onClick={() => handleInvite(meetup.event.id, sp.person.id)}
                                disabled={createInvite.isPending}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-xs font-medium rounded transition-colors"
                              >
                                <UserPlus className="h-3.5 w-3.5" /> Invite
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">No local staff suggestions for this event.</div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-card border border-border p-8 rounded-xl text-center text-muted-foreground">
              No in-person meetup suggestions at this time.
            </div>
          )}
        </div>

        {/* Right Panel: Virtual Touchpoints */}
        <div className="space-y-5">
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
            <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2 mb-2">
              <Video className="h-5 w-5" />
              Virtual Touchpoints
            </h2>
            <p className="text-sm text-purple-700/80">
              Staff who are falling behind on engagement and need a check-in.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {loadingVirtual ? (
              <div className="p-8 text-center animate-pulse">Loading suggestions...</div>
            ) : virtualSuggestions && virtualSuggestions.length > 0 ? (
              <div className="divide-y divide-border">
                {virtualSuggestions.map((vs, vIdx) => (
                  <div key={vIdx} className="p-5 hover:bg-muted/10 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-4">
                        <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold shrink-0 text-lg border border-purple-200">
                          {vs.person.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <Link href={`/people/${vs.person.id}`} className="font-bold text-foreground hover:underline text-lg">
                            {vs.person.name}
                          </Link>
                          <div className="text-sm text-muted-foreground">{vs.person.title} · {vs.person.department}</div>
                          
                          <div className="mt-3 flex items-center gap-2">
                            <span className="px-2 py-1 bg-destructive/10 text-destructive text-xs font-semibold rounded border border-destructive/20">
                              {vs.reason}
                            </span>
                            {vs.daysSinceLastTouchpoint && (
                              <span className="text-xs text-muted-foreground font-medium">
                                Last: {vs.daysSinceLastTouchpoint} days ago
                              </span>
                            )}
                          </div>
                          
                          {isLeader && vs.suggestedLeaders && vs.suggestedLeaders.length > 0 && (
                            <div className="mt-4 bg-muted/40 p-3 rounded-lg border border-border text-sm">
                              <span className="text-muted-foreground text-xs block mb-1.5 uppercase tracking-wider font-semibold">Suggested Hosts:</span>
                              <div className="flex gap-2">
                                {vs.suggestedLeaders.map(l => (
                                  <button 
                                    key={l.id}
                                    onClick={() => handleScheduleVirtual(vs.person.id, l.id)}
                                    disabled={createMeeting.isPending}
                                    className="px-2.5 py-1.5 bg-card border border-border hover:border-primary hover:text-primary rounded shadow-sm text-xs font-medium transition-colors flex items-center gap-1.5"
                                  >
                                    {l.name} <ArrowRight className="h-3 w-3" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {isLeader && (
                        <button 
                          onClick={() => handleScheduleVirtual(vs.person.id)}
                          disabled={createMeeting.isPending}
                          className="shrink-0 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
                        >
                          Suggest 1:1
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <p>All staff are well-engaged. No urgent virtual meetings needed.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Invite-all confirmation modal */}
      <InviteAllConfirm
        open={!!inviteAllTarget}
        eventName={inviteAllTarget?.eventName ?? ''}
        count={inviteAllTarget?.personIds.length ?? 0}
        isPending={bulkCreateInvite.isPending}
        onConfirm={confirmInviteAll}
        onCancel={() => setInviteAllTarget(null)}
      />
    </div>
  );
}
