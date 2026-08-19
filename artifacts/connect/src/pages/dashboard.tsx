import React from 'react';
import { Link } from 'wouter';
import { Users, Video, AlertCircle, ArrowRight, Calendar } from 'lucide-react';
import { useScope, scopeToListParams } from '@/lib/scope';
import { useAuth } from '@/lib/auth';
import { getWantToActions, type WantToAction } from '@/lib/want-to';
import { cn } from '@/lib/utils';
import { useGetDashboardSummary } from '@workspace/api-client-react';

const CLOCKS: { key: string; label: string; color: string }[] = [
  { key: 'hrbp_1on1', label: 'HRBP 1:1', color: 'text-violet-600' },
  { key: 'leader_1on1', label: 'Leadership 1:1', color: 'text-sky-600' },
  { key: 'skip_level', label: 'Skip-level 1:1', color: 'text-amber-600' },
  { key: 'onsite_leadership', label: 'Onsite × leadership', color: 'text-rose-600' },
];

const chipClass =
  'px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-card text-foreground hover:border-primary hover:text-primary transition-colors';

function WantToStarters({
  actions,
  onCoverHrbp,
}: {
  actions: WantToAction[];
  onCoverHrbp: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4" data-testid="want-to">
      <span className="text-sm font-medium text-muted-foreground mr-1">I want to</span>
      {actions.map((action) =>
        action.href ? (
          <Link key={action.id} href={action.href} className={chipClass}>
            {action.label}
          </Link>
        ) : (
          <button
            key={action.id}
            type="button"
            className={chipClass}
            onClick={action.action === 'cover_hrbp' ? onCoverHrbp : undefined}
          >
            {action.label}
          </button>
        ),
      )}
    </div>
  );
}

export default function Dashboard() {
  const { scope, setScope } = useScope();
  const { user, isHrbp, isLeader } = useAuth();
  const { data: summary, isLoading } = useGetDashboardSummary(scopeToListParams(scope));
  const isStaff = !isLeader;

  const people = summary?.coverage?.people ?? [];
  const firstOverduePersonId =
    people.find((r) => r.overdueCount > 0 && r.person)?.person?.id ?? null;
  const actions = getWantToActions({
    isHrbp,
    isLeader,
    personId: user?.personId,
    firstOverduePersonId,
  });

  function coverAnotherHrbp() {
    setScope({ lens: 'hrbp' });
    document.getElementById('scope-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isStaff ? 'Home' : 'Coverage'}
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            {isStaff
              ? 'Look someone up, or see how the org connects.'
              : 'Who in this view is overdue — and on which clock.'}
          </p>
          <WantToStarters actions={actions} onCoverHrbp={coverAnotherHrbp} />
        </div>
        {!isStaff && (
          <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted rounded-xl" />)}
          </div>
        )}
      </div>
    );
  }

  const counts = summary.coverage?.counts ?? {};

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {isStaff ? 'Home' : 'Coverage'}
        </h1>
        <p className="text-muted-foreground mt-1 text-lg">
          {isStaff
            ? 'Look someone up, or see how the org connects. Coverage clocks are for HRBPs and leaders — switch the view above if you need to browse a department.'
            : 'Who in this view is overdue — and on which clock.'}
        </p>
        <WantToStarters actions={actions} onCoverHrbp={coverAnotherHrbp} />
      </div>

      {!isStaff && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {CLOCKS.map((c) => (
              <div key={c.key} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="text-sm font-medium text-muted-foreground mb-2">{c.label}</div>
                <div className={cn('text-3xl font-display font-bold', c.color)}>{counts[c.key] ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">people overdue or never</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">People in view</span>
              </div>
              <div className="text-2xl font-display font-bold">{summary.totalPeople}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Any gap</span>
              </div>
              <div className="text-2xl font-display font-bold text-amber-600">{summary.staffNeedingTouchpoint}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">Upcoming events</span>
              </div>
              <div className="text-2xl font-display font-bold">{summary.upcomingEvents}</div>
              <div className="text-xs text-muted-foreground mt-1">of {summary.totalEvents} total</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Engagement risks</h2>
              <Link href="/suggestions" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                Close gaps <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              {people.filter((r) => r.overdueCount > 0 && r.person).slice(0, 12).map((row) => (
                <div key={row.person!.id} className="p-4 border-b border-border last:border-0 flex gap-3 items-start">
                  <div className="h-10 w-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {row.person!.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/people/${row.person!.id}`} className="font-medium hover:underline">
                      {row.person!.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.person!.title} · {row.person!.homeCity}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {row.gaps.filter((g) => g.overdue).map((g) => (
                        <span key={g.kind} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          {g.label ?? g.kind.replace(/_/g, ' ')}
                          {g.daysSince == null ? ' · never' : ` · ${g.daysSince}d`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    href={`/people/${row.person!.id}`}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg"
                  >
                    Log 1:1
                  </Link>
                </div>
              ))}
              {people.filter((r) => r.overdueCount > 0).length === 0 && (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Video className="h-8 w-8 opacity-30" />
                  No overdue clocks in this view.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
