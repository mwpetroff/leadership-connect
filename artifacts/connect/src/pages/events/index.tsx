import React, { useState } from 'react';
import { Link } from 'wouter';
import { useListEvents, useCreateEvent, getListEventsQueryKey } from '@workspace/api-client-react';
import { Calendar, MapPin, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { EventForm, type EventFormValues } from '@/components/forms/EventForm';

export default function EventsList() {
  const [filterUpcoming, setFilterUpcoming] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: events, isLoading } = useListEvents(
    { upcoming: filterUpcoming ? true : undefined },
    { query: { keepPreviousData: true } as any }
  );

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        setShowCreate(false);
        toast({ title: 'Event created', description: 'New event added to the calendar.' });
      },
      onError: () => toast({ title: 'Error', description: 'Failed to create event.' }),
    },
  });

  const handleCreate = (values: EventFormValues) => {
    createEvent.mutate({
      data: {
        name: values.name,
        description: values.description || undefined,
        location: values.location || undefined,
        city: values.city,
        state: values.state.toUpperCase(),
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        eventType: values.eventType,
      } as any,
    });
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Events</h1>
          <p className="text-muted-foreground mt-1">Manage in-person summits, conferences, and meetups.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Create Event
        </button>
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

      <EventForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        isPending={createEvent.isPending}
        mode="create"
      />
    </div>
  );
}
