import { useEffect } from 'react';

/** The title in index.html: what every page shows unless it sets its own. */
export const HOME_TITLE = 'Olanovo: say hello again to the people who already know you';

/**
 * Tab title for a page with its own title. A direct visit already gets it from the server; this
 * keeps it right when the page is opened from inside the app. Leaving goes back to the home title
 * (not to "whatever it was": on a direct visit that is this page's own title).
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title;
    return () => { document.title = HOME_TITLE; };
  }, [title]);
}
