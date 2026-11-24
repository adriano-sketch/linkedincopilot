import { Link } from 'react-router-dom';
import { usePageTitle } from '@/lib/pageTitle';
import { ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';

export default function PrivacyPolicy() {
  usePageTitle('Privacy Policy | Olanovo');

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
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-12 text-sm">Last updated: November 24, 2026</p>

        <Section title="1. What Olanovo Does">
          <p className="mb-4">
            Olanovo is a web app and a Chrome extension that help a professional stay in
            touch with their LinkedIn network and reach new contacts. It is a product of
            scantosell.io, operated by Nortech LLC, which is responsible for the data described in
            this policy.
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              The extension reads LinkedIn pages in your own browser session to find recent posts
              by your connections and people who match an audience you define.
            </li>
            <li>
              The app drafts comments with AI, for you to review and edit.
            </li>
            <li>
              Comments are never posted by the extension. You open the post and publish the
              comment yourself on LinkedIn.
            </li>
            <li>
              Connection invitations to people who match an audience you set up are sent by the
              extension with the note you wrote. The extension does not send
              messages. All of it from your browser, within daily limits you can see.
            </li>
          </ul>
        </Section>

        <Section title="2. Data We Collect">
          <p className="mb-4">
            Olanovo collects and processes only the data needed to do what is described
            above:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              <strong className="text-gray-300">Your account:</strong>{' '}
              Email, name, plan and billing status.
            </li>
            <li>
              <strong className="text-gray-300">What you write in the app:</strong>{' '}
              Your subjects, your views on them, audiences, invitation notes and the comments
              you draft, edit or approve.
            </li>
            <li>
              <strong className="text-gray-300">Data about other LinkedIn members, read from pages in your session:</strong>{' '}
              Name, headline, company, location, profile address, connection degree and the text
              of recent posts. It comes from your list of connections, from the posts of your
              connections, from LinkedIn and Sales Navigator search results for the audiences you
              define, and from the profiles of people in your lists.
            </li>
            <li>
              <strong className="text-gray-300">Activity logs:</strong>{' '}
              What the extension did and when (for example "profile page opened", "invitation
              sent"), for your dashboard and for the daily limits.
            </li>
            <li>
              <strong className="text-gray-300">Authentication tokens:</strong>{' '}
              Your session token for our backend, stored locally in Chrome's storage.
            </li>
          </ul>
        </Section>

        <Section title="3. Data We Do NOT Collect">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>We do not read, store, or transmit your LinkedIn password or login credentials.</li>
            <li>
              We do not read your LinkedIn messages.
            </li>
            <li>
              We do not collect browsing history, cookies, or data from any website other
              than linkedin.com.
            </li>
            <li>
              We do not sell, rent, or share personal data with third parties for advertising or
              marketing purposes, and we do not use it to train AI models.
            </li>
          </ul>
        </Section>

        <Section title="4. How We Store Your Data and Who Processes It">
          <p className="mb-4">
            Your data is stored with a cloud database provider that is SOC 2 Type II compliant.
            Data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Each user's data is
            isolated by user ID: you can only access your own.
          </p>
          <p className="mb-4">
            To provide the service, some data is sent to service providers that process it on our
            behalf, and only for the purpose stated:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              <strong className="text-gray-300">An AI provider:</strong>{' '}
              Post text, public profile information and what you wrote in the app, to write drafts
              and to check whether a person matches your audience. It is not used to train AI
              models.
            </li>
            <li>
              <strong className="text-gray-300">A payment processor:</strong>{' '}
              Your email and subscription. We never see your card number.
            </li>
            <li>
              <strong className="text-gray-300">An email delivery provider:</strong>{' '}
              Your email address, to send you service notices.
            </li>
            <li>
              <strong className="text-gray-300">Hosting and database providers:</strong>{' '}
              The data described in this policy, to run the app.
            </li>
          </ul>
          <p className="mt-4">
            We do not buy profile data from data brokers or enrichment services. What Olanovo knows
            about a person comes from the LinkedIn pages opened in your own session and from the
            connections file you upload. You can ask for the current list of providers at the
            contact address below.
          </p>
        </Section>

        <Section title="5. LinkedIn Interaction">
          <p className="mb-4">
            The extension works inside your own browser, using your existing LinkedIn session. It
            opens LinkedIn pages, reads them, and sends the invitations described in
            section 1. It keeps to low daily limits, works only in the hours you choose, and pauses
            by itself if LinkedIn shows a verification or warning page. To read facts about your
            own account, such as whether it has a paid LinkedIn plan, the extension also calls
            LinkedIn's own web endpoints inside your session, the same ones LinkedIn's site uses.
          </p>
          <p>
            Olanovo is not affiliated with or endorsed by LinkedIn. LinkedIn's User
            Agreement restricts third-party tools that automate activity on its platform. Using
            the extension is your decision and may lead LinkedIn to warn or restrict your account.
          </p>
        </Section>

        <Section title="6. Permissions Explained">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              <strong className="text-gray-300">storage:</strong>{' '}
              To keep your sign-in state, your pause setting and today's counters in your browser.
            </li>
            <li>
              <strong className="text-gray-300">alarms:</strong>{' '}
              To check periodically whether there is something to do and to space actions out.
            </li>
            <li>
              <strong className="text-gray-300">tabs:</strong>{' '}
              To open the LinkedIn page an action needs and close it afterwards.
            </li>
            <li>
              <strong className="text-gray-300">scripting:</strong>{' '}
              To read the LinkedIn page that was opened and to carry out the action on it.
            </li>
            <li>
              <strong className="text-gray-300">host_permissions (linkedin.com):</strong>{' '}
              The extension only works on LinkedIn pages.
            </li>
            <li>
              <strong className="text-gray-300">host_permissions (our backend):</strong>{' '}
              To talk to our own server, where your data is stored.
            </li>
          </ul>
        </Section>

        <Section title="7. Data Retention and Deletion">
          <p>
            Your list data is retained for as long as your account is active. You may
            request deletion of all your data at any time by contacting us at the email
            below. Upon account deletion, all associated list data, profiles of the people in them, and
            activity logs are permanently removed from our servers within 30 days.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>
            You have the right to: access all data we store about you, request correction of
            inaccurate data, request deletion of your data, export your list data, and
            withdraw consent at any time by uninstalling the extension.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We may update this privacy policy from time to time. Changes will be posted on
            this page with an updated revision date. Continued use of the extension after
            changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <div className="mt-12 p-6 rounded-xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold text-white mb-3">10. Contact</h2>
          <p className="text-gray-400">
            If you have any questions about this privacy policy or your data, contact us at:
          </p>
          <p className="mt-3 text-gray-300">
            <strong>Email:</strong>{' '}
            <a
              href="mailto:privacy@olanovo.com"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              privacy@olanovo.com
            </a>
          </p>
          <p className="text-gray-300">
            <strong>Website:</strong>{' '}
            <a
              href="https://www.olanovo.com"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              olanovo.com
            </a>
          </p>
        </div>

        <p className="text-center text-gray-600 text-sm mt-16">
          &copy; {new Date().getFullYear()} Nortech LLC. Olanovo is a product of scantosell.io. Not affiliated with or endorsed by LinkedIn.
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
