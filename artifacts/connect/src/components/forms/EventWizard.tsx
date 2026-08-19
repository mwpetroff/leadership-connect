import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckSquare, Square, X, ChevronRight, ChevronLeft,
  CalendarDays, Users, MapPin, Loader2, UserCircle2,
  Building2, Star, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonPicker } from './PersonPicker';
import { VenuePicker, type VenueOption } from './VenuePicker';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PickedPerson { id: number; name: string; title?: string | null; role: string; }
interface NearbyPerson { id: number; name: string; title: string | null; role: string; department: string | null; homeCity: string; homeState: string; distanceMiles: number; }

export interface WizardResult {
  /** Core event data */
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  eventType: string;
  /** Multiple sponsors — stored in event_sponsors junction table */
  sponsorIds?: number[];
  organizerId?: number;
  /** Venues */
  venueId?: number;
  eveningVenueId?: number;
  /** Derived for geocoding / nearby search (from primary venue) */
  city: string;
  state: string;
  location: string;
  /** People */
  leaderIds: number[];
  requiredAttendeeIds: number[];
  nearbyInviteIds: number[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (result: WizardResult) => void;
  isPending: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  executive:        { label: 'Executive',  bg: 'bg-amber-50',  text: 'text-amber-700' },
  secondary_leader: { label: 'Leader',     bg: 'bg-violet-50', text: 'text-violet-700' },
  staff:            { label: 'Staff',      bg: 'bg-sky-50',    text: 'text-sky-700' },
};

const STEPS = [
  { label: 'Details',    icon: CalendarDays },
  { label: 'Venue',      icon: Building2 },
  { label: 'Attendees',  icon: Users },
  { label: 'Nearby',     icon: MapPin },
];

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.label}>
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                done   ? 'bg-primary text-primary-foreground' :
                active ? 'bg-primary/15 text-primary border-2 border-primary' :
                         'bg-muted text-muted-foreground',
              )}>
                {done ? '✓' : i + 1}
              </div>
              <span className={cn('text-xs font-medium hidden sm:inline', active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className={cn('flex-1 h-px mx-2', done ? 'bg-primary' : 'bg-border')} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Person pill row ────────────────────────────────────────────────────────────

function PersonPills({ people, onRemove }: { people: PickedPerson[]; onRemove: (id: number) => void }) {
  if (!people.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {people.map(p => {
        const rc = ROLE_CONFIG[p.role] ?? ROLE_CONFIG.staff;
        return (
          <div key={p.id} className={cn('flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-full border text-xs font-medium', rc.bg, rc.text, 'border-current/20')}>
            <div className="h-5 w-5 rounded-full bg-white/60 flex items-center justify-center text-[10px] font-bold">{initials(p.name)}</div>
            <span>{p.name}</span>
            <button onClick={() => onRemove(p.id)} className="ml-0.5 hover:opacity-70 rounded-full p-0.5"><X className="h-3 w-3" /></button>
          </div>
        );
      })}
    </div>
  );
}

function SinglePersonPill({ person, onRemove, label }: { person: PickedPerson | null; onRemove: () => void; label: string }) {
  if (!person) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 bg-muted/50 border border-border rounded-lg px-3 py-2">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{initials(person.name)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{person.name}</div>
        <div className="text-xs text-muted-foreground">{person.title ?? label}</div>
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-foreground p-1 rounded"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function AddPersonRow({ label, description, people, onAdd, onRemove, roleFilter, excludeIds = [] }: {
  label: string; description: string; people: PickedPerson[];
  onAdd: (p: PickedPerson) => void; onRemove: (id: number) => void;
  roleFilter?: string; excludeIds?: number[];
}) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <button type="button" onClick={() => setShowPicker(true)}
          className="text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 font-medium flex items-center gap-1">
          <UserCircle2 className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <PersonPills people={people} onRemove={onRemove} />
      <PersonPicker open={showPicker} onClose={() => setShowPicker(false)} onSelect={p => onAdd(p as PickedPerson)}
        title={`Add ${label}`} description={description}
        excludeIds={[...excludeIds, ...people.map(p => p.id)]} roleFilter={roleFilter as any} />
    </div>
  );
}

