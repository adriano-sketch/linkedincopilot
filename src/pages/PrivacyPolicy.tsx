import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoImg from '@/assets/logo.png';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-300">
      {/* Navbar */}
      <nav className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="LinkedIn Copilot" className="h-8 w-8" />
            <span className="text-white font-semibold text-lg">LinkedIn Copilot</span>
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
        <p className="text-gray-500 mb-12 text-sm">Last updated: April 19, 2026</p>

        <Section title="1. What LinkedIn Copilot Does">
          <p>
            LinkedIn Copilot is a browser extension that helps professionals automate their
            LinkedIn outreach workflows. It assists with sending personalized connection
            requests, direct messages, and follow-ups to leads you have selected in your
            campaigns.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p className="mb-4">
            LinkedIn Copilot collects and processes only the data strictly necessary to
            deliver its functionality:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              <strong className="text-gray-300">LinkedIn profile data you interact with:</strong>{' '}
              Names, profile URLs, and connection status of leads you add to your campaigns.
              This data is sourced from pages you actively visit on LinkedIn.
            </li>
            <li>
              <strong className="text-gray-300">Messages you compose:</strong>{' '}
              The personalized connection notes, DMs, and follow-up messages that you create
              or approve within the extension.
            </li>
            <li>
              <strong className="text-gray-300">Campaign activity logs:</strong>{' '}
              Timestamps and status of actions performed (e.g., "connection request sent",
              "DM delivered") for your campaign tracking dashboard.
            </li>
            <li>
              <strong className="text-gray-300">Authentication tokens:</strong>{' '}
              Your session token, stored locally in Chrome's secure storage, to authenticate
              with our backend.
            </li>
          </ul>
        </Section>

        <Section title="3. Data We Do NOT Collect">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>We do not read, store, or transmit your LinkedIn password or login credentials.</li>
            <li>We do not scrape or collect data from profiles you have not added to your campaigns.</li>
            <li>
              We do not access your LinkedIn inbox, connections list, or feed content beyond
              what is necessary for campaign actions.
            </li>
            <li>
              We do not collect browsing history, cookies, or data from any website other
              than linkedin.com.
            </li>
            <li>
              We do not sell, rent, or share your personal data with third parties for
              advertising or marketing purposes.
            </li>
          </ul>
        </Section>

        <Section title="4. How We Store Your Data">
          <p>
            Campaign data (lead profiles, messages, activity logs) is stored securely on
            Supabase, a SOC 2 Type II compliant cloud platform hosted on AWS. Data is
            encrypted in transit (TLS 1.2+) and at rest (AES-256). Each user's data is
            isolated by user ID — you can only access your own campaigns and leads.
          </p>
        </Section>

        <Section title="5. LinkedIn Interaction">
          <p>
            The extension interacts with LinkedIn on your behalf by performing actions you
            have explicitly configured and approved in your campaigns. All actions respect
            LinkedIn's rate limits and usage guidelines. The extension operates within your
            active browser tab and uses your existing LinkedIn session — it does not create
            separate connections to LinkedIn's servers.
          </p>
        </Section>

        <Section title="6. Permissions Explained">
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>
              <strong className="text-gray-300">storage:</strong>{' '}
              To save your campaign settings, preferences, and authentication state locally
              in your browser.
            </li>
            <li>
              <strong className="text-gray-300">alarms:</strong>{' '}
              To schedule periodic campaign processing (checking for pending actions, rate
              limit cooldowns).
            </li>
            <li>
              <strong className="text-gray-300">tabs:</strong>{' '}
              To navigate to LinkedIn profile pages where campaign actions are performed.
            </li>
            <li>
              <strong className="text-gray-300">scripting:</strong>{' '}
              To inject the content script that reads profile information and performs
              actions on LinkedIn pages.
            </li>
            <li>
              <strong className="text-gray-300">host_permissions (linkedin.com):</strong>{' '}
              Required to interact with LinkedIn pages for campaign automation.
            </li>
            <li>
              <strong className="text-gray-300">host_permissions (supabase.co):</strong>{' '}
              Required to communicate with our secure backend for campaign data storage and
              synchronization.
            </li>
          </ul>
        </Section>

        <Section title="7. Data Retention and Deletion">
          <p>
            Your campaign data is retained for as long as your account is active. You may
            request deletion of all your data at any time by contacting us at the email
            below. Upon account deletion, all associated campaign data, lead profiles, and
            activity logs are permanently removed from our servers within 30 days.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>
            You have the right to: access all data we store about you, request correction of
            inaccurate data, request deletion of your data, export your campaign data, and
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
              href="mailto:privacy@linkedincopilot.io"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              privacy@linkedincopilot.io
            </a>
          </p>
          <p className="text-gray-300">
            <strong>Website:</strong>{' '}
            <a
              href="https://www.linkedincopilot.io"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              linkedincopilot.io
            </a>
          </p>
        </div>

        <p className="text-center text-gray-600 text-sm mt-16">
          &copy; {new Date().getFullYear()} LinkedIn Copilot. All rights reserved.
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
