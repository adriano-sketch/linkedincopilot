// Checkout and the billing portal open in the same tab, which unloads the page the person is on.
// Each form registers how to tell whether it holds edits that were not saved, and the code that is
// about to leave asks first.

const checks = new Set<() => boolean>();

/** Called by a component with a form. Returns the function that removes the registration. */
export function registerUnsavedCheck(check: () => boolean): () => void {
  checks.add(check);
  return () => { checks.delete(check); };
}

/** True when some registered form holds edits that were not saved. */
export function hasUnsavedChanges(): boolean {
  for (const check of checks) {
    try { if (check()) return true; } catch (e) { console.error('unsaved check failed:', e); }
  }
  return false;
}

/** True when it is fine to leave: nothing unsaved, or the person agreed to lose it. */
export function okToLeavePage(): boolean {
  return !hasUnsavedChanges() || window.confirm('You have changes that are not saved. Leave this page and lose them?');
}
