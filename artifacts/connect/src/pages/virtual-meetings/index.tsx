import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  useListVirtualMeetings, useCreateVirtualMeeting, getListVirtualMeetingsQueryKey,
} from '@workspace/api-client-react';
import { Video, Calendar, User, Plus, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { VirtualMeetingForm, type VirtualMeetingFormValues } from '@/components/forms/VirtualMeetingForm';
import type { ListVirtualMeetingsStatus } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

export default function VirtualMeetings() {
  const [statusFilter, setStatusFilter] = useState<ListVirtualMeetingsStatus | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const { isAdmin } = useAuth();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: meetings, isLoading } = useListVirtualMeetings(
    { status: statusFilter },
    { query: { keepPreviousData: true } as any }
  );

  const createMeeting = useCreateVirtualMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVirtualMeetingsQueryKey() });
        setShowCreate(false);
        toast({ title: 'Meeting created', description: 'Virtual meeting added successfully.' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to create meeting.' }),
    },
  });

  const handleCreate = (values: VirtualMeetingFormValues) => {
    createMeeting.mutate({
      data: {
        title: values.title,
        scheduledDate: values.scheduledDate || undefined,
        status: values.status,
        hostId: values.hostId ? parseInt(values.hostId) : undefined,
        notes: values.notes || undefined,
      } as any,
    });
  };

  const statuses = [
    { value: undefined, label: 'All Meetings' },
    { value: 'suggested' as const, label: 'Suggested' },
    { value: 'scheduled' as const, label: 'Scheduled' },
    { value: 'completed' as const, label: 'Completed' },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Virtual Meetings</h1>
          <p className="text-muted-foreground mt-1">Track 1:1s, group syncs, and suggested touchpoints.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Schedule Meeting
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {statuses.map(({ value, label }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(value)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full transition-colors border',
              statusFilter === value
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && !meetings ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {meetings && meetings.length > 0 ? (
            <div className="divide-y divide-border">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'mt-1 p-2.5 rounded-xl shrink-0',
                      meeting.status === 'completed' ? 'bg-green-50 text-green-600' :
                      meeting.status === 'scheduled' ? 'bg-blue-50 text-blue-600' :
                      meeting.status === 'suggested' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-50 text-slate-600'
                    )}>
                      <Video className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <Link href={`/virtual-meetings/${meeting.id}`} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                          {meeting.title}
                        </Link>
                        <span className={cn(
                          'inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border',
                          meeting.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                          meeting.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          meeting.status === 'suggested' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        )}>
                          {meeting.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                        {meeting.scheduledDate ? (
                          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(meeting.scheduledDate), 'EEEE, MMM d, yyyy')}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" /> Unscheduled
                          </div>
                        )}
                        {meeting.host && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4" />
                            Host: <span className="font-medium text-foreground">{meeting.host.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {meeting.participantCount ?? 0} participants
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Link
                      href={`/virtual-meetings/${meeting.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-secondary/80"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
                <Video className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">No meetings found</h3>
              <p className="text-muted-foreground">No virtual meetings match your filter.</p>
            </div>
          )}
        </div>
      )}

      <VirtualMeetingForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        isPending={createMeeting.isPending}
      />
    </div>
  );
}
