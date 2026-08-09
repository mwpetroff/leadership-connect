import React, { useState, useMemo } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  useGetEvent, useListEventLeaders, useListEventInvitations,
  useUpdateInvitation, useUpdateEvent, useDeleteEvent,
  useAddEventLeader, useRemoveEventLeader,
  useCreateInvitation, useDeleteInvitation,
  useBulkCreateInvitations, useBulkUpdateInvitations,
  useGetMeetupSuggestions,
  getGetEventQueryKey, getListEventLeadersQueryKey,
  getListEventInvitationsQueryKey, getListEventsQueryKey,
  getGetMeetupSuggestionsQueryKey,
} from '@workspace/api-client-react';
import {
  MapPin, Calendar as CalendarIcon, Users, Building, Plus, X, Trash2,
  CheckSquare, Square, ClipboardCheck, UserPlus, UsersRound,
} from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { EventForm, type EventFormValues } from '@/components/forms/EventForm';
import { PersonPicker } from '@/components/forms/PersonPicker';
import { ConfirmDialog } from '@/components/forms/ConfirmDialog';
import type { InvitationUpdateStatus } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the event's end date (or start date) is in the past. */
function isEventPast(event: { startDate: string; endDate?: string | null }): boolean {
  const refDate = event.endDate ?? event.startDate;
  return isPast(parseISO(refDate));
}

// ── Bulk invite modal ─────────────────────────────────────────────────────────

interface BulkInviteModalProps {
  open: boolean;
  onClose: () => void;
  eventId: number;
  eventCity: string;
  eventState: string;
  alreadyInvitedIds: number[];
}

