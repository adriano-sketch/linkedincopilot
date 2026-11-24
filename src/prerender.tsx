// Build-time rendering of the public pages (see scripts/prerender.mjs). Not part of the browser bundle.
// The pages are rendered exactly as a signed-out visitor first sees them, so the HTML the server sends
// already has the text; the app then starts in the browser as usual.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { TooltipProvider } from '@/components/ui/tooltip';
import Landing from '@/pages/Landing';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import Terms from '@/pages/Terms';

export function render(url: string): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <TooltipProvider>
          <StaticRouter location={url}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
            </Routes>
          </StaticRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
