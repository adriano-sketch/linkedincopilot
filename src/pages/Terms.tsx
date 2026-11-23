import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-300">
      {/* Navbar */}
      <nav className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo tone="dark" className="text-base" markClassName="w-7 h-7" />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-12 text-sm">Last updated: November 23, 2026</p>

        <Section title="1. The Agreement">
          <p>
            Olanovo is a product of scantosell.io, operated by Nortech LLC ("Olanovo", "we").
            These terms apply to the Olanovo web app at olanovo.com and to the Olanovo Chrome
            extension. By creating an account or installing the extension you agree to them. If
            you do not agree, do not use Olanovo.
          </p>
        </Section>

        <Section title="2. What Olanovo Does">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              The extension reads LinkedIn pages in your own browser session to find recent posts
              by the people in your lists and by the rest of your network.
            </li>
            <li>The app drafts comments with AI, for you to review and edit.</li>
            <li>
              Olanovo never posts a comment and never sends a message. You open the post and
              publish the comment yourself on LinkedIn.
            </li>
            <li>
              If you set it up, the extension sends connection invitations with the note you
              wrote, from your browser, within daily limits you can see.
            </li>
          </ul>
        </Section>

        <Section title="3. Your Account">
          <p>
            You must be at least 18 and able to enter into a contract. Keep your sign-in details
            to yourself; you are responsible for what happens in your account. One subscription
            covers one LinkedIn account, and it must be your own.
          </p>
        </Section>

        <Section title="4. LinkedIn">
          <p className="mb-4">
            Olanovo is not affiliated with or endorsed by LinkedIn. LinkedIn's User Agreement
            restricts third-party tools that automate activity on its platform. Using the
            extension is your decision and may lead LinkedIn to warn or restrict your account.
          </p>
          <p>
            Olanovo works within low daily limits and pauses when LinkedIn shows a verification
            or warning page, but it cannot promise that your LinkedIn account will not be
            warned or restricted, and it is not responsible if that happens.
          </p>
        </Section>

        <Section title="5. What You Agree Not to Do">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>Use Olanovo with a LinkedIn account that is not yours.</li>
            <li>Use it for spam, harassment, deception, or anything unlawful.</li>
            <li>Resell, copy or extract the data Olanovo shows you about other people.</li>
            <li>Try to get around the limits, the trial or the billing.</li>
            <li>Reverse engineer the service or interfere with how it runs.</li>
          </ul>
        </Section>

        <Section title="6. Your Content and AI Drafts">
          <p className="mb-4">
            What you write in Olanovo is yours: your subjects, your views, your notes and the
            comments you edit. You allow Olanovo to store and process it to provide the service.
          </p>
          <p>
            Drafts are written by AI and can be wrong, inaccurate or unsuitable. Read every
            draft before you use it. What you publish on LinkedIn is your responsibility.
          </p>
        </Section>

        <Section title="7. Trial, Price and Cancellation">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              The free trial lasts 14 days, includes everything, and does not ask for a card.
            </li>
            <li>
              If you do not subscribe when the trial ends, Olanovo stops looking for posts,
              writing drafts and sending invitations. What is already in your Inbox stays there.
            </li>
            <li>
              The Pro plan is billed in advance, by the month or by the year, at the price shown
              when you subscribe, and renews until you cancel.
            </li>
            <li>
              You can cancel at any time from Settings. Cancelling stops future charges.
            </li>
            <li>
              Prices can change. A new price applies from your next renewal, and you will be
              told before it does.
            </li>
            <li>
              Payments are not refunded, including for a period you did not finish, except
              where the law requires it. The free trial is there so you can test everything
              before you pay.
            </li>
            <li>
              For a question about a charge, write to{' '}
              <a href="mailto:support@olanovo.com" className="text-blue-400 hover:text-blue-300 transition-colors">support@olanovo.com</a>.
            </li>
          </ul>
        </Section>

        <Section title="8. Privacy">
          <p>
            The <Link to="/privacy" className="text-blue-400 hover:text-blue-300 transition-colors">Privacy Policy</Link>{' '}
            explains what data Olanovo processes and why. The extension reads data about other
            LinkedIn members from pages in your session; you are responsible for using that
            data lawfully.
          </p>
        </Section>

        <Section title="9. Availability and Changes">
          <p>
            Olanovo is provided as it is. It depends on LinkedIn pages that change without
            notice, so features can stop working for a time, and the service can change or be
            interrupted. No particular result, such as replies, meetings or sales, is promised.
          </p>
        </Section>

        <Section title="10. Liability">
          <p>
            To the extent the law allows, Olanovo is not liable for indirect or consequential
            losses, lost profits, lost data, or actions LinkedIn takes on your account, and its
            total liability to you is limited to what you paid for Olanovo in the 12 months
            before the claim. Nothing here removes rights the law gives you that cannot be
            waived.
          </p>
        </Section>

        <Section title="11. Ending the Agreement">
          <p>
            You can stop using Olanovo and ask for your account to be deleted at any time.
            Olanovo can suspend or close an account that breaks these terms.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These terms are governed by the laws of the State of Florida, United States. Any
            dispute about them or about Olanovo will be brought in the state or federal courts
            located in Florida.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            These terms can be updated. Changes are posted on this page with a new date.
            Continuing to use Olanovo after a change means you accept the updated terms.
          </p>
        </Section>

        <div className="mt-12 p-6 rounded-xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold text-white mb-3">14. Contact</h2>
          <p className="text-gray-400">Questions about these terms:</p>
          <p className="mt-3 text-gray-300">
            <strong>Email:</strong>{' '}
            <a href="mailto:support@olanovo.com" className="text-blue-400 hover:text-blue-300 transition-colors">
              support@olanovo.com
            </a>
          </p>
        </div>

        <p className="text-center text-gray-600 text-sm mt-16">
          &copy; {new Date().getFullYear()} Olanovo. All rights reserved.
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
      <div className="text-gray-400 leading-relaxed">{children}</div>
    </section>
  );
}
