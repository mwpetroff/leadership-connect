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
});

function Router() {
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
