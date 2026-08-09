import React from 'react';
import { useParams, Link } from 'wouter';
import { 
  useGetVirtualMeeting, 
  useListVirtualMeetingParticipants, 
  useUpdateVirtualMeeting,
  getGetVirtualMeetingQueryKey,
  getListVirtualMeetingParticipantsQueryKey
} from '@workspace/api-client-react';
import { Video, Calendar as CalendarIcon, Users, User, Clock, MessageSquare, Check, X, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { VirtualMeetingUpdateStatus } from '@workspace/api-client-react/src/generated/api.schemas';

export default function VirtualMeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const meetingId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();

  const { data: meeting, isLoading: loadingMeeting } = useGetVirtualMeeting(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetVirtualMeetingQueryKey(meetingId) }
  });

  const { data: participants, isLoading: loadingParticipants } = useListVirtualMeetingParticipants(meetingId, {
    query: { enabled: !!meetingId, queryKey: getListVirtualMeetingParticipantsQueryKey(meetingId) }
  });

  const updateMeeting = useUpdateVirtualMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVirtualMeetingQueryKey(meetingId) });
      }
    }
  });

  const handleStatusChange = (status: VirtualMeetingUpdateStatus) => {
    updateMeeting.mutate({ id: meetingId, data: { status } });
  };

  if (loadingMeeting) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading meeting details...</div>;
  }

  if (!meeting) return <div className="p-8 text-center text-destructive">Meeting not found.</div>;

  return (
    <div className="space-y-8 pb-10">
      <Link href="/virtual-meetings" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        ← Back to Virtual Meetings
      </Link>

      {/* Header Card */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between mb-6">
          <div className="space-y-3">
            <span className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wider uppercase border",
              meeting.status === 'completed' ? "bg-green-50 text-green-700 border-green-200" :
              meeting.status === 'scheduled' ? "bg-blue-50 text-blue-700 border-blue-200" :
              meeting.status === 'suggested' ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-slate-100 text-slate-700 border-slate-200"
            )}>
              {meeting.status}
            </span>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground flex items-center gap-3">
              <Video className="h-8 w-8 text-muted-foreground" />
              {meeting.title}
            </h1>
          </div>
          
          <div className="flex flex-col gap-2 shrink-0">
            {meeting.status === 'suggested' && (
              <button 
                onClick={() => handleStatusChange('scheduled')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <CalendarIcon className="h-4 w-4" /> Schedule Now
              </button>
            )}
            {meeting.status === 'scheduled' && (
              <button 
                onClick={() => handleStatusChange('completed')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md shadow-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" /> Mark Completed
              </button>
            )}
            {(meeting.status === 'suggested' || meeting.status === 'scheduled') && (
              <button 
                onClick={() => handleStatusChange('cancelled')}
                disabled={updateMeeting.isPending}
                className="px-4 py-2 bg-card border border-border text-foreground font-medium rounded-md hover:bg-muted transition-colors flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-6 border-t border-border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg text-muted-foreground"><CalendarIcon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-medium text-foreground">Date & Time</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {meeting.scheduledDate 
                  ? format(new Date(meeting.scheduledDate), 'EEEE, MMMM d, yyyy h:mm a')
                  : 'Needs Scheduling'
                }
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
              <div className="text-sm text-muted-foreground mt-0.5">{meeting.participantCount || 0} people</div>
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

      {/* Participants List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold tracking-tight">Participants</h2>
          <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            <Plus className="h-4 w-4" /> Add Participant
          </button>
        </div>
        
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {loadingParticipants ? (
            <div className="p-8 text-center animate-pulse">Loading participants...</div>
          ) : participants && participants.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Person</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Role</th>
                  <th className="py-3 px-4 font-semibold text-sm text-muted-foreground">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {participants.map((p: any) => ( // assuming p has person object joined or is the person
                  <tr key={p.personId || p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {(p.person?.name || p.name || '?').split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <Link href={`/people/${p.personId || p.id}`} className="font-medium text-foreground hover:underline block">
                            {p.person?.name || p.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{p.person?.title || p.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                        {(p.person?.role || p.role || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {p.person?.homeCity || p.homeCity}, {p.person?.homeState || p.homeState}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              No participants added yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
