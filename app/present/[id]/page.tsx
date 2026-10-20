'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import ResultsView from '@/components/ResultsView';
import { roomChannel, supabase } from '@/lib/supabase';
import { useHost } from '@/lib/useHost';
import { kindLabel, prettyCode, type Poll, type Results, type Session } from '@/lib/types';

export default function PresenterPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  const { ready } = useHost();

  const [session, setSession] = useState<Session | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [origin, setOrigin] = useState('');
  const [showQr, setShowQr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const roomRef = useRef<RealtimeChannel | null>(null);
  const lastPhoneRefresh = useRef(0);
  const reloadTimer = useRef<number | null>(null);

  const activeIndex = polls.findIndex((p) => p.id === session?.active_poll_id);
  const active = activeIndex >= 0 ? polls[activeIndex] : null;
  const activeId = active?.id ?? null;
  const joinUrl = session && origin ? `${origin}/join/${session.code}` : '';

  useEffect(() => setOrigin(window.location.origin), []);

  // ---------- Loading ----------
  const loadSession = useCallback(async () => {
    const sb = supabase();
    const [{ data: s }, { data: p }] = await Promise.all([
      sb.from('sessions').select('*').eq('id', id).maybeSingle(),
      sb.from('polls').select('*').eq('session_id', id).order('position').order('created_at'),
    ]);
    if (!s) {
      setNotFound(true);
      return;
    }
    setSession(s as Session);
    setPolls((p ?? []) as Poll[]);
  }, [id]);

  /** Tells participants' phones to refresh. */
  const notifyPhones = useCallback(() => {
    lastPhoneRefresh.current = Date.now();
    roomRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} });
  }, []);

  const loadResults = useCallback(async () => {
    if (!activeId) {
      setResults(null);
      return;
    }
    const { data } = await supabase().rpc('host_poll_results', { p_poll: activeId });
    if (data) setResults(data as Results);
    // Keep results on phones fresh too, at most every 3 seconds.
    if (session?.show_results && Date.now() - lastPhoneRefresh.current > 3000) notifyPhones();
  }, [activeId, session?.show_results, notifyPhones]);

  const scheduleResults = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      loadResults();
    }, 400);
  }, [loadResults]);

  useEffect(() => {
    if (ready) loadSession();
  }, [ready, loadSession]);

  // Room channel: receives "refresh" from the session editor, sends "refresh" to phones.
  useEffect(() => {
    if (!session?.code) return;
    const sb = supabase();
    const ch = sb.channel(roomChannel(session.code)).on('broadcast', { event: 'refresh' }, () => loadSession());
    ch.subscribe();
    roomRef.current = ch;
    return () => {
      roomRef.current = null;
      sb.removeChannel(ch);
    };
  }, [session?.code, loadSession]);

  // Live votes for the poll on screen, plus a safety refresh every 4 seconds.
  useEffect(() => {
    loadResults();
    if (!activeId) return;
    const sb = supabase();
    const ch = sb
      .channel(`votes-${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `poll_id=eq.${activeId}` }, () =>
        scheduleResults()
      )
      .subscribe();
    const timer = window.setInterval(loadResults, 4000);
    return () => {
      window.clearInterval(timer);
      sb.removeChannel(ch);
    };
  }, [activeId, loadResults, scheduleResults]);

  // ---------- Host controls ----------
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadSession();
      notifyPhones();
    } catch {
      setError('That action did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const check = (r: { error: unknown }) => {
    if (r.error) throw r.error;
  };

  /** Shows poll number `index` (or the welcome screen when index is -1), opening its voting. */
  const goTo = useCallback(
    (index: number) => {
      if (!session || busy) return;
      const target = index >= 0 ? polls[index] ?? null : null;
      if ((target?.id ?? null) === session.active_poll_id) return;
      const previous = active;
      act(async () => {
        const sb = supabase();
        if (target) check(await sb.from('polls').update({ is_open: true }).eq('id', target.id));
        check(await sb.from('sessions').update({ active_poll_id: target?.id ?? null }).eq('id', session.id));
        if (previous) check(await sb.from('polls').update({ is_open: false }).eq('id', previous.id));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, polls, active, busy]
  );

  const toggleVoting = useCallback(() => {
    if (!active || busy) return;
    act(async () => {
      check(await supabase().from('polls').update({ is_open: !active.is_open }).eq('id', active.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busy]);

  const toggleResults = useCallback(() => {
    if (!session || busy) return;
    act(async () => {
      check(await supabase().from('sessions').update({ show_results: !session.show_results }).eq('id', session.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, busy]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // Keyboard shortcuts (also work with most presentation clickers).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) && e.key === ' ')
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (['arrowright', 'pagedown', ' '].includes(k)) {
        e.preventDefault();
        if (activeIndex < polls.length - 1) goTo(activeIndex + 1);
      } else if (['arrowleft', 'pageup'].includes(k)) {
        e.preventDefault();
        if (activeIndex >= 0) goTo(activeIndex - 1);
      } else if (k === 'v') toggleVoting();
      else if (k === 'r') toggleResults();
      else if (k === 'q') setShowQr((v) => !v);
      else if (k === 'f') toggleFullscreen();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, polls.length, goTo, toggleVoting, toggleResults, toggleFullscreen]);

  // Fade the control bar after a few seconds without mouse movement.
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 4000);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 4000);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);

  // ---------- Rendering ----------
  if (!ready) return null;

  if (notFound) {
    return (
      <div className="present">
        <div />
        <div className="center-screen">
          <div className="status-panel">
            <h1 className="present__question">Session not found</h1>
            <Link href="/dashboard" className="btn btn--white">
              Back to dashboard
            </Link>
          </div>
        </div>
        <div />
      </div>
    );
  }

  if (!session) return <div className="present" />;

  const qrCard = joinUrl ? (
    <div className="qr-card">
      <QRCodeSVG value={joinUrl} size={300} level="M" fgColor="#0C0C0B" bgColor="#FFFFFF" />
      <div className="qr-card__code">{prettyCode(session.code)}</div>
      <div className="qr-card__url">{joinUrl.replace(/^https?:\/\//, '')}</div>
    </div>
  ) : null;

  const host = origin.replace(/^https?:\/\//, '');
  const total = results?.total ?? 0;

  return (
    <div className="present">
      <header className="present__top">
        <div className="present__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="Dina Khedr" width={146} height={40} />
        </div>
        {active && (
          <p className="present__join">
            Join at {host} · code <strong>{prettyCode(session.code)}</strong>
          </p>
        )}
      </header>

      <main className={`present__stage${active && !showQr ? ' present__stage--noqr' : ''}`}>
        {!active ? (
          <div className="lobby" style={{ gridColumn: '1 / -1' }}>
            <div className="present__content">
              <p className="eyebrow">{session.title}</p>
              <h1 className="lobby__title">
                Join the <span className="accent">live poll</span>
              </h1>
              <div className="lobby__steps">
                <p>
                  1. Scan the QR code with your phone camera, <em>or</em>
                </p>
                <p>
                  2. Go to <strong>{host || 'this site'}</strong> and enter the code{' '}
                  <strong>{prettyCode(session.code)}</strong>
                </p>
              </div>
            </div>
            {qrCard}
          </div>
        ) : (
          <>
            <div className="present__content fade-up" key={active.id}>
              <p className="eyebrow">
                Poll {activeIndex + 1} of {polls.length} · {kindLabel(active)}
              </p>
              <h1 className="present__question">{active.question}</h1>
              <div className="present__meta">
                {active.is_open ? <span className="chip chip--live">Voting open</span> : <span className="chip">Voting closed</span>}
                <span>
                  {total} {total === 1 ? 'response' : 'responses'}
                </span>
              </div>
              {session.show_results ? (
                <ResultsView
                  kind={active.kind}
                  options={active.options}
                  scaleMax={active.scale_max}
                  results={results}
                  dark
                />
              ) : (
                <div className="present__hidden">
                  <div className="waiting-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  Results are hidden while people vote.
                </div>
              )}
            </div>
            {showQr && qrCard}
          </>
        )}
      </main>

      <footer className={`present__controls${idle ? ' present__controls--idle' : ''}`}>
        <div className="btn-row">
          <button className="btn btn--ghost btn--sm" onClick={() => goTo(activeIndex - 1)} disabled={busy || activeIndex < 0}>
            ← {activeIndex === 0 ? 'Welcome screen' : 'Previous'}
          </button>
          <button
            className="btn btn--white btn--sm"
            onClick={() => goTo(activeIndex + 1)}
            disabled={busy || activeIndex >= polls.length - 1}
          >
            {activeIndex < 0 ? 'Start first poll' : 'Next poll'} →
          </button>
          {active && (
            <button className="btn btn--ghost btn--sm" onClick={toggleVoting} disabled={busy}>
              {active.is_open ? 'Close voting' : 'Reopen voting'}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={toggleResults} disabled={busy}>
            {session.show_results ? 'Hide results' : 'Show results'}
          </button>
          {active && (
            <button className="btn btn--ghost btn--sm" onClick={() => setShowQr((v) => !v)}>
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={toggleFullscreen}>
            Full screen
          </button>
        </div>
        <div className="btn-row">
          {error && <span className="present__count" style={{ color: '#F2B8AC' }}>{error}</span>}
          {polls.length === 0 && <span className="present__count">Add polls in the session editor first.</span>}
          <Link href={`/sessions/${session.id}`} className="lnk present__count">
            Exit
          </Link>
        </div>
      </footer>
    </div>
  );
}