// ── CSS helpers ────────────────────────────────────────────────────────────────

const F = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
const L = 'block text-sm font-medium text-foreground mb-1';
const E = 'text-xs text-destructive mt-1';

// ── Wizard ─────────────────────────────────────────────────────────────────────

export function EventWizard({ open, onClose, onComplete, isPending }: Props) {
  const [step, setStep] = useState(0);

  // Step 1 — details
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [startDate, setStart]     = useState('');
  const [endDate, setEnd]         = useState('');
  const [eventType, setType]      = useState<string>('summit');
  const [sponsors, setSponsors]   = useState<PickedPerson[]>([]);
  const [organizer, setOrganizer] = useState<PickedPerson | null>(null);
  const [showOrganizerPicker, setShowOrganizerPicker] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // Step 2 — venues
  const [primaryVenue,  setPrimaryVenue]  = useState<VenueOption | null>(null);
  const [hasEvening,    setHasEvening]    = useState(false);
  const [eveningVenue,  setEveningVenue]  = useState<VenueOption | null>(null);
  const [step2Errors, setStep2Errors]     = useState<Record<string, string>>({});

  // Step 3 — attendees
  const [executives, setExecs]             = useState<PickedPerson[]>([]);
  const [leaders,    setLeaders]           = useState<PickedPerson[]>([]);
  const [required,   setRequired]          = useState<PickedPerson[]>([]);

  // Step 4 — nearby
  const [nearbySelected,    setNearbySelected]    = useState<Set<number>>(new Set());
  const [nearbyInitialised, setNearbyInitialised] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName(''); setDesc(''); setStart(''); setEnd(''); setType('summit');
    setSponsors([]); setOrganizer(null);
    setStep1Errors({}); setStep2Errors({});
    setPrimaryVenue(null); setHasEvening(false); setEveningVenue(null);
    setExecs([]); setLeaders([]); setRequired([]);
    setNearbySelected(new Set()); setNearbyInitialised(false);
  }, [open]);

  // ── Nearby fetch ─────────────────────────────────────────────────────────────

  const allPickedIds = [...executives, ...leaders, ...required].map(p => p.id);

  const { data: nearbyData, isLoading: nearbyLoading } = useQuery<{ people: NearbyPerson[]; radiusMiles: number }>({
    queryKey: ['nearby-wizard', primaryVenue?.city, primaryVenue?.state],
    queryFn: async () => {
      const p = new URLSearchParams({ city: primaryVenue!.city, state: primaryVenue!.state });
      const r = await fetch(`${import.meta.env.BASE_URL}api/people/nearby?${p}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load nearby people');
      return r.json();
    },
    enabled: step === 3 && !!primaryVenue,
    staleTime: 60_000,
  });

  const nearbyPeople = (nearbyData?.people ?? []).filter(p => !allPickedIds.includes(p.id));

  useEffect(() => {
    if (step === 3 && nearbyPeople.length > 0 && !nearbyInitialised) {
      setNearbySelected(new Set(nearbyPeople.map(p => p.id)));
      setNearbyInitialised(true);
    }
    if (step !== 3) setNearbyInitialised(false);
  }, [step, nearbyPeople.length, nearbyInitialised]);

  // ── Validation ────────────────────────────────────────────────────────────────

  function validateStep1() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Event name is required';
    if (!startDate)   errs.startDate = 'Start date is required';
    setStep1Errors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2() {
    const errs: Record<string, string> = {};
    if (!primaryVenue) errs.primaryVenue = 'Select or create a venue for this event';
    if (hasEvening && !eveningVenue) errs.eveningVenue = 'Select or create the evening venue';
    setStep2Errors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  function next() {
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && !validateStep2()) return;
    setStep(s => s + 1);
  }
  function back() { setStep(s => s - 1); }

  function finish() {
    const allLeaderIds = [...new Set([...executives.map(p => p.id), ...leaders.map(p => p.id)])];
    onComplete({
      name: name.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate: endDate || undefined,
      eventType,
      sponsorIds:  sponsors.length > 0 ? sponsors.map(s => s.id) : undefined,
      organizerId: organizer?.id,
      venueId:     primaryVenue?.id,
      eveningVenueId: (hasEvening && eveningVenue) ? eveningVenue.id : undefined,
      city:     primaryVenue?.city  ?? '',
      state:    primaryVenue?.state ?? '',
      location: primaryVenue?.name  ?? name.trim(),
      leaderIds:            allLeaderIds,
      requiredAttendeeIds:  required.map(p => p.id),
      nearbyInviteIds:      Array.from(nearbySelected),
    });
  }

  const toggleNearby = (id: number) => setNearbySelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <StepIndicator current={step} />

        {/* ── STEP 1: Details ──────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className={L}>Event Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={F} placeholder="Annual Leadership Summit" autoFocus />
              {step1Errors.name && <p className={E}>{step1Errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>Event Type *</label>
                <select value={eventType} onChange={e => setType(e.target.value)} className={F}>
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
                <input value={description} onChange={e => setDesc(e.target.value)} className={F} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>Start Date *</label>
                <input type="date" value={startDate} onChange={e => setStart(e.target.value)} className={F} />
                {step1Errors.startDate && <p className={E}>{step1Errors.startDate}</p>}
              </div>
              <div>
                <label className={L}>End Date</label>
                <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} className={F} />
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Event Roles</p>

              {/* Multi-sponsor using AddPersonRow */}
              <div className="flex items-start gap-1.5 mb-0.5">
                <Star className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <AddPersonRow
                  label="Sponsors"
                  description="People or executives sponsoring this event (multiple allowed)"
                  people={sponsors}
                  onAdd={(p) => setSponsors(prev => prev.some(s => s.id === p.id) ? prev : [...prev, p])}
                  onRemove={(id) => setSponsors(prev => prev.filter(s => s.id !== id))}
                  excludeIds={organizer ? [organizer.id] : []}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground"><User className="h-3.5 w-3.5 text-sky-500" /> Organizer</div>
                    <div className="text-xs text-muted-foreground">Person coordinating logistics</div>
                  </div>
                  {!organizer && (
                    <button type="button" onClick={() => setShowOrganizerPicker(true)}
                      className="text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 font-medium flex items-center gap-1">
                      <UserCircle2 className="h-3.5 w-3.5" /> Select
                    </button>
                  )}
                </div>
                <SinglePersonPill person={organizer} label="Organizer" onRemove={() => setOrganizer(null)} />
                <PersonPicker open={showOrganizerPicker} onClose={() => setShowOrganizerPicker(false)}
                  onSelect={p => { setOrganizer(p as PickedPerson); }} title="Select Organizer"
                  description="Who is coordinating logistics for this event?"
                  excludeIds={sponsors.map(s => s.id)} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">Cancel</button>
              <button type="button" onClick={next} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                Next: Venue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Venue(s) ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Select the venue for this event, or create a new one. The primary venue is used to geocode and find nearby team members.</p>

            <div>
              <VenuePicker value={primaryVenue} onChange={v => { setPrimaryVenue(v); setStep2Errors({}); }} label="Primary Venue *" placeholder="Search venues…" />
              {step2Errors.primaryVenue && <p className={E + ' mt-1'}>{step2Errors.primaryVenue}</p>}
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={hasEvening} onChange={e => setHasEvening(e.target.checked)} className="accent-primary h-4 w-4 rounded" />
                <div>
                  <div className="text-sm font-medium text-foreground">Add an evening event</div>
                  <div className="text-xs text-muted-foreground">A separate venue for the evening reception, dinner, or social event</div>
                </div>
              </label>

              {hasEvening && (
                <div className="mt-4 pl-6 border-l-2 border-primary/20 space-y-2">
                  <VenuePicker value={eveningVenue} onChange={v => { setEveningVenue(v); setStep2Errors(p => ({ ...p, eveningVenue: '' })); }}
                    label="Evening Venue" placeholder="Search venues…" />
                  {step2Errors.eveningVenue && <p className={E}>{step2Errors.eveningVenue}</p>}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <button onClick={back} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={next} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                Next: Attendees <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Attendees ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Add executives and leaders attending this event, then any required staff. Executives and leaders become event leaders. Required staff receive direct invitations.</p>

            <div className="space-y-5 divide-y divide-border">
              <AddPersonRow label="Executives" description="Added as event leaders" people={executives}
                onAdd={p => setExecs(prev => [...prev, p])} onRemove={id => setExecs(prev => prev.filter(p => p.id !== id))}
                roleFilter="executive" excludeIds={[...leaders.map(p => p.id), ...required.map(p => p.id)]} />
              <div className="pt-5">
                <AddPersonRow label="Secondary Leaders" description="Added as event leaders" people={leaders}
                  onAdd={p => setLeaders(prev => [...prev, p])} onRemove={id => setLeaders(prev => prev.filter(p => p.id !== id))}
                  roleFilter="secondary_leader" excludeIds={[...executives.map(p => p.id), ...required.map(p => p.id)]} />
              </div>
              <div className="pt-5">
                <AddPersonRow label="Required Attendees" description="Staff who must attend — receive a direct invitation" people={required}
                  onAdd={p => setRequired(prev => [...prev, p])} onRemove={id => setRequired(prev => prev.filter(p => p.id !== id))}
                  excludeIds={[...executives.map(p => p.id), ...leaders.map(p => p.id)]} />
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <button onClick={back} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={next} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                Next: Nearby <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Nearby invites ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Team members near <strong>{primaryVenue?.city}, {primaryVenue?.state}</strong> not yet on the guest list.
              {nearbyData && <span> Radius: <strong>{nearbyData.radiusMiles} miles</strong>.</span>}
              {' '}Deselect anyone you don't want to invite.
            </p>

            {nearbyLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Finding nearby team members…
              </div>
            ) : nearbyPeople.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm bg-muted/30 rounded-xl">
                <MapPin className="h-8 w-8 mx-auto opacity-20 mb-2" />
                No additional team members found within the radius.
                <br /><span className="text-xs">You can invite more people from the event page later.</span>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                  <button onClick={() => {
                    if (nearbySelected.size === nearbyPeople.length) setNearbySelected(new Set());
                    else setNearbySelected(new Set(nearbyPeople.map(p => p.id)));
                  }} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
                    {nearbySelected.size === nearbyPeople.length
                      ? <><CheckSquare className="h-3.5 w-3.5" /> Deselect all</>
                      : <><Square className="h-3.5 w-3.5" /> Select all</>}
                  </button>
                  <span className="text-xs text-muted-foreground">{nearbySelected.size} of {nearbyPeople.length} selected</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border">
                  {nearbyPeople.map(p => {
                    const rc = ROLE_CONFIG[p.role] ?? ROLE_CONFIG.staff;
                    return (
                      <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20">
                        <input type="checkbox" checked={nearbySelected.has(p.id)} onChange={() => toggleNearby(p.id)} className="accent-primary h-4 w-4 rounded shrink-0" />
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">{initials(p.name)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{p.title ?? 'No title'}{p.department ? ` · ${p.department}` : ''}</div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', rc.bg, rc.text)}>{rc.label}</span>
                          <span className="text-xs text-muted-foreground">{p.distanceMiles.toFixed(0)} mi</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <button onClick={back} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={finish} disabled={isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                  : `Create Event${nearbySelected.size + required.length > 0 ? ` & Invite ${nearbySelected.size + required.length}` : ''}`}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
