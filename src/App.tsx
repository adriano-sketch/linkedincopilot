import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import AuthPage from "./pages/AuthPage";
import Onboarding from "./pages/Onboarding";
import SettingsPage from "./pages/SettingsPage";
import LeadSourcing from "./pages/LeadSourcing";
import Network from "./pages/Network";
import InboxPage from "./pages/Inbox";
import Today from "./pages/Today";
import NotFound from "./pages/NotFound";
import SetupGuide from "./pages/SetupGuide";
import HelpPage from "./pages/HelpPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

// The public pages are also rendered at build time by src/prerender.tsx, inside a copy of these
// providers. A provider added here that Landing, PrivacyPolicy or Terms needs must be added there too.
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leads" element={<LeadSourcing />} />
            <Route path="/network" element={<Network />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/today" element={<Today />} />
            <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
            <Route path="/setup-guide" element={<SetupGuide />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
