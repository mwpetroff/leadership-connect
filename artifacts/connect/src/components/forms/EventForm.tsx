import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { User, Building2, MapPin, Sunset, ExternalLink, X } from 'lucide-react';
import type { Event, EventPersonSummary } from '@workspace/api-client-react';
import { PersonPicker } from './PersonPicker';
import { VenuePicker, type VenueOption } from './VenuePicker';

// ── Schema (basic text fields only — pickers use controlled state) ─────────────

const schema = z.object({
  name:        z.string().min(1, 'Event name is required'),
  description: z.string().optional().default(''),
  eventType:   z.enum(['summit', 'conference', 'marketing', 'leadership', 'regional', 'other']),
  startDate:   z.string().min(1, 'Start date is required'),
  endDate:     z.string().optional().default(''),
  city:        z.string().optional().default(''),
  state:       z.string().optional().default(''),
});

type BaseValues = z.infer<typeof schema>;

export type EventFormValues = BaseValues & {
  organizerId?:    number | null;
  venueId?:        number | null;
  eveningVenueId?: number | null;
  /** Free-text fallback when no venue selected */
  location?: string;
};

// ── Enriched default shape (what the API returns for a single event) ──────────

interface RichPerson { id: number; name: string; title?: string | null; role: string; }
type RichEvent = Partial<Event>;

interface Props {
  open:          boolean;
  onClose:       () => void;
  onSubmit:      (values: EventFormValues) => void;
  isPending:     boolean;
  defaultValues?: RichEvent;
  mode:          'create' | 'edit';
}

// ── CSS helpers ───────────────────────────────────────────────────────────────

const F = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors';
const L = 'block text-sm font-medium text-foreground mb-1';
const E = 'text-xs text-destructive mt-1';

// ── Small person pill (for selected organizer) ────────────────────────────────

