// LinkedIn does not allow comments posted by an extension or script: the person has to click
// "Comment" on LinkedIn. Olanovo only hands the draft over: it copies the text and opens the post.

/** The post URL without Olanovo's internal "#lcpost=" marker. */
export const cleanPostUrl = (url: string | null | undefined) => (url || '').replace(/#lcpost=.*$/, '');

/** True when the link leads to the person's recent activity (the post is in that list), not to the post itself. */
export const isActivityUrl = (url: string | null | undefined) => /\/recent-activity\//.test(url || '');

/** Copies without waiting, so that it can run inside the click itself. False when the browser refuses. */
function copyNow(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copies the draft and opens the post in a new tab. Returns whether the copy worked. */
export async function openPostWithDraft(postUrl: string | null | undefined, text: string): Promise<{ copied: boolean; opened: boolean }> {
  // Copy and open both happen inside the click, with no waiting in between: a tab opened after a wait
  // is blocked by some browsers, and a copy attempted after the new tab took the focus can fail.
  const draft = text.trim();
  let copied = copyNow(draft);
  const url = cleanPostUrl(postUrl);
  let opened = false;
  if (url) { window.open(url, '_blank', 'noopener,noreferrer'); opened = true; }
  if (!copied) copied = await copyText(draft);
  return { copied, opened };
}
