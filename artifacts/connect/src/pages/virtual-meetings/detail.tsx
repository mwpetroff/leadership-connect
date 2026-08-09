import React, { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  useGetVirtualMeeting, useListVirtualMeetingParticipants,
  useUpdateVirtualMeeting, useDeleteVirtualMeeting,
  useAddVirtualMeetingParticipant, useRemoveVirtualMeetingParticipant,
  getGetVirtualMeetingQueryKey, getListVirtualMeetingParticipantsQueryKey,
  getListVirtualMeetingsQueryKey,
} from '@workspace/api-client-react';
import { Video, Calendar as CalendarIcon, Users, User, MessageSquare, Check, X, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { PersonPicker } from '@/components/forms/PersonPicker';
import { ConfirmDialog } from '@/components/forms/ConfirmDialog';
import type { VirtualMeetingUpdateStatus } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

export default function VirtualMeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const meetingId = parseInt(id ?? '0', 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { isAdmin, isLeader } = useAuth();

  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [removeParticipantId, setRemoveParticipantId] = useState<number | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const { data: meeting, isLoading: loadingMeeting } = useGetVirtualMeeting(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetVirtualMeetingQueryKey(meetingId) },
  });
  const { data: participants, isLoading: loadingParticipants } = useListVirtualMeetingParticipants(meetingId, {
    query: { enabled: !!meetingId, queryKey: getListVirtualMeetingParticipantsQueryKey(meetingId) },
  });

  const invalidateMeeting = () => {
    queryClient.invalidateQueries({ queryKey: getGetVirtualMeetingQueryKey(meetingId) });
    queryClient.invalidateQueries({ queryKey: getListVirtualMeetingParticipantsQueryKey(meetingId) });
  };

  const updateMeeting = useUpdateVirtualMeeting({
    mutation: {
      onSuccess: () => invalidateMeeting(),
      onError: () => toast({ title: 'Error', description: 'Failed to update meeting.' }),
    },
  });

  const deleteMeeting = useDeleteVirtualMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVirtualMeetingsQueryKey() });
        toast({ title: 'Meeting deleted' });
        setLocation('/virtual-meetings');
      },
      onError: () => toast({ title: 'Error', description: 'Failed to delete meeting.' }),
    },
  });

  const addParticipant = useAddVirtualMeetingParticipant({
    mutation: {
      onSuccess: () => {
        invalidateMeeting();
        toast({ title: 'Participant added' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to add participant.' }),
    },
  });

  const removeParticipant = useRemoveVirtualMeetingParticipant({
    mutation: {
      onSuccess: () => {
        invalidateMeeting();
        setRemoveParticipantId(null);
        toast({ title: 'Participant removed' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to remove participant.' }),
    },
  });

  const handleStatusChange = (status: VirtualMeetingUpdateStatus) => {
    updateMeeting.mutate({ id: meetingId, data: { status } });
  };

  const participantIds = (participants as any[])?.map((p: any) => p.personId ?? p.id) ?? [];

  if (loadingMeeting) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading meeting…</div>;
  if (!meeting) return <div className="p-8 text-center text-destructive">Meeting not found.</div>;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/virtual-meetings" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to Virtual Meetings
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between mb-6">
          <div className="space-y-3">
            <span className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wider uppercase border',
              meeting.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
              meeting.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              meeting.status === 'suggested' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-slate-100 text-slate-700 border-slate-200'
            )}>
              {meeting.status}
            </span>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground flex items-center gap-3">
              <Video className="h-8 w-8 text-muted-foreground" />
              {meeting.title}
            </h1>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {/* Leaders and above can update meeting status */}
            {isLeader && meeting.status === 'suggested' && (
              <button
                onClick={() => handleStatusChange('scheduled')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <CalendarIcon className="h-4 w-4" /> Schedule Now
              </button>
            )}
            {isLeader && meeting.status === 'scheduled' && (
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md shadow-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" /> Mark Completed
              </button>
            )}
            {isLeader && (meeting.status === 'suggested' || meeting.status === 'scheduled') && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-card border border-border text-foreground font-medium rounded-md hover:bg-muted transition-colors flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowDelete(true)}
                className="px-4 py-2 bg-card border border-red-200 text-red-600 font-medium rounded-md hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-6 border-t border-border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><CalendarIcon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Date &amp; Time</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {meeting.scheduledDate
                  ? format(new Date(meeting.scheduledDate), 'EEEE, MMMM d, yyyy')
                  : 'Needs Scheduling'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><User className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Host</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {meeting.host ? (
                  <Link href={`/people/${meeting.host.id}`} className="hover:underline text-primary font-medium">
                    {meeting.host.name}
                  </Link>
                ) : 'Unassigned'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Users className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Participants</div>
              <div className="text-sm text-muted-foreground mt-0.5">{meeting.participantCount ?? 0} people</div>
            </div>
          </div>
        </div>

        {meeting.notes && (
          <div className="mt-2 pt-6 border-t border-border flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><MessageSquare className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground mb-1">Notes / Agenda</div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-lg border border-border/50">
                {meeting.notes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Participants */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold tracking-tight">Participants</h2>
          {isLeader && (
            <button
              onClick={() => setShowAddParticipant(true)}
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add Participant
            </button>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {loadingParticipants ? (
            <div className="p-8 text-center animate-pulse">Loading participants…</div>
          ) : (participants as any[])?.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Role</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(participants as any[]).map((p: any) => {
                  const personId = p.personId ?? p.id;
                  const name = p.person?.name ?? p.name ?? '?';
                  const title = p.person?.title ?? p.title;
                  const role = p.person?.role ?? p.role ?? '';
                  const city = p.person?.homeCity ?? p.homeCity;
                  const state = p.person?.homeState ?? p.homeState;
                  return (
                    <tr key={personId} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {name.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                          </div>
                          <div>
                            <Link href={`/people/${personId}`} className="font-medium text-foreground hover:underline block">
                              {name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          {role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{city}, {state}</td>
                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => setRemoveParticipantId(personId)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-600 transition-all rounded"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-muted-foreground">No participants added yet.</div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <PersonPicker
        open={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
        onSelect={(person) => addParticipant.mutate({ id: meetingId, data: { personId: person.id } })}
        title="Add Participant"
        description="Search for a person to add to this meeting."
        excludeIds={participantIds}
      />

      <ConfirmDialog
        open={!!removeParticipantId}
        title="Remove participant?"
        description="This person will be removed from the meeting. You can add them back later."
        confirmLabel="Remove"
        isPending={removeParticipant.isPending}
        onConfirm={() => removeParticipantId && removeParticipant.mutate({ meetingId, personId: removeParticipantId })}
        onCancel={() => setRemoveParticipantId(null)}
      />

      <ConfirmDialog
        open={showDelete}
        title={`Delete "${meeting.title}"?`}
        description="This will permanently delete the meeting and all participant records."
        confirmLabel="Delete Meeting"
        isPending={deleteMeeting.isPending}
        onConfirm={() => deleteMeeting.mutate({ id: meetingId })}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