function OrganizerPill({ person, onRemove }: { person: EventPersonSummary | RichPerson; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 mt-1.5 bg-muted/50 border border-border rounded-lg px-3 py-2">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
        {person.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{person.name}</div>
        <div className="text-xs text-muted-foreground">{person.title ?? 'Organizer'}</div>
      </div>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground p-1 rounded">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── VenueCard — shows selected venue ─────────────────────────────────────────

function VenueCard({ venue, onClear, accent = false }: { venue: VenueOption; onClear: () => void; accent?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl p-3 border mt-2 ${accent ? 'bg-indigo-50/50 border-indigo-100' : 'bg-muted/30 border-border'}`}>
      <div className={`p-1.5 rounded-lg shrink-0 ${accent ? 'bg-indigo-100 text-indigo-600' : 'bg-muted text-muted-foreground'}`}>
        {accent ? <Sunset className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{venue.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {venue.address}, {venue.city}, {venue.state}
        </div>
        {venue.webLink && (
          <a href={venue.webLink} target="_blank" rel="noreferrer"
            className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" />
            {venue.webLink.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )}
      </div>
      <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventForm({ open, onClose, onSubmit, isPending, defaultValues, mode }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<BaseValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', eventType: 'summit', startDate: '', endDate: '' },
  });

  // Controlled state for pickers
  const [organizer,    setOrganizer]    = useState<EventPersonSummary | RichPerson | null>(null);
  const [primaryVenue, setPrimaryVenue] = useState<VenueOption | null>(null);
  const [hasEvening,   setHasEvening]   = useState(false);
  const [eveningVenue, setEveningVenue] = useState<VenueOption | null>(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);

  // Populate from defaultValues when the dialog opens
  useEffect(() => {
    if (!open) return;

    reset(defaultValues ? {
      name:        defaultValues.name        ?? '',
      description: defaultValues.description ?? '',
      eventType:   defaultValues.eventType ?? 'summit',
      startDate:   defaultValues.startDate ?? '',
      endDate:     defaultValues.endDate ?? '',
      city:        defaultValues.city ?? '',
      state:       defaultValues.state ?? '',
    } : { name: '', description: '', eventType: 'summit', startDate: '', endDate: '', city: '', state: '' });

    // Organizer
    setOrganizer(defaultValues?.organizer ?? null);

    // Primary venue — build a VenueOption from the enriched object
    const v = defaultValues?.venue;
    setPrimaryVenue(v
      ? { id: v.id, name: v.name, address: v.address, city: v.city, state: v.state, zipCode: v.zipCode, webLink: v.webLink, notes: v.notes, usageCount: 0 }
      : null
    );

    // Evening venue
    const ev = defaultValues?.eveningVenue;
    if (ev) {
      setHasEvening(true);
      setEveningVenue({ id: ev.id, name: ev.name, address: ev.address, city: ev.city, state: ev.state, zipCode: ev.zipCode, webLink: ev.webLink, notes: ev.notes, usageCount: 0 });
    } else {
      setHasEvening(false);
      setEveningVenue(null);
    }
  }, [open, defaultValues, reset]);

  const handleFormSubmit = (base: BaseValues) => {
    const values: EventFormValues = {
      ...base,
      // When a venue is selected the backend derives city/state from it;
      // override the text-field values with the venue's city/state so they stay consistent.
      city:           primaryVenue ? primaryVenue.city  : base.city,
      state:          primaryVenue ? primaryVenue.state : base.state,
      organizerId:    organizer?.id    ?? null,
      venueId:        primaryVenue?.id ?? null,
      eveningVenueId: (hasEvening && eveningVenue) ? eveningVenue.id : null,
      location:       primaryVenue?.name,
    };
    onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Event' : 'Edit Event'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">

          {/* Name */}
          <div>
            <label className={L}>Event Name *</label>
            <input {...register('name')} className={F} placeholder="Annual Leadership Summit" />
            {errors.name && <p className={E}>{errors.name.message}</p>}
          </div>

          {/* Type + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={L}>Event Type *</label>
              <select {...register('eventType')} className={F}>
                <option value="summit">Summit</option>
                <option value="conference">Conference</option>
                <option value="marketing">Marketing</option>
                <option value="leadership">Leadership</option>
                <option value="regional">Regional</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={L}>Description</label>
              <input {...register('description')} className={F} placeholder="Optional" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={L}>Start Date *</label>
              <input {...register('startDate')} type="date" className={F} />
              {errors.startDate && <p className={E}>{errors.startDate.message}</p>}
            </div>
            <div>
              <label className={L}>End Date</label>
              <input {...register('endDate')} type="date" className={F} />
            </div>
          </div>

          {/* ── Organizer ──────────────────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <User className="h-3.5 w-3.5 text-sky-500" /> Organizer
                </div>
                <div className="text-xs text-muted-foreground">Person coordinating logistics</div>
              </div>
              {!organizer && (
                <button type="button" onClick={() => setShowOrgPicker(true)}
                  className="text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 font-medium">
                  Select
                </button>
              )}
            </div>
            {organizer && <OrganizerPill person={organizer} onRemove={() => setOrganizer(null)} />}
            <PersonPicker open={showOrgPicker} onClose={() => setShowOrgPicker(false)}
              onSelect={(p) => { setOrganizer(p as RichPerson); setShowOrgPicker(false); }}
              title="Select Organizer" description="Who is coordinating logistics?" />
          </div>

          {/* ── Primary Venue ─────────────────────────────────────────────────── */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Primary Venue
            </div>
            {primaryVenue
              ? <VenueCard venue={primaryVenue} onClear={() => setPrimaryVenue(null)} />
              : <VenuePicker value={null} onChange={setPrimaryVenue} label="" placeholder="Search or create a venue…" />
            }
            {/* City / State fallback when no venue selected */}
            {!primaryVenue && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className={L}>City</label>
                  <input {...register('city')} className={F} placeholder="New York" />
                </div>
                <div>
                  <label className={L}>State</label>
                  <input {...register('state')} className={F} placeholder="NY" maxLength={2} />
                </div>
              </div>
            )}
          </div>

          {/* ── Evening Venue ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={hasEvening} onChange={e => { setHasEvening(e.target.checked); if (!e.target.checked) setEveningVenue(null); }}
                className="accent-primary h-4 w-4 rounded" />
              <div>
                <div className="text-sm font-medium text-foreground">Evening event at a separate venue</div>
                <div className="text-xs text-muted-foreground">Reception, dinner, or social event</div>
              </div>
            </label>

            {hasEvening && (
              eveningVenue
                ? <VenueCard venue={eveningVenue} onClear={() => setEveningVenue(null)} accent />
                : <div className="pl-6 border-l-2 border-primary/20">
                    <VenuePicker value={null} onChange={setEveningVenue} label="" placeholder="Search or create evening venue…" />
                  </div>
            )}
          </div>

          <DialogFooter>
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
              {isPending ? 'Saving…' : mode === 'create' ? 'Create Event' : 'Save Changes'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
