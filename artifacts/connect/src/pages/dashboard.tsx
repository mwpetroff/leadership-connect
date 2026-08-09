import React from 'react';
import { Link } from 'wouter';
import {
  useGetDashboardSummary,
  useGetMeetupSuggestions,
  useGetVirtualSuggestions,
  getGetDashboardSummaryQueryKey
} from '@workspace/api-client-react';
import { 
  Users, Calendar, Video, AlertCircle, MapPin, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: meetupSuggestions } = useGetMeetupSuggestions();
  const { data: virtualSuggestions } = useGetVirtualSuggestions();

  if (loadingSummary) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted rounded-xl"></div>
          <div className="h-96 bg-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-muted-foreground mt-1 text-lg">Your team engagement at a glance.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Users className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">Total Organization</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-display font-bold">{summary.totalPeople}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {summary.totalExecutives} Execs · {summary.totalSecondaryLeaders} Leaders
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Calendar className="h-5 w-5 text-indigo-500" />
            <span className="font-medium text-sm">Upcoming Events</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-display font-bold">{summary.upcomingEvents}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Out of {summary.totalEvents} total events
              </div>
            </div>
            <Link href="/events" className="text-sm text-primary font-medium hover:underline">View all</Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-sm">Touchpoints Needed</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-display font-bold text-amber-600">{summary.staffNeedingTouchpoint}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Staff lacking recent engagement
              </div>
            </div>
            <Link href="/suggestions" className="text-sm text-primary font-medium hover:underline">Act now</Link>
          </div>
        </div>

        <div className="bg-primary text-primary-foreground rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3 opacity-90">
            <Lightbulb className="h-5 w-5" />
            <span className="font-medium text-sm">Total Suggestions</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-display font-bold">
                {(meetupSuggestions?.length || 0) + (virtualSuggestions?.length || 0)}
              </div>
              <div className="text-sm mt-1 opacity-90">
                Ready for your review
              </div>
            </div>
            <Link href="/suggestions" className="p-2 bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-full transition-colors">
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Urgent Virtual Touchpoints */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Priority Virtual Touchpoints</h2>
            <Link href="/suggestions" className="text-sm font-medium text-primary hover:underline">View all suggestions</Link>
          </div>
          
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {virtualSuggestions?.slice(0, 4).map((suggestion, idx) => (
              <div key={idx} className="p-4 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold shrink-0">
                      {suggestion.person.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <Link href={`/people/${suggestion.person.id}`} className="font-medium text-foreground hover:underline">
                        {suggestion.person.name}
                      </Link>
                      <div className="text-sm text-muted-foreground">
                        {suggestion.person.title} · {suggestion.person.homeCity}
                      </div>
                      <div className="mt-2 text-xs font-medium text-amber-600 bg-amber-50 inline-flex px-2 py-0.5 rounded">
                        {suggestion.reason}
                      </div>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
                    Schedule
                  </button>
                </div>
              </div>
            ))}
            {(!virtualSuggestions || virtualSuggestions.length === 0) && (
              <div className="p-8 text-center text-muted-foreground">
                No urgent virtual touchpoints needed right now.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming In-Person Opportunities */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Upcoming In-Person Opportunities</h2>
            <Link href="/events" className="text-sm font-medium text-primary hover:underline">View all events</Link>
          </div>
          
          <div className="space-y-4">
            {meetupSuggestions?.slice(0, 3).map((meetup, idx) => (
              <div key={idx} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <Link href={`/events/${meetup.event.id}`} className="font-semibold text-foreground hover:underline text-lg">
                      {meetup.event.name}
                    </Link>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {meetup.event.location} · {format(new Date(meetup.event.startDate), 'MMM d, yyyy')}
                    </div>
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wider px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                    {meetup.event.eventType}
                  </div>
                </div>
                
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">{meetup.suggestedPeople.length} local staff to invite:</div>
                  <div className="flex flex-wrap gap-2">
                    {meetup.suggestedPeople.slice(0, 5).map((sp, sIdx) => (
                      <div key={sIdx} className="text-xs bg-card border border-border px-2 py-1 rounded shadow-sm flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                        {sp.person.name}
                      </div>
                    ))}
                    {meetup.suggestedPeople.length > 5 && (
                      <div className="text-xs bg-card border border-border px-2 py-1 rounded shadow-sm text-muted-foreground">
                        +{meetup.suggestedPeople.length - 5} more
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-right">
                    <Link href={`/suggestions`} className="text-xs font-medium text-primary hover:underline">
                      Review suggestions →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {(!meetupSuggestions || meetupSuggestions.length === 0) && (
              <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm text-muted-foreground">
                No upcoming event opportunities found.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Activity Feed */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight mb-4">Recent Activity</h2>
        <div className="bg-card border border-border rounded-xl p-0 overflow-hidden shadow-sm">
          {summary.recentActivity.length > 0 ? (
            <div className="divide-y divide-border">
              {summary.recentActivity.map((activity, idx) => (
                <div key={idx} className="p-4 flex items-start gap-4">
                  <div className={cn(
                    "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    activity.type === 'invitation' ? 'bg-blue-50 text-blue-600' :
                    activity.type === 'attendance' ? 'bg-green-50 text-green-600' :
                    activity.type === 'virtual_meeting' ? 'bg-purple-50 text-purple-600' :
                    'bg-slate-50 text-slate-600'
                  )}>
                    {activity.type === 'invitation' && <Users className="h-4 w-4" />}
                    {activity.type === 'attendance' && <MapPin className="h-4 w-4" />}
                    {activity.type === 'virtual_meeting' && <Video className="h-4 w-4" />}
                    {(activity.type === 'person_added' || activity.type === 'event_added') && <Calendar className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{activity.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      {activity.personName && ` · ${activity.personName}`}
                      {activity.eventName && ` · ${activity.eventName}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">No recent activity.</div>
          )}
        </div>
      </div>

    </div>
  );
}

// Ensure Lightbulb is defined for the dashboard
function Lightbulb(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
}
