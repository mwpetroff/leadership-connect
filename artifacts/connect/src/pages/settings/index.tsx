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
import { Settings, Shield, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
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

// ── Audit log tab ─────────────────────────────────────────────────────────────

const RESOURCE_TYPES = ['all', 'person', 'event', 'invitation', 'virtual_meeting', 'setting'];

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

        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
