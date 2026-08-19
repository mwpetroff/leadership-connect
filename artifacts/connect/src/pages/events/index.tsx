import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  useListEvents, useCreateEvent, useAddEventLeader, useBulkCreateInvitations,
  getListEventsQueryKey,
} from '@workspace/api-client-react';
import { Calendar, MapPin, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { EventWizard, type WizardResult } from '@/components/forms/EventWizard';
import { useAuth } from '@/lib/auth';

export default function EventsList() {
  const [filterUpcoming, setFilterUpcoming] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [wizardPending, setWizardPending] = useState(false);
  const { isAdmin } = useAuth();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: events, isLoading } = useListEvents(
    { upcoming: filterUpcoming ? true : undefined },
    { query: { keepPreviousData: true } as any }
  );

  const createEvent = useCreateEvent({ mutation: {} });
  const addLeader = useAddEventLeader({ mutation: {} });
  const bulkInvite = useBulkCreateInvitations({ mutation: {} });

  /** Wizard finish — create event then add leaders + bulk-invite in parallel */
  const handleWizardComplete = async (result: WizardResult) => {
    setWizardPending(true);
    try {
      const { leaderIds, requiredAttendeeIds, nearbyInviteIds } = result;
      const created = await createEvent.mutateAsync({
        data: {
          name:           result.name,
          description:    result.description || undefined,
          location:       result.location,
          city:           result.city,
          state:          result.state,
          startDate:      result.startDate,
          endDate:        result.endDate || undefined,
          eventType:      result.eventType,
          venueId:        result.venueId,
          eveningVenueId: result.eveningVenueId,
          sponsorIds:     result.sponsorIds,
          organizerId:    result.organizerId,
        } as any,
      });
      const eventId = (created as any).id as number;

      // Add leaders + invite attendees concurrently
      await Promise.all([
        ...leaderIds.map(pid =>
          addLeader.mutateAsync({ eventId, personId: pid }).catch(() => null)
        ),
        ...(requiredAttendeeIds.length + nearbyInviteIds.length > 0 ? [
          bulkInvite.mutateAsync({
            id: eventId,
            data: {
              personIds: [...new Set([...requiredAttendeeIds, ...nearbyInviteIds])],
              createCalendarEvent: false,
            },
          }).catch(() => null),
        ] : []),
      ]);

      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      setShowCreate(false);
      const inviteCount = new Set([...requiredAttendeeIds, ...nearbyInviteIds]).size;
      toast({
        title: 'Event created',
        description: [
          leaderIds.length > 0 && `${leaderIds.length} leader${leaderIds.length !== 1 ? 's' : ''} added`,
          inviteCount > 0 && `${inviteCount} invitation${inviteCount !== 1 ? 's' : ''} sent`,
        ].filter(Boolean).join(' · ') || 'New event added to the calendar.',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to create event. Please try again.' });
    } finally {
      setWizardPending(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Events</h1>
          <p className="text-muted-foreground mt-1">Manage in-person summits, conferences, and meetups.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Event
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        {[
          { label: 'Upcoming Events', value: true },
          { label: 'All Events', value: false },
        ].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setFilterUpcoming(value)}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              filterUpcoming === value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && !events ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events?.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <div className="group h-full bg-card border border-border rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all hover:border-primary/30 flex flex-col cursor-pointer">
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-xs font-medium uppercase tracking-wider px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                      {event.eventType}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                      {format(new Date(event.startDate), 'MMM d')}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
                    {event.name}
                  </h3>
                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{event.location} · {event.city}, {event.state}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-muted/40 p-4 border-t border-border grid grid-cols-3 gap-2 text-center divide-x divide-border">
                  <div>
                    <div className="text-xl font-display font-bold">{event.leaderCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Leaders</div>
                  </div>
                  <div>
                    <div className="text-xl font-display font-bold">{event.inviteeCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Invited</div>
                  </div>
                  <div>
                    <div className="text-xl font-display font-bold">{event.attendeeCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Attended</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {events?.length === 0 && (
            <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl text-muted-foreground">
              No events found.
            </div>
          )}
        </div>
      )}

      <EventWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onComplete={handleWizardComplete}
        isPending={wizardPending}
      />
    </div>
  );
}
