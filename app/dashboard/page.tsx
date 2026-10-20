'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import { supabase } from '@/lib/supabase';
import { useHost } from '@/lib/useHost';
import { delay, prettyCode } from '@/lib/types';

interface SessionRow {
  id: string;
  title: string;
  code: string;
  created_at: string;
  polls: { count: number }[];
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DashboardPage() {
  const router = useRouter();
  const { ready } = useHost();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('sessions')
      .select('id, title, code, created_at, polls(count)')
      .order('created_at', { ascending: false });
    if (error) setError('Your sessions could not be loaded. Please refresh the page.');
    else setSessions((data ?? []) as unknown as SessionRow[]);
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().from('sessions').insert({ title: t }).select('id').single();
    if (error || !data) {
      setError('The session could not be created. Please try again.');
      setBusy(false);
      return;
    }
    router.push(`/sessions/${data.id}`);
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.replace('/login');
  }

  if (!ready) return null;

  return (
    <div className="page">
      <SiteHeader href="/dashboard">
        <button className="lnk" onClick={signOut}>
          Sign out
        </button>
      </SiteHeader>
      <main className="page__main">
        <div className="container stack stack--lg">
          <div className="stack stack--sm fade-up">
            <p className="eyebrow">Dashboard</p>
            <h1 className="h-display">
              Your <span className="accent">sessions</span>
            </h1>
          </div>

          <form className="card card--beige fade-up" style={delay('.1s')} onSubmit={createSession}>
            <div className="field">
              <label htmlFor="title">New session</label>
              <p className="field__hint">For example: &ldquo;Growth Strategy Workshop — Day 1&rdquo;</p>
            </div>
            <div className="btn-row">
              <div className="field" style={{ flex: '1 1 280px' }}>
                <input
                  id="title"
                  placeholder="Session title"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <button className="btn btn--dark" type="submit" disabled={busy || !title.trim()}>
                {busy ? 'Creating…' : 'Create session'}
              </button>
            </div>
          </form>

          {error && <p className="notice notice--error">{error}</p>}

          {sessions && sessions.length === 0 && (
            <div className="empty">No sessions yet. Create your first one above.</div>
          )}

          {sessions && sessions.length > 0 && (
            <div className="grid">
              {sessions.map((s, i) => {
                const n = s.polls?.[0]?.count ?? 0;
                return (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="card fade-up"
                    style={delay(`${Math.min(i, 8) * 0.05}s`)}
                  >
                    <p className="card__kicker">{dateFmt.format(new Date(s.created_at))}</p>
                    <p className="card__title">{s.title}</p>
                    <div className="btn-row" style={{ marginTop: 'auto' }}>
                      <span className="chip chip--white code-chip">Code {prettyCode(s.code)}</span>
                      <span className="chip chip--white">
                        {n} {n === 1 ? 'poll' : 'polls'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