function BulkInviteModal({ open, onClose, eventId, eventCity, eventState, alreadyInvitedIds }: BulkInviteModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const { data: meetupSuggestions, isLoading } = useGetMeetupSuggestions({
    query: {
      queryKey: getGetMeetupSuggestionsQueryKey(),
      enabled: open,
    },
  });

  // Filter suggestions for this specific event, excluding already-invited people.
  const suggestions = useMemo(() => {
    const match = (meetupSuggestions ?? []).find((m) => m.event.id === eventId);
    return (match?.suggestedPeople ?? []).filter(
      (sp) => !alreadyInvitedIds.includes(sp.person.id)
    );
  }, [meetupSuggestions, eventId, alreadyInvitedIds]);

  // Pre-check all when modal opens / suggestions change.
  const [initialised, setInitialised] = useState(false);
  React.useEffect(() => {
    if (open && suggestions.length > 0 && !initialised) {
      setSelected(new Set(suggestions.map((sp) => sp.person.id)));
      setInitialised(true);
    }
    if (!open) { setInitialised(false); setSubmitted(false); }
  }, [open, suggestions, initialised]);

  const bulkCreate = useBulkCreateInvitations({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListEventInvitationsQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getGetMeetupSuggestionsQueryKey() });
        toast({
          title: `${data.created} invitation${data.created !== 1 ? 's' : ''} created`,
          description: data.skipped > 0 ? `${data.skipped} already invited — skipped.` : undefined,
        });
        onClose();
      },
      onError: () => toast({ title: 'Error', description: 'Failed to create invitations.' }),
    },
  });

  const toggleAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map((sp) => sp.person.id)));
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0) return;
    setSubmitted(true);
    bulkCreate.mutate({ id: eventId, data: { personIds: Array.from(selected), createCalendarEvent: false } });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-primary" />
                Invite nearby staff
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Staff near {eventCity}, {eventState} not yet invited. Deselect individuals before confirming.
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading suggestions…</div>
          ) : suggestions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No unmatched nearby staff found for this event.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2 mb-1">
                <button
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                >
                  {selected.size === suggestions.length
                    ? <><CheckSquare className="h-3.5 w-3.5" /> Deselect all</>
                    : <><Square className="h-3.5 w-3.5" /> Select all</>}
                </button>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              </div>
              <div className="divide-y divide-border">
                {suggestions.map(({ person, reason }) => (
                  <label key={person.id} className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/20 rounded-lg">
                    <input
                      type="checkbox"
                      checked={selected.has(person.id)}
                      onChange={() => toggle(person.id)}
                      className="accent-primary h-4 w-4 rounded shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground">{person.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{person.title}</div>
                      <div className="text-xs text-amber-600 mt-0.5">{reason}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || bulkCreate.isPending || submitted}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {bulkCreate.isPending ? 'Inviting…' : `Invite ${selected.size > 0 ? selected.size : ''} staff`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Attendance modal ──────────────────────────────────────────────────────────

interface AttendanceModalProps {
  open: boolean;
  onClose: () => void;
  eventId: number;
  invitations: Array<{ id: number; status: string; person?: { name?: string | null; title?: string | null } | null }>;
}

function AttendanceModal({ open, onClose, eventId, invitations }: AttendanceModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  type StatusMap = Record<number, 'attended' | 'no_show' | 'invited' | 'declined'>;
  const [statuses, setStatuses] = useState<StatusMap>({});

  React.useEffect(() => {
    if (open) {
      const initial: StatusMap = {};
      invitations.forEach((inv) => { initial[inv.id] = inv.status as StatusMap[number]; });
      setStatuses(initial);
    }
  }, [open, invitations]);

  const markAll = (status: 'attended' | 'no_show') => {
    const next: StatusMap = {};
    invitations.forEach((inv) => { next[inv.id] = status; });
    setStatuses(next);
  };

  const bulkUpdate = useBulkUpdateInvitations({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListEventInvitationsQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        toast({ title: `${data.updated} attendance record${data.updated !== 1 ? 's' : ''} saved` });
        onClose();
      },
      onError: () => toast({ title: 'Error', description: 'Failed to save attendance.' }),
    },
  });

  const handleSubmit = () => {
    const updates = Object.entries(statuses).map(([id, status]) => ({
      id: Number(id),
      status: status as 'attended' | 'no_show' | 'invited' | 'declined',
    }));
    if (updates.length === 0) return;
    bulkUpdate.mutate({ id: eventId, data: { updates } });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-green-600" />
                Mark attendance
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Toggle each attendee. Use the shortcuts below to mark everyone at once.
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => markAll('attended')}
              className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-md font-medium hover:bg-green-100 transition-colors"
            >
              ✓ Mark all attended
            </button>
            <button
              onClick={() => markAll('no_show')}
              className="text-xs px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium hover:bg-slate-100 transition-colors"
            >
              ✗ Mark all no-show
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-sm">{inv.person?.name ?? `Invitee #${inv.id}`}</div>
                  <div className="text-xs text-muted-foreground">{inv.person?.title}</div>
                </div>
                <div className="flex gap-2">
                  {(['attended', 'no_show', 'invited'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatuses((prev) => ({ ...prev, [inv.id]: s }))}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                        statuses[inv.id] === s
                          ? s === 'attended'
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : s === 'no_show'
                              ? 'bg-red-100 text-red-700 border-red-300'
                              : 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-card text-muted-foreground border-border hover:border-foreground'
                      )}
                    >
                      {s === 'no_show' ? 'No-show' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={bulkUpdate.isPending}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {bulkUpdate.isPending ? 'Saving…' : `Save ${invitations.length} records`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id ?? '0', 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { isAdmin, isLeader } = useAuth();

  const [activeTab, setActiveTab] = useState<'invites' | 'leaders'>('invites');
  const [showEdit, setShowEdit] = useState(false);
  const [showInviteStaff, setShowInviteStaff] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [showAddLeader, setShowAddLeader] = useState(false);
  const [deleteInviteId, setDeleteInviteId] = useState<number | null>(null);
  const [removeLeaderId, setRemoveLeaderId] = useState<number | null>(null);
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  /** Whether to request a Microsoft Graph calendar invite with each new invitation */
  const [calendarInvite, setCalendarInvite] = useState(true);
  /** IDs of invitations selected for bulk delete */
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: event, isLoading: loadingEvent } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) },
  });
  const { data: leaders, isLoading: loadingLeaders } = useListEventLeaders(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventLeadersQueryKey(eventId) },
  });
  const { data: invitations, isLoading: loadingInvites } = useListEventInvitations(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventInvitationsQueryKey(eventId) },
  });

  // Suggestions data — fetched lazily to power the "Invite all nearby" button.
  const { data: meetupSuggestions } = useGetMeetupSuggestions({
    query: { queryKey: getGetMeetupSuggestionsQueryKey() },
  });

  const hasNearbySuggestions = useMemo(() => {
    const match = (meetupSuggestions ?? []).find((m) => m.event.id === eventId);
    const invitedIds = new Set(invitations?.map((i) => i.personId) ?? []);
    return (match?.suggestedPeople ?? []).some((sp) => !invitedIds.has(sp.person.id));
  }, [meetupSuggestions, eventId, invitations]);

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

  // ── Bulk delete ────────────────────────────────────────────────────────────
  const toggleSelectInvite = (id: number) => {
    setSelectedInviteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const ids = invitations?.map((i) => i.id) ?? [];
    if (selectedInviteIds.size === ids.length) setSelectedInviteIds(new Set());
    else setSelectedInviteIds(new Set(ids));
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    const ids = Array.from(selectedInviteIds);
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`${import.meta.env.BASE_URL}api/invitations/${id}`, { method: 'DELETE' });
        return { id, ok: res.ok };
      })
    );
    setIsBulkDeleting(false);
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    setSelectedInviteIds(new Set());
    setShowBulkDeleteConfirm(false);
    invalidateAll();
    if (failed > 0) {
      toast({
        title: `${succeeded} removed, ${failed} failed`,
        description: 'Some invitations could not be removed. Refresh and try again.',
      });
    } else {
      toast({ title: `${succeeded} invitation${succeeded !== 1 ? 's' : ''} removed` });
    }
  };

  if (loadingEvent) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading event…</div>;
  if (!event) return <div className="p-8 text-center text-destructive">Event not found.</div>;

  const eventIsPast = isEventPast(event as any);

  return (
    <div className="space-y-8 pb-10">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to Events
      </Link>

      {/* Post-event attendance banner */}
      {eventIsPast && isLeader && (invitations?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">This event has ended — mark attendance</div>
              <div className="text-xs text-amber-700 mt-0.5">
                Record who showed up so engagement data stays accurate.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAttendance(true)}
            className="shrink-0 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-amber-700 transition-colors"
          >
            Mark attendance
          </button>
        </div>
      )}

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
                !eventIsPast
                  ? 'bg-green-50 text-green-700 ring-green-600/20'
                  : 'bg-slate-50 text-slate-600 ring-slate-500/10'
              )}>
                {eventIsPast ? 'PAST' : 'UPCOMING'}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{event.name}</h1>
            <p className="text-lg text-muted-foreground max-w-3xl">{event.description ?? 'No description provided.'}</p>
          </div>
          {isAdmin && (
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
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-6 border-t border-border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><CalendarIcon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Date</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {format(parseISO(event.startDate as unknown as string), 'MMMM d, yyyy')}
                {event.endDate && ` – ${format(parseISO(event.endDate as unknown as string), 'MMM d, yyyy')}`}
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
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Staff Invitations</h2>
            {isLeader && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Per-invite calendar opt-in */}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={calendarInvite}
                    onChange={(e) => setCalendarInvite(e.target.checked)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  📅 Calendar invite
                </label>
                {/* Bulk invite nearby — only when suggestions exist and event is upcoming */}
                {!eventIsPast && hasNearbySuggestions && (
                  <button
                    onClick={() => setShowBulkInvite(true)}
                    className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors border border-indigo-200"
                  >
                    <UsersRound className="h-4 w-4" /> Invite all nearby
                  </button>
                )}
                <button
                  onClick={() => setShowInviteStaff(true)}
                  className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Invite staff
                </button>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {loadingInvites ? (
              <div className="p-8 text-center animate-pulse">Loading invitations…</div>
            ) : invitations && invitations.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {isAdmin && (
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedInviteIds.size === invitations.length}
                          onChange={toggleSelectAll}
                          className="accent-primary h-3.5 w-3.5 rounded"
                          title="Select all"
                        />
                      </th>
                    )}
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                    <th className="py-3 px-4 font-semibold text-sm text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className={cn('hover:bg-muted/30 transition-colors group', selectedInviteIds.has(inv.id) && 'bg-primary/5')}>
                      {isAdmin && (
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedInviteIds.has(inv.id)}
                            onChange={() => toggleSelectInvite(inv.id)}
                            className="accent-primary h-3.5 w-3.5 rounded"
                          />
                        </td>
                      )}
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
                          {isLeader ? (
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
                          ) : (
                            <span className="text-xs text-muted-foreground capitalize">
                              {inv.status.replace('_', ' ')}
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteInviteId(inv.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-600 transition-all rounded"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
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

          {/* Bulk delete action bar */}
          {isAdmin && selectedInviteIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-xl shadow-xl px-5 py-3 flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                {selectedInviteIds.size} selected
              </span>
              <button
                onClick={() => setSelectedInviteIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Remove selected
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'leaders' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Attending Leaders</h2>
            {isAdmin && (
              <button
                onClick={() => setShowAddLeader(true)}
                className="text-sm bg-primary/10 text-primary hover:bg-primary/20 font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Leader
              </button>
            )}
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
                  {isAdmin && (
                    <button
                      onClick={() => setRemoveLeaderId(leader.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-600 transition-all rounded shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
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

      {/* ── Modals & Dialogs ─────────────────────────────────────────────────── */}

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
        onSelect={(person) => createInvitation.mutate({ id: eventId, data: { personId: person.id, createCalendarEvent: calendarInvite } } as any)}
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
        multiRole={['executive', 'secondary_leader']}
      />

      <BulkInviteModal
        open={showBulkInvite}
        onClose={() => setShowBulkInvite(false)}
        eventId={eventId}
        eventCity={event.city}
        eventState={event.state}
        alreadyInvitedIds={invitedIds}
      />

      <AttendanceModal
        open={showAttendance}
        onClose={() => setShowAttendance(false)}
        eventId={eventId}
        invitations={invitations ?? []}
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
        open={showBulkDeleteConfirm}
        title={`Remove ${selectedInviteIds.size} invitation${selectedInviteIds.size !== 1 ? 's' : ''}?`}
        description="This will remove the selected people from the invite list. You can re-invite them later."
        confirmLabel={`Remove ${selectedInviteIds.size}`}
        isPending={isBulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
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
