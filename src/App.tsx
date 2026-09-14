import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LeadSourcing = lazy(() => import("./pages/LeadSourcing"));
import NotFound from "./pages/NotFound";
const SetupGuide = lazy(() => import("./pages/SetupGuide"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));

const DesignPreview = import.meta.env.DEV ? lazy(() => import("./dev/DesignPreview")) : null;

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading your workspace…</div>}>
          <Routes>
            {DesignPreview && <Route path="/design-preview" element={<DesignPreview />} />}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leads" element={<LeadSourcing />} />
            <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
            <Route path="/setup-guide" element={<SetupGuide />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
