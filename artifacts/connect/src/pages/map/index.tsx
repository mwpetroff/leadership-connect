import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Users, CalendarDays, X, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapPerson {
  id: number;
  name: string;
  role: string;
  title: string | null;
  homeCity: string | null;
  homeState: string | null;
  lat: number | null;
  lng: number | null;
}

interface MapInvitee {
  personId: number;
  personName: string;
  personRole: string;
  personTitle: string | null;
  status: string;
}

interface MapEvent {
  id: number;
  name: string;
  location: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  startDate: string;
  endDate: string;
  eventType: string;
  invitees: MapInvitee[];
}

interface MapData {
  people: MapPerson[];
  events: MapEvent[];
}

interface LatLng { lat: number; lng: number; }

interface PlottedPerson extends MapPerson { latlng: LatLng; }
interface PlottedEvent extends MapEvent { latlng: LatLng; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { fill: string; stroke: string; label: string; radius: number }> = {
  executive: { fill: '#f59e0b', stroke: '#d97706', label: 'Executive',      radius: 10 },
  secondary_leader: { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Leader', radius: 8 },
  staff:     { fill: '#38bdf8', stroke: '#0ea5e9', label: 'Staff',          radius: 6 },
};

const STATUS_COLORS: Record<string, string> = {
  invited:   'bg-blue-100 text-blue-700',
  attended:  'bg-emerald-100 text-emerald-700',
  no_show:   'bg-red-100 text-red-700',
  declined:  'bg-gray-100 text-gray-600',
};

function roleConfig(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.staff;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// ── LeafletMap (lazy-loaded to avoid SSR issues) ─────────────────────────────

type SelectionType = 'person' | 'event' | null;
interface Selection { type: SelectionType; id: number; }

interface LeafletMapProps {
  people: PlottedPerson[];
  events: PlottedEvent[];
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  filter: { showExecs: boolean; showLeaders: boolean; showStaff: boolean; showEvents: boolean };
}

function LeafletMap({ people, events, selection, onSelect, filter }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);

  // Lazy-load leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let L: any;

    (async () => {
      L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      const map = L.map(containerRef.current!, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = { map, L };
      drawMarkers();
    })();

    return () => {
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function clearOverlays() {
    const { map } = mapRef.current ?? {};
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    linesRef.current.forEach(l => l.remove());
    markersRef.current = [];
    linesRef.current = [];
  }

  function drawMarkers() {
    const ref = mapRef.current;
    if (!ref) return;
    const { map, L } = ref;
    clearOverlays();

    // Determine which person IDs are connected to the selected event (or vice versa)
    const connectedPersonIds = new Set<number>();
    const connectedEventIds = new Set<number>();

    if (selection?.type === 'event') {
      const ev = events.find(e => e.id === selection.id);
      ev?.invitees.forEach(inv => connectedPersonIds.add(inv.personId));
    } else if (selection?.type === 'person') {
      events.forEach(ev => {
        if (ev.invitees.some(inv => inv.personId === selection.id)) {
          connectedEventIds.add(ev.id);
        }
      });
    }

    // Draw people
    const visiblePeople = people.filter(p => {
      if (p.role === 'executive' && !filter.showExecs) return false;
      if (p.role === 'secondary_leader' && !filter.showLeaders) return false;
      if (p.role === 'staff' && !filter.showStaff) return false;
      return true;
    });

    visiblePeople.forEach(person => {
      const cfg = roleConfig(person.role);
      const isSelected = selection?.type === 'person' && selection.id === person.id;
      const isConnected = connectedPersonIds.has(person.id);
      const isDimmed = selection !== null && !isSelected && !isConnected;

      const marker = L.circleMarker([person.latlng.lat, person.latlng.lng], {
        radius: isSelected ? cfg.radius + 3 : cfg.radius,
        fillColor: cfg.fill,
        color: isSelected ? '#1e1b4b' : cfg.stroke,
        weight: isSelected ? 3 : isConnected ? 2 : 1.5,
        opacity: isDimmed ? 0.3 : 1,
        fillOpacity: isDimmed ? 0.2 : 0.85,
        zIndexOffset: isSelected ? 1000 : isConnected ? 500 : 0,
      }).addTo(map);

      marker.bindTooltip(
        `<div class="font-medium">${person.name}</div><div class="text-xs opacity-75">${person.title ?? cfg.label} · ${person.homeCity ?? ''}</div>`,
        { direction: 'top', className: 'leaflet-tooltip-custom' }
      );

      marker.on('click', () => {
        onSelect(isSelected ? null : { type: 'person', id: person.id });
      });

      markersRef.current.push(marker);
    });

    // Draw events
    if (filter.showEvents) {
      events.forEach(event => {
        const isSelected = selection?.type === 'event' && selection.id === event.id;
        const isConnected = connectedEventIds.has(event.id);
        const isDimmed = selection !== null && !isSelected && !isConnected;

        const svgSize = isSelected ? 36 : 30;
        const icon = L.divIcon({
          html: `
            <div style="position:relative;width:${svgSize}px;height:${svgSize}px">
              <svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;opacity:${isDimmed ? 0.25 : 1}">
                <circle cx="15" cy="13" r="12" fill="${isSelected ? '#7c3aed' : '#8b5cf6'}" stroke="${isSelected ? '#1e1b4b' : '#7c3aed'}" stroke-width="${isSelected ? 2 : 1.5}"/>
                <text x="15" y="17" text-anchor="middle" font-size="12" fill="white">📅</text>
              </svg>
              <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:-18px;white-space:nowrap;font-size:10px;font-weight:600;color:${isSelected ? '#7c3aed' : '#5b21b6'};background:white;padding:1px 4px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.2);opacity:${isDimmed ? 0.25 : 1}">
                ${event.name.length > 18 ? event.name.substring(0, 16) + '…' : event.name}
              </div>
            </div>`,
          iconSize: [svgSize, svgSize + 20],
          iconAnchor: [svgSize / 2, svgSize / 2],
          className: '',
        });

        const marker = L.marker([event.latlng.lat, event.latlng.lng], { icon, zIndexOffset: isSelected ? 2000 : 1000 }).addTo(map);
        marker.bindTooltip(
          `<div class="font-medium">${event.name}</div><div class="text-xs opacity-75">${format(new Date(event.startDate), 'MMM d')} · ${event.location}</div><div class="text-xs opacity-75">${event.invitees.length} invitee(s)</div>`,
          { direction: 'top', className: 'leaflet-tooltip-custom' }
        );
        marker.on('click', () => {
          onSelect(isSelected ? null : { type: 'event', id: event.id });
        });
        markersRef.current.push(marker);
      });
    }

    // Draw connection lines
    if (selection) {
      const selectedEvent = selection.type === 'event' ? events.find(e => e.id === selection.id) : null;
      const selectedPerson = selection.type === 'person' ? people.find(p => p.id === selection.id) : null;

      if (selectedEvent) {
        selectedEvent.invitees.forEach(inv => {
          const person = people.find(p => p.id === inv.personId);
          if (!person) return;
          const line = L.polyline(
            [[selectedEvent.latlng.lat, selectedEvent.latlng.lng], [person.latlng.lat, person.latlng.lng]],
            { color: roleConfig(person.role).stroke, weight: 1.5, opacity: 0.6, dashArray: '5,5' }
          ).addTo(map);
          linesRef.current.push(line);
        });
      } else if (selectedPerson) {
        events.filter(e => e.invitees.some(inv => inv.personId === selectedPerson.id)).forEach(event => {
          const line = L.polyline(
            [[selectedPerson.latlng.lat, selectedPerson.latlng.lng], [event.latlng.lat, event.latlng.lng]],
            { color: '#7c3aed', weight: 1.5, opacity: 0.6, dashArray: '5,5' }
          ).addTo(map);
          linesRef.current.push(line);
        });
      }
    }
  }

  // Redraw when data or selection changes
  useEffect(() => {
    drawMarkers();
  }, [people, events, selection, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function PersonPanel({ person, events }: { person: MapPerson; events: PlottedEvent[] }) {
  const attending = events.filter(e => e.invitees.some(inv => inv.personId === person.id));
  const cfg = roleConfig(person.role);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
          style={{ background: cfg.fill }}>
          {initials(person.name)}
        </div>
        <div>
          <div className="font-semibold text-foreground">{person.name}</div>
          <div className="text-xs text-muted-foreground">{person.title ?? cfg.label} · {[person.homeCity, person.homeState].filter(Boolean).join(', ')}</div>
        </div>
      </div>

      {attending.length > 0 ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Invited to events</div>
          <div className="space-y-2">
            {attending.map(ev => {
              const inv = ev.invitees.find(i => i.personId === person.id)!;
              return (
                <div key={ev.id} className="bg-muted/60 rounded-lg p-2.5">
                  <div className="font-medium text-sm">{ev.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(ev.startDate), 'MMM d, yyyy')} · {ev.location}</div>
                  <div className={cn("text-xs font-medium mt-1.5 inline-flex px-2 py-0.5 rounded-full", STATUS_COLORS[inv.status] ?? STATUS_COLORS.invited)}>
                    {inv.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Not invited to any events yet.</div>
      )}
    </div>
  );
}

function EventPanel({ event, people }: { event: MapEvent; people: MapPerson[] }) {
  const inviteePeople = event.invitees.map(inv => ({
    ...inv,
    person: people.find(p => p.id === inv.personId),
  })).filter(i => i.person);

  const execs = inviteePeople.filter(i => i.person!.role === 'executive');
  const leaders = inviteePeople.filter(i => i.person!.role === 'secondary_leader');
  const staff = inviteePeople.filter(i => i.person!.role === 'staff');

  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold text-foreground text-base">{event.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(event.startDate), 'MMM d')} – {format(new Date(event.endDate), 'MMM d, yyyy')}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <MapPin className="h-3 w-3" /> {event.location}
        </div>
        <div className="text-xs font-medium uppercase tracking-wide mt-2 inline-flex px-2 py-0.5 bg-primary/10 text-primary rounded-md">{event.eventType}</div>
      </div>

      {[{ label: 'Executives', items: execs }, { label: 'Leaders', items: leaders }, { label: 'Staff', items: staff }]
        .filter(g => g.items.length > 0)
        .map(group => (
          <div key={group.label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group.label}</div>
            <div className="space-y-1.5">
              {group.items.map(inv => {
                const cfg = roleConfig(inv.person!.role);
                return (
                  <div key={inv.personId} className="flex items-center gap-2.5 bg-muted/60 rounded-lg px-2.5 py-2">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: cfg.fill }}>
                      {initials(inv.personName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{inv.personName}</div>
                      <div className="text-xs text-muted-foreground truncate">{inv.personTitle ?? cfg.label}</div>
                    </div>
                    <div className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", STATUS_COLORS[inv.status] ?? STATUS_COLORS.invited)}>
                      {inv.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {event.invitees.length === 0 && (
        <div className="text-sm text-muted-foreground">No invitations yet.</div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EngagementMap() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState({ showExecs: true, showLeaders: true, showStaff: true, showEvents: true });

  const { data, isLoading } = useQuery<MapData>({
    queryKey: ['map-data'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/map-data`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load map data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading map data…</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Only plot records that have server-stored coordinates.
  // Records without coords were either not found by geocoding or haven't been
  // processed yet — the server backfill handles those asynchronously.
  const plottedPeople: PlottedPerson[] = data.people.flatMap(p => {
    if (p.lat === null || p.lat === undefined || p.lng === null || p.lng === undefined) return [];
    return [{ ...p, latlng: { lat: p.lat, lng: p.lng } }];
  });

  const plottedEvents: PlottedEvent[] = data.events.flatMap(e => {
    if (e.lat === null || e.lat === undefined || e.lng === null || e.lng === undefined) return [];
    return [{ ...e, latlng: { lat: e.lat, lng: e.lng } }];
  });

  const selectedPerson = selection?.type === 'person' ? data.people.find(p => p.id === selection.id) : null;
  const selectedEvent = selection?.type === 'event' ? data.events.find(e => e.id === selection.id) : null;

  const totalPeople = data.people.length;
  const plottedCount = plottedPeople.length;
  const totalEvents = data.events.length;
  const plottedEventsCount = plottedEvents.length;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Engagement Map</h1>
          <p className="text-muted-foreground mt-1">Visualize where your team is and where interactions will happen.</p>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {/* Left panel — filters + detail */}
        <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* Stats */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-xl font-bold text-foreground">{plottedCount}</div>
                <div className="text-xs text-muted-foreground">of {totalPeople} people mapped</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-xl font-bold text-foreground">{plottedEventsCount}</div>
                <div className="text-xs text-muted-foreground">of {totalEvents} events mapped</div>
              </div>
            </div>
            {plottedCount < totalPeople && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg p-2">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                {totalPeople - plottedCount} {totalPeople - plottedCount === 1 ? 'person has' : 'people have'} no mapped location.
              </div>
            )}
          </div>

          {/* Legend + filters */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show on map</div>
            {[
              { key: 'showExecs', label: 'Executives', color: '#f59e0b', count: data.people.filter(p => p.role === 'executive').length },
              { key: 'showLeaders', label: 'Leaders', color: '#8b5cf6', count: data.people.filter(p => p.role === 'secondary_leader').length },
              { key: 'showStaff', label: 'Staff', color: '#38bdf8', count: data.people.filter(p => p.role === 'staff').length },
              { key: 'showEvents', label: 'Events', color: '#7c3aed', count: data.events.length, isSquare: true },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filter[item.key as keyof typeof filter]}
                  onChange={e => setFilter(f => ({ ...f, [item.key]: e.target.checked }))}
                  className="sr-only"
                />
                <div className={cn(
                  "h-4 w-4 rounded flex items-center justify-center border-2 transition-colors shrink-0",
                  filter[item.key as keyof typeof filter] ? "border-transparent" : "border-border bg-muted"
                )}
                  style={filter[item.key as keyof typeof filter] ? { background: item.color, borderColor: item.color } : {}}>
                  {filter[item.key as keyof typeof filter] && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M8.5 2L4 7 1.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div className="h-3 w-3 rounded-full shrink-0" style={{ background: item.color }} />
                <span className="text-sm text-foreground flex-1">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.count}</span>
              </label>
            ))}
          </div>

          {/* Click hint */}
          {!selection && (
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground mb-1">Tip</div>
              Click any person or event marker on the map to see their connections and invitation details.
            </div>
          )}

          {/* Detail panel */}
          {(selectedPerson || selectedEvent) && (
            <div className="bg-card border border-border rounded-xl p-4 flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedPerson ? 'Person' : 'Event'} Details
                </div>
                <button onClick={() => setSelection(null)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              {selectedPerson && <PersonPanel person={selectedPerson} events={plottedEvents} />}
              {selectedEvent && <EventPanel event={selectedEvent} people={data.people} />}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {plottedPeople.length === 0 && plottedEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">No locations could be mapped yet.</p>
                <p className="text-sm text-muted-foreground">Make sure people have home cities set in their profiles.</p>
              </div>
            </div>
          ) : (
            <LeafletMap
              people={plottedPeople}
              events={plottedEvents}
              selection={selection}
              onSelect={setSelection}
              filter={filter}
            />
          )}
        </div>
      </div>
    </div>
  );
}
