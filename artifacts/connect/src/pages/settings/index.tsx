import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useLocation } from 'wouter';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Settings, Shield, ChevronDown, ChevronRight, AlertCircle, Building2, Pencil, Trash2, Plus, X, Check, Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

interface AuditEntry {
  id: number;
  actorId: string;
  actorName: string;
  action: 'create' | 'update' | 'delete';
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface AuditPage {
  items: AuditEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Office {
  id: number;
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL;

async function fetchSettings(): Promise<Setting[]> {
  const res = await fetch(`${BASE}api/settings`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

async function patchSetting(key: string, value: string): Promise<Setting> {
  const res = await fetch(`${BASE}api/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error('Failed to save setting');
  return res.json();
}

async function fetchAuditLog(page: number, resourceType?: string): Promise<AuditPage> {
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (resourceType && resourceType !== 'all') params.set('resourceType', resourceType);
  const res = await fetch(`${BASE}api/audit-log?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load audit log');
  return res.json();
}

async function fetchOffices(): Promise<Office[]> {
  const res = await fetch(`${BASE}api/offices`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load offices');
  return res.json();
}

async function createOffice(data: Omit<Office, 'id'>): Promise<Office> {
  const res = await fetch(`${BASE}api/offices`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create office');
  return res.json();
}

async function updateOffice(id: number, data: Partial<Omit<Office, 'id'>>): Promise<Office> {
  const res = await fetch(`${BASE}api/offices/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update office');
  return res.json();
}

async function deleteOffice(id: number): Promise<void> {
  const res = await fetch(`${BASE}api/offices/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete office');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionBadge(action: AuditEntry['action']) {
  const map = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
  } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[action]}`}>
      {action}
    </span>
  );
}

function DiffRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDiff = entry.before !== null || entry.after !== null;

  return (
    <>
      <TableRow className="hover:bg-muted/30">
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(parseISO(entry.createdAt), { addSuffix: true })}
        </TableCell>
        <TableCell className="text-sm font-medium">{entry.actorName}</TableCell>
        <TableCell>{actionBadge(entry.action)}</TableCell>
        <TableCell className="text-sm">
          <span className="text-muted-foreground">{entry.resourceType}</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="font-mono text-xs">{entry.resourceId}</span>
        </TableCell>
        <TableCell>
          {hasDiff && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              diff
            </button>
          )}
        </TableCell>
      </TableRow>
      {open && hasDiff && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/20 p-0">
            <div className="grid grid-cols-2 gap-0 text-xs font-mono overflow-auto">
              <div className="p-3 border-r border-border">
                <div className="text-muted-foreground mb-1 font-sans font-medium">Before</div>
                <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-destructive/80">
                  {entry.before != null ? JSON.stringify(entry.before, null, 2) : '—'}
                </pre>
              </div>
              <div className="p-3">
                <div className="text-muted-foreground mb-1 font-sans font-medium">After</div>
                <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-green-700">
                  {entry.after != null ? JSON.stringify(entry.after, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Settings form ─────────────────────────────────────────────────────────────

function EngagementRulesSection({ settings }: { settings: Setting[] }) {
  const queryClient = useQueryClient();
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? '';

  const [threshold, setThreshold] = useState(get('touchpoint_threshold_days'));
  const [radius, setRadius] = useState(get('suggestion_radius'));
  const [isDirty, setIsDirty] = useState(false);

  // Sync when settings load
  const thresholdFromProps = get('touchpoint_threshold_days');
  const radiusFromProps = get('suggestion_radius');

  const save = useMutation({
    mutationFn: async () => {
      await Promise.all([
        patchSetting('touchpoint_threshold_days', threshold),
        patchSetting('suggestion_radius', radius),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setIsDirty(false);
      toast({ title: 'Engagement rules saved' });
    },
    onError: () => toast({ title: 'Failed to save' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagement Rules</CardTitle>
        <CardDescription>
          Controls when staff appear on the "needs touchpoint" list and in virtual suggestions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="threshold">Touchpoint threshold (days)</Label>
          <div className="flex items-center gap-3 max-w-xs">
            <Input
              id="threshold"
              type="number"
              min={1}
              max={365}
              value={threshold}
              onChange={(e) => { setThreshold(e.target.value); setIsDirty(true); }}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Staff with no touchpoint in this many days are flagged on the dashboard and suggestions hub.
            Currently: <strong>{thresholdFromProps} days</strong>.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Meetup suggestion radius</Label>
          <Select value={radius} onValueChange={(v) => { setRadius(v); setIsDirty(true); }}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="city">Same city only</SelectItem>
              <SelectItem value="state">Same state (default)</SelectItem>
              <SelectItem value="nationwide">Nationwide</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Determines which staff members are suggested for in-person event meetups.
          </p>
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={!isDirty || save.isPending}
          size="sm"
        >
          {save.isPending ? 'Saving…' : 'Save engagement rules'}
        </Button>
      </CardContent>
    </Card>
  );
}

function OrganizationSection({ settings }: { settings: Setting[] }) {
  const queryClient = useQueryClient();
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? '';

  const [orgName, setOrgName] = useState(get('org_name'));
  const [isDirty, setIsDirty] = useState(false);

  const save = useMutation({
    mutationFn: () => patchSetting('org_name', orgName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setIsDirty(false);
      toast({ title: 'Organization settings saved' });
    },
    onError: () => toast({ title: 'Failed to save' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organization</CardTitle>
        <CardDescription>
          Display name shown in the sidebar header and exports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="orgName">Organization name</Label>
          <Input
            id="orgName"
            className="max-w-xs"
            value={orgName}
            onChange={(e) => { setOrgName(e.target.value); setIsDirty(true); }}
          />
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={!isDirty || save.isPending}
          size="sm"
        >
          {save.isPending ? 'Saving…' : 'Save organization name'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>
          Email and Teams notification delivery — coming in a future release.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-dashed p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Notification delivery is not yet configured. Toggles will be enabled once the email/Teams integration is set up.
        </div>
        <div className="mt-4 space-y-3 opacity-50 pointer-events-none select-none">
          {['Email digest (weekly)', 'Teams message on new invitation', 'Alert when touchpoint overdue'].map((label) => (
            <div key={label} className="flex items-center gap-3">
              <div className="h-4 w-8 rounded-full bg-muted" />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Office management ─────────────────────────────────────────────────────────

interface OfficeFormState {
  name: string;
  city: string;
  state: string;
  lat: string;
  lng: string;
}

const EMPTY_FORM: OfficeFormState = { name: '', city: '', state: '', lat: '', lng: '' };

function officeToForm(o: Office): OfficeFormState {
  return {
    name: o.name,
    city: o.city,
    state: o.state,
    lat: o.lat != null ? String(o.lat) : '',
    lng: o.lng != null ? String(o.lng) : '',
  };
}

function formToPayload(f: OfficeFormState) {
  return {
    name: f.name.trim(),
    city: f.city.trim(),
    state: f.state.trim(),
    lat: f.lat.trim() !== '' ? parseFloat(f.lat) : null,
    lng: f.lng.trim() !== '' ? parseFloat(f.lng) : null,
  };
}

function OfficeRow({
  office,
  onSaved,
  onDeleted,
}: {
  office: Office;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OfficeFormState>(officeToForm(office));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useMutation({
    mutationFn: () => updateOffice(office.id, formToPayload(form)),
    onSuccess: () => { setEditing(false); onSaved(); toast({ title: 'Office updated' }); },
    onError: () => toast({ title: 'Failed to update office' }),
  });

  const remove = useMutation({
    mutationFn: () => deleteOffice(office.id),
    onSuccess: () => { onDeleted(); toast({ title: 'Office removed' }); },
    onError: () => toast({ title: 'Failed to remove office' }),
  });

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            placeholder="City"
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.state}
            onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
            placeholder="State"
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Input
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="Lat"
              className="h-8 text-sm w-24"
              type="number"
              step="any"
            />
            <Input
              value={form.lng}
              onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="Lng"
              className="h-8 text-sm w-24"
              type="number"
              step="any"
            />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-green-600"
              disabled={update.isPending || !form.name.trim() || !form.city.trim() || !form.state.trim()}
              onClick={() => update.mutate()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => { setEditing(false); setForm(officeToForm(office)); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{office.name}</TableCell>
      <TableCell className="text-sm">{office.city}</TableCell>
      <TableCell className="text-sm">{office.state}</TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono">
        {office.lat != null && office.lng != null
          ? `${office.lat.toFixed(4)}, ${office.lng.toFixed(4)}`
          : <span className="italic">not set</span>}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setConfirmDelete(false)}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function OfficesSection() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<OfficeFormState>(EMPTY_FORM);

  const { data: offices = [], isLoading } = useQuery<Office[]>({
    queryKey: ['offices'],
    queryFn: fetchOffices,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['offices'] });

  const add = useMutation({
    mutationFn: () => createOffice(formToPayload(addForm) as Omit<Office, 'id'>),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      toast({ title: 'Office added' });
    },
    onError: () => toast({ title: 'Failed to add office' }),
  });

  const canAdd = addForm.name.trim() && addForm.city.trim() && addForm.state.trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Office Locations
            </CardTitle>
            <CardDescription className="mt-1">
              Offices and headquarters that appear on the Engagement Map.
            </CardDescription>
          </div>
          {!showAdd && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add office
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm animate-pulse">Loading offices…</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Add row */}
                {showAdd && (
                  <TableRow className="bg-primary/5">
                    <TableCell>
                      <Input
                        value={addForm.name}
                        onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. HQ"
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={addForm.city}
                        onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                        placeholder="City"
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={addForm.state}
                        onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                        placeholder="State"
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Input
                          value={addForm.lat}
                          onChange={e => setAddForm(f => ({ ...f, lat: e.target.value }))}
                          placeholder="Lat"
                          className="h-8 text-sm w-24"
                          type="number"
                          step="any"
                        />
                        <Input
                          value={addForm.lng}
                          onChange={e => setAddForm(f => ({ ...f, lng: e.target.value }))}
                          placeholder="Lng"
                          className="h-8 text-sm w-24"
                          type="number"
                          step="any"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-600"
                          disabled={add.isPending || !canAdd}
                          onClick={() => add.mutate()}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground"
                          onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {offices.length === 0 && !showAdd && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No offices added yet. Click "Add office" to get started.
                    </TableCell>
                  </TableRow>
                )}

                {offices.map(office => (
                  <OfficeRow
                    key={office.id}
                    office={office}
                    onSaved={invalidate}
                    onDeleted={invalidate}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Lat/Lng are optional — if left blank the office will still be listed but won't appear on the map.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Import People ─────────────────────────────────────────────────────────────

interface ImportSkippedRow {
  row: number;
  email: string;
  reason: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: ImportSkippedRow[];
}

const CSV_TEMPLATE = [
  'name,email,role,title,department,homeCity,homeState',
  'Jane Smith,jane.smith@example.com,staff,Senior Engineer,Engineering,Austin,TX',
  'John Doe,john.doe@example.com,executive,VP of Sales,Sales,New York,NY',
].join('\n');

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'people-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function postImport(csv: string): Promise<ImportResult> {
  const res = await fetch(`${BASE}api/people/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain' },
    body: csv,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Import failed');
  }
  return res.json();
}

function ImportPeopleSection() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async (csvText: string) => postImport(csvText),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['people'] });
      if (data.created > 0 || data.updated > 0) {
        toast({
          title: 'Import complete',
          description: `${data.created} created, ${data.updated} updated, ${data.skipped.length} skipped`,
        });
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      setResult(null);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file) return;
    const text = await file.text();
    importMutation.mutate(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Import People
        </CardTitle>
        <CardDescription>
          Upload a CSV exported from Workday, BambooHR, or any HRIS. Duplicate emails are updated, not rejected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Template download */}
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 bg-muted/20">
          <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Accepted columns</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">name</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">email</code>{' '}
              <span className="text-muted-foreground">(required)</span>
              {' · '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">role</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">title</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">department</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">homeCity</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">homeState</code>{' '}
              <span className="text-muted-foreground">(optional)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Valid roles: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">executive</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">secondary_leader</code>{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">staff</code>{' '}
              (defaults to <em>staff</em> if blank or unrecognised)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
            Download template
          </Button>
        </div>

        {/* File picker */}
        <div className="space-y-2">
          <Label htmlFor="csv-upload">CSV file</Label>
          <div className="flex items-center gap-3">
            <Input
              id="csv-upload"
              type="file"
              accept=".csv,text/csv"
              className="max-w-sm cursor-pointer"
              onChange={handleFileChange}
            />
            <Button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              size="sm"
            >
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
          {file && !importMutation.isPending && !result && (
            <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(1)} KB selected</p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Success summary */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Import complete
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-green-50 border-green-200 p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{result.created}</div>
                <div className="text-xs text-green-600 mt-0.5">Created</div>
              </div>
              <div className="rounded-lg border bg-blue-50 border-blue-200 p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{result.updated}</div>
                <div className="text-xs text-blue-600 mt-0.5">Updated</div>
              </div>
              <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{result.skipped.length}</div>
                <div className="text-xs text-amber-600 mt-0.5">Skipped</div>
              </div>
            </div>

            {result.skipped.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Skipped rows — fix and re-upload
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.skipped.map((s) => (
                        <TableRow key={`${s.row}-${s.email}`}>
                          <TableCell className="text-xs font-mono text-muted-foreground">{s.row}</TableCell>
                          <TableCell className="text-xs font-mono">{s.email}</TableCell>
                          <TableCell className="text-xs text-destructive">{s.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

const RESOURCE_TYPES = ['all', 'person', 'event', 'invitation', 'virtual_meeting', 'setting', 'office'];

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState('all');

  const { data, isLoading, isError } = useQuery<AuditPage>({
    queryKey: ['audit-log', page, resourceType],
    queryFn: () => fetchAuditLog(page, resourceType),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={resourceType} onValueChange={(v) => { setResourceType(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === 'all' ? 'All resource types' : t.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-10 text-muted-foreground text-sm animate-pulse">Loading audit log…</div>
      )}
      {isError && (
        <div className="text-center py-10 text-destructive text-sm">Failed to load audit log.</div>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">No audit log entries yet.</div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((entry) => (
                  <DiffRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();

  // Redirect non-admins
  if (!isAdmin) {
    navigate('/');
    return null;
  }

  const { data: settings = [], isLoading } = useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Platform configuration and admin audit trail</p>
        </div>
        <Badge variant="secondary" className="ml-auto flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Admin only
        </Badge>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="offices">Offices</TabsTrigger>
          <TabsTrigger value="import">Import People</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground animate-pulse text-sm">Loading settings…</div>
          ) : (
            <>
              <EngagementRulesSection settings={settings} />
              <OrganizationSection settings={settings} />
              <NotificationsSection />
            </>
          )}
        </TabsContent>

        <TabsContent value="offices" className="mt-4">
          <OfficesSection />
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <ImportPeopleSection />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
