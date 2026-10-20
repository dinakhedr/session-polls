'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import { delay } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace('/dashboard');
      })
      .catch(() => setError('The app is not connected to Supabase yet. Please check the setup guide.'));
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace('/dashboard');
    } catch {
      setError('The email or password is incorrect.');
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <SiteHeader>
        <Link href="/" className="lnk">
          Join a session
        </Link>
      </SiteHeader>
      <main className="page__main">
        <div className="container container--narrow stack stack--lg">
          <div className="stack stack--sm fade-up">
            <p className="eyebrow">Host area</p>
            <h1 className="h-display">
              Welcome <span className="accent">back</span>
            </h1>
            <p className="lead">Sign in to create sessions and run live polls.</p>
          </div>
          <form className="form fade-up" style={delay('.15s')} onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="notice notice--error">{error}</p>}
            <button className="btn btn--dark btn--block" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
