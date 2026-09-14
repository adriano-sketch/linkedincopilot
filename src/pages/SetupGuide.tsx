import { Link } from 'react-router-dom';
import { ArrowRight, Chrome, Download, CircleCheck, WifiOff } from 'lucide-react';
import Brand from '@/components/Brand';

export default function SetupGuide() {
  return <div className="marketing-site min-h-screen"><header className="marketing-header"><div className="site-container marketing-nav"><Brand /><Link to="/help" className="text-sm">Help & resources</Link></div></header><main className="site-container py-14 max-w-3xl"><p className="eyebrow">CONNECT YOUR BROWSER</p><h1 className="text-4xl font-medium tracking-tight mb-5">A short setup.<br />A connected workspace.</h1><p className="text-sm text-muted-foreground leading-relaxed mb-9">The Chrome extension runs your campaign actions. Keep Chrome open with an active LinkedIn session while campaigns are running.</p>
    <a href="/linkedincopilot-extension.zip" download className="site-button mb-10"><Download size={16} /> Download extension ZIP</a>
    <ol className="space-y-5">{[
      ['Download and extract', 'Download the ZIP above. Extract it into a folder you can keep on your computer.'],
      ['Load the extension in Chrome', 'Open chrome://extensions in Chrome. Enable Developer mode, choose Load unpacked, and select the extracted extension folder containing manifest.json.'],
      ['Connect your Copilot account', 'Open the LinkedIn Copilot extension from Chrome’s extensions menu. Enter the email and password for your Copilot account, then select Connect.'],
      ['Open LinkedIn and check the workspace', 'Sign in to LinkedIn in the same browser. Return to your Copilot workspace and check the extension status before launching a campaign.'],
    ].map(([title, body], index) => <li key={title} className="rounded-xl border bg-white p-6 flex gap-5"><span className="text-xs font-semibold text-muted-foreground mt-1">0{index + 1}</span><div><h2 className="text-base font-semibold mb-2">{title}</h2><p className="text-sm text-muted-foreground leading-relaxed">{body}</p></div></li>)}</ol>
    <section className="rounded-xl border p-6 mt-7 bg-muted/30"><div className="flex gap-3 items-center mb-3"><WifiOff size={18} /><h2 className="font-semibold">Still showing offline?</h2></div><ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed"><li>Confirm the extension is enabled and signed in to the same Copilot account.</li><li>Keep LinkedIn open and logged in. Refresh the tab after installing the extension.</li><li>Allow time for the next connection update, then check the workspace again.</li><li>When the computer sleeps or Chrome closes, browser execution is unavailable.</li></ul></section>
    <div className="mt-9 flex items-center justify-between gap-4 flex-wrap"><Link to="/dashboard" className="site-button">Open workspace <ArrowRight size={16} /></Link><Link to="/help" className="text-xs underline">More help</Link></div>
  </main></div>;
}
