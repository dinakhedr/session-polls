'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import PollForm, { type PollDraft } from '@/components/PollForm';
import { roomChannel, supabase } from '@/lib/supabase';
import { useHost } from '@/lib/useHost';
import { buildCsv, downloadFile } from '@/lib/csv';
import { fetchAllVotes } from '@/lib/votes';
import { kindLabel, prettyCode, type Poll, type Session } from '@/lib/types';

export default function SessionEditorPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { ready } = useHost();

  const [session, setSession] = useState<Session | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: s }, { data: p }] = await Promise.all([
      sb.from('sessions').select('*').eq('id', id).maybeSingle(),
      sb.from('polls').select('*').eq('session_id', id).order('position').order('created_at'),
    ]);
    if (!s) {
      setNotFound(true);
      return;
    }
    const list = (p ?? []) as Poll[];
    setSession(s as Session);
    setPolls(list);
    try {
      const votes = await fetchAllVotes(list.map((x) => x.id));
      const counts: Record<string, number> = {};
      for (const v of votes) counts[v.poll_id] = (counts[v.poll_id] ?? 0) + 1;
      setVoteCounts(counts);
    } catch {
      /* counts are informative only */
    }
  }, [id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  /** Tells participants' phones to refresh (e.g. after editing the live poll). */
  const notifyRoom = useCallback(async () => {
    if (!session) return;
    const ch = supabase().channel(roomChannel(session.code));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'refresh', payload: {} }).finally(() => supabase().removeChannel(ch));
      }
    });
  }, [session]);

  async function run(action: () => Promise<{ error: unknown } | void>, failMsg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res && res.error) throw res.error;
      await load();
      notifyRoom();
    } catch {
      setError(failMsg);
    } finally {
      setBusy(false);
    }
  }

  async function addPoll(d: PollDraft) {
    const position = polls.length ? Math.max(...polls.map((p) => p.position)) + 1 : 0;
    const { error } = await supabase().from('polls').insert({ ...d, session_id: id, position });
    if (error) return 'The poll could not be saved. Please try again.';
    setEditing(null);
    await load();
    return null;
  }

  async function updatePoll(pollId: string, d: PollDraft) {
    const { error } = await supabase().from('polls').update(d).eq('id', pollId);
    if (error) return 'The poll could not be saved. Please try again.';
    setEditing(null);
    await load();
    notifyRoom();
    return null;
  }

  function move(index: number, dir: -1 | 1) {
    const a = polls[index];
    const b = polls[index + dir];
    if (!a || !b) return;
    const ordered = [...polls];
    ordered[index] = b;
    ordered[index + dir] = a;
    run(async () => {
      const sb = supabase();
      const results = await Promise.all(
        ordered.map((p, i) => (p.position === i ? null : sb.from('polls').update({ position: i }).eq('id', p.id)))
      );
      const failed = results.find((r) => r && r.error);
      return failed ? { error: failed.error } : undefined;
    }, 'The order could not be changed.');
  }

  function deletePoll(p: Poll) {
    if (!window.confirm(`Delete this poll and all its responses?\n\n“${p.question}”`)) return;
    run(() => Promise.resolve(supabase().from('polls').delete().eq('id', p.id)), 'The poll could not be deleted.');
  }

  function clearVotes(p: Poll) {
    if (!window.confirm(`Clear all ${voteCounts[p.id] ?? 0} responses for this poll? This cannot be undone.`)) return;
    run(() => Promise.resolve(supabase().from('votes').delete().eq('poll_id', p.id)), 'The responses could not be cleared.');
  }

  async function saveTitle(e: React.FormEvent) {
    e.preventDefault();
    const t = titleDraft.trim();
    if (!t) return;
    await run(() => Promise.resolve(supabase().from('sessions').update({ title: t }).eq('id', id)), 'The title could not be saved.');
    setRenaming(false);
  }

  async function exportCsv() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const votes = await fetchAllVotes(polls.map((p) => p.id));
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
      downloadFile(`${slug}-results.csv`, buildCsv(session.title, polls, votes));
    } catch {
      setError('The results could not be exported. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession() {
    if (!session) return;
    if (!window.confirm(`Delete the session “${session.title}” with all its polls and responses? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase().from('sessions').delete().eq('id', id);
    if (error) {
      setError('The session could not be deleted.');
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  }

  if (!ready) return null;

  if (notFound) {
    return (
      <div className="page">
        <SiteHeader href="/dashboard" />
        <main className="page__main">
          <div className="container status-panel">
            <h1 className="h-section">Session not found</h1>
            <Link href="/dashboard" className="btn btn--dark">
              Back to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!session) return null;

  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <SiteHeader href="/dashboard">
        <Link href="/dashboard" className="lnk">
          ← All sessions
        </Link>
      </SiteHeader>
      <main className="page__main">
        <div className="container stack stack--lg">
          {/* Session header */}
          <div className="stack fade-up">
            <p className="eyebrow">Session · Code {prettyCode(session.code)}</p>
            {renaming ? (
              <form className="btn-row" onSubmit={saveTitle}>
                <div className="field" style={{ flex: '1 1 320px' }}>
                  <input
                    aria-label="Session title"
                    maxLength={120}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    autoFocus
                  />
                </div>
                <button className="btn btn--dark btn--sm" type="submit" disabled={busy || !titleDraft.trim()}>
                  Save
                </button>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="row-between">
                <h1 className="h-display">{session.title}</h1>
                <button
                  className="lnk small"
                  onClick={() => {
                    setTitleDraft(session.title);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              </div>
            )}
            <div className="btn-row">
              <a className="btn btn--dark" href={`/present/${session.id}`} target="_blank" rel="noopener">
                Open presenter view ↗
              </a>
              <button className="btn btn--beige" onClick={exportCsv} disabled={busy || totalVotes === 0}>
                Export results (CSV)
              </button>
              <span className="chip">
                {totalVotes} {totalVotes === 1 ? 'response' : 'responses'} in total
              </span>
            </div>
          </div>

          {error && <p className="notice notice--error">{error}</p>}

          {/* Polls */}
          <section className="stack">
            <div className="row-between">
              <h2 className="h-section">Polls</h2>
              {editing !== 'new' && (
                <button className="btn btn--dark btn--sm" onClick={() => setEditing('new')}>
                  + Add poll
                </button>
              )}
            </div>

            {polls.length === 0 && editing !== 'new' && (
              <div className="empty">No polls yet. Add the questions you want to ask during the session.</div>
            )}

            <div className="poll-list">
              {polls.map((p, i) => {
                const votes = voteCounts[p.id] ?? 0;
                if (editing === p.id) {
                  return (
                    <PollForm
                      key={p.id}
                      initial={p}
                      submitLabel="Save changes"
                      onSave={(d) => updatePoll(p.id, d)}
                      onCancel={() => setEditing(null)}
                    />
                  );
                }
                return (
                  <div className="card poll-item" key={p.id}>
                    <span className="poll-item__num">{String(i + 1).padStart(2, '0')}</span>
                    <div className="poll-item__body">
                      <div className="btn-row" style={{ gap: 8 }}>
                        <span className="card__kicker">{kindLabel(p)}</span>
                        {session.active_poll_id === p.id && <span className="chip chip--live">On screen</span>}
                      </div>
                      <p className="poll-item__q">{p.question}</p>
                      {p.kind === 'choice' && (
                        <div className="poll-item__opts">
                          {p.options.map((o, j) => (
                            <span className="chip chip--white" key={j}>
                              {o}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="small text-muted">
                        {votes} {votes === 1 ? 'response' : 'responses'}
                        {votes > 0 && (
                          <>
                            {' · '}
                            <button className="lnk small" onClick={() => clearVotes(p)} disabled={busy}>
                              Clear responses
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="poll-item__actions">
                      <button className="icon-btn" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Move down"
                        disabled={busy || i === polls.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn--white btn--sm"
                        disabled={busy || votes > 0}
                        title={votes > 0 ? 'Clear the responses first to edit this poll' : undefined}
                        onClick={() => setEditing(p.id)}
                      >
                        Edit
                      </button>
                      <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => deletePoll(p)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {editing === 'new' && (
                <PollForm submitLabel="Add poll" onSave={addPoll} onCancel={() => setEditing(null)} />
              )}
            </div>
            {polls.some((p) => (voteCounts[p.id] ?? 0) > 0) && (
              <p className="small text-muted">Polls with responses are locked for editing, so results stay accurate.</p>
            )}
          </section>

          <section className="card card--white">
            <p className="card__title">Delete this session</p>
            <p className="card__text">Removes the session, all its polls and all responses permanently.</p>
            <div>
              <button className="btn btn--danger btn--sm" onClick={deleteSession} disabled={busy}>
                Delete session
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
