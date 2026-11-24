import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { usePageTitle } from "@/lib/pageTitle";

const NotFound = () => {
  const location = useLocation();

  // The server answers 200 for every app address, so search engines are told here not to index this one.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const before = meta?.content;
    if (meta) meta.content = "noindex";
    return () => { if (meta && before != null) meta.content = before; };
  }, [location.pathname]);
  usePageTitle("Page not found | Olanovo");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">This page does not exist.</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
