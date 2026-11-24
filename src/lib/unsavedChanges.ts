// Checkout and the billing portal open in the same tab, which unloads the page the person is on.
// A page with a form registers how to tell whether it holds edits that were not saved, and the
// code that is about to leave asks first.

let hasUnsaved: (() => boolean) | null = null;

/** Called by a page with a form. Returns the function that removes the registration. */
export function registerUnsavedCheck(check: () => boolean): () => void {
  hasUnsaved = check;
  return () => { if (hasUnsaved === check) hasUnsaved = null; };
}

/** True when it is fine to leave: nothing unsaved, or the person agreed to lose it. */
export function okToLeavePage(): boolean {
  let unsaved = false;
  try { unsaved = hasUnsaved ? hasUnsaved() : false; } catch { unsaved = false; }
  return !unsaved || window.confirm('You have changes that are not saved. Leave this page and lose them?');
}
