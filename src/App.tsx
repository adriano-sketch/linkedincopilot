import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import AuthPage from "./pages/AuthPage";
import Onboarding from "./pages/Onboarding";
import SettingsPage from "./pages/SettingsPage";
import LeadSourcing from "./pages/LeadSourcing";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import SetupGuide from "./pages/SetupGuide";
import HelpPage from "./pages/HelpPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leads" element={<LeadSourcing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/setup-guide" element={<SetupGuide />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
