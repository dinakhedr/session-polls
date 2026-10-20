'use client';

import Link from 'next/link';

/** Friendly error screen instead of a blank "Application error" page. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const notConfigured = /not configured/i.test(error?.message ?? '');
  return (
    <div className="center-screen">
      <div className="container container--narrow status-panel">
        <div className="status-icon" aria-hidden="true">!</div>
        <h1 className="h-section">
          {notConfigured ? 'The app is not connected to Supabase yet' : 'Something went wrong'}
        </h1>
        <p className="text-muted">
          {notConfigured
            ? 'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel → Settings → Environment Variables, then redeploy.'
            : 'Please try again. If the problem continues, refresh the page.'}
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn btn--dark" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn btn--ghost">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
