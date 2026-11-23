import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Start a newly opened page at the top. Back/forward keeps the browser's own
 * position, and links to a section (#pricing) are left to the page.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
}
