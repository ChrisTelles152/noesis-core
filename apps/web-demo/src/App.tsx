import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Demo from "@/pages/Demo";
import Documentation from "@/pages/Documentation";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CoreSmoke from "@/pages/CoreSmoke";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === '/login' || location === '/register';
  const isSmokePage = location === '/core-smoke';

  return (
    <>
      {!isAuthPage && !isSmokePage && <Header />}
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/demo" component={Demo} />
        <Route path="/documentation" component={Documentation} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/core-smoke" component={CoreSmoke} />
        <Route component={NotFound} />
      </Switch>
      {!isAuthPage && !isSmokePage && <Footer />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
