import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Search, Plus, X, ExternalLink, MapPin, ChevronDown,
  Loader2, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VenueOption {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode?: string | null;
  webLink?: string | null;
  notes?: string | null;
  usageCount: number;
}

interface NewVenueForm {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  webLink: string;
  notes: string;
}

const EMPTY_FORM: NewVenueForm = {
  name: '', address: '', city: '', state: '', zipCode: '', webLink: '', notes: '',
};

interface Props {
  value: VenueOption | null;
  onChange: (venue: VenueOption | null) => void;
  label?: string;
  placeholder?: string;
  optional?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function venueLabel(v: VenueOption) {
  return `${v.name} — ${v.city}, ${v.state}`;
}

async function fetchVenues(): Promise<VenueOption[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/venues`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load venues');
  return res.json();
}

async function createVenue(body: Omit<NewVenueForm, ''>) {
  const res = await fetch(`${import.meta.env.BASE_URL}api/venues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to create venue'); }
  return res.json() as Promise<VenueOption>;
}

// ── VenueCard ─────────────────────────────────────────────────────────────────

function VenueCard({ venue, onClear }: { venue: VenueOption; onClear: () => void }) {
  return (
    <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span className="font-semibold text-foreground text-sm">{venue.name}</span>
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground ml-6">
        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{venue.address}, {venue.city}, {venue.state}{venue.zipCode ? ` ${venue.zipCode}` : ''}</span>
      </div>
      {venue.webLink && (
        <a
          href={venue.webLink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline ml-6"
        >
          <ExternalLink className="h-3 w-3" />
          {venue.webLink.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}
      {venue.notes && <p className="text-xs text-muted-foreground ml-6 italic">{venue.notes}</p>}
    </div>
  );
}

// ── NewVenueForm ──────────────────────────────────────────────────────────────

function NewVenuePanel({
  onSave, onCancel, isSaving, error,
}: {
  onSave: (form: NewVenueForm) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<NewVenueForm>(EMPTY_FORM);
  const set = (k: keyof NewVenueForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const f = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const l = 'block text-xs font-medium text-foreground mb-1';

  const valid = form.name.trim() && form.address.trim() && form.city.trim() && form.state.trim();

  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">New venue</span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className={l}>Venue name *</label>
          <input value={form.name} onChange={set('name')} className={f} placeholder="Marriott Marquis" autoFocus />
        </div>
        <div>
          <label className={l}>Street address *</label>
          <input value={form.address} onChange={set('address')} className={f} placeholder="1535 Broadway" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className={l}>City *</label>
            <input value={form.city} onChange={set('city')} className={f} placeholder="New York" />
          </div>
          <div>
            <label className={l}>State *</label>
            <input value={form.state} onChange={set('state')} className={f} placeholder="NY" maxLength={2}
              onBlur={e => setForm(p => ({ ...p, state: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className={l}>ZIP</label>
            <input value={form.zipCode} onChange={set('zipCode')} className={f} placeholder="10036" />
          </div>
        </div>
        <div>
          <label className={l}>Website (optional)</label>
          <input value={form.webLink} onChange={set('webLink')} className={f} placeholder="https://marriott.com/…" type="url" />
        </div>
        <div>
          <label className={l}>Notes (optional)</label>
          <textarea value={form.notes} onChange={set('notes')} className={`${f} resize-none`} rows={2} placeholder="Parking info, AV setup, etc." />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => valid && onSave(form)}
          disabled={!valid || isSaving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save venue
        </button>
      </div>
    </div>
  );
}

// ── Main VenuePicker ──────────────────────────────────────────────────────────

export function VenuePicker({ value, onChange, label = 'Venue', placeholder = 'Search venues…', optional = false }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ['venues'],
    queryFn: fetchVenues,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: createVenue,
    onSuccess: (venue) => {
      qc.setQueryData<VenueOption[]>(['venues'], prev => [venue, ...(prev ?? [])]);
      onChange(venue);
      setOpen(false);
      setShowNewForm(false);
      setQuery('');
      setSaveError(null);
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query.trim()
    ? venues.filter(v =>
        v.name.toLowerCase().includes(query.toLowerCase()) ||
        v.city.toLowerCase().includes(query.toLowerCase()) ||
        v.state.toLowerCase().includes(query.toLowerCase()) ||
        v.address.toLowerCase().includes(query.toLowerCase())
      )
    : venues;

  if (value) {
    return (
      <div className="space-y-1">
        {label && <div className="text-sm font-medium text-foreground">{label}{optional ? ' (optional)' : ''}</div>}
        <VenueCard venue={value} onClear={() => onChange(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-1" ref={dropRef}>
      {label && (
        <div className="text-sm font-medium text-foreground">
          {label}{optional ? <span className="text-muted-foreground font-normal"> (optional)</span> : ''}
        </div>
      )}

      {showNewForm ? (
        <NewVenuePanel
          onSave={form => createMutation.mutate(form)}
          onCancel={() => setShowNewForm(false)}
          isSaving={createMutation.isPending}
          error={saveError}
        />
      ) : (
        <div className="relative">
          <div
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm cursor-pointer',
              open && 'border-primary/60 ring-2 ring-primary/20',
            )}
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
            {open ? (
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                placeholder={placeholder}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 text-muted-foreground">{placeholder}</span>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          {open && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-72 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading venues…
                </div>
              ) : filtered.length === 0 && query ? (
                <div className="py-4 px-4 text-sm text-muted-foreground text-center">
                  No venues match "{query}"
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => { onChange(v); setOpen(false); setQuery(''); }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm text-foreground group-hover:text-primary">{v.name}</div>
                        {v.usageCount > 0 && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {v.usageCount} event{v.usageCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {v.address}, {v.city}, {v.state}
                      </div>
                      {v.webLink && (
                        <div className="text-xs text-primary/60 mt-0.5 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {v.webLink.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowNewForm(true); setOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border sticky bottom-0 bg-popover"
              >
                <Plus className="h-4 w-4" /> Add new venue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
