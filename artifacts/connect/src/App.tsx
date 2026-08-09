import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Shell } from '@/components/layout/Shell';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import PeopleDirectory from '@/pages/people';
import PersonDetail from '@/pages/people/detail';
import EventsList from '@/pages/events';
import EventDetail from '@/pages/events/detail';
import VirtualMeetings from '@/pages/virtual-meetings';
import VirtualMeetingDetail from '@/pages/virtual-meetings/detail';
import SuggestionsHub from '@/pages/suggestions';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
  // Redirect to login on any 401 — session expired or never established.
  queryCache: undefined,
  mutationCache: undefined,
});

// Global 401 handler: redirect to login whenever a query or mutation surfaces
// an unauthenticated response (session expired mid-session).
queryClient.getQueryCache().config.onError = (error: unknown) => {
  if ((error as any)?.status === 401) {
    window.location.href = '/api/auth/login';
  }
};
queryClient.getMutationCache().config.onError = (error: unknown) => {
  if ((error as any)?.status === 401) {
    window.location.href = '/api/auth/login';
  }
};

function Router() {
  const { user, isLoading } = useAuth();

  // Show a minimal loading screen while the session is being resolved.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  // Unauthenticated: show login page regardless of the requested path.
  if (!user) {
    return <LoginPage />;
  }

  return (
    <RoutedErrorBoundary>
      <Shell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/people" component={PeopleDirectory} />
          <Route path="/people/:id" component={PersonDetail} />
          <Route path="/events" component={EventsList} />
          <Route path="/events/:id" component={EventDetail} />
          <Route path="/virtual-meetings" component={VirtualMeetings} />
          <Route path="/virtual-meetings/:id" component={VirtualMeetingDetail} />
          <Route path="/suggestions" component={SuggestionsHub} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
