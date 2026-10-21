'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import PollForm, { type PollDraft } from '@/components/PollForm';
import Dialog, { type DialogConfig } from '@/components/Dialog';
import { roomChannel, supabase } from '@/lib/supabase';
import { useHost } from '@/lib/useHost';
import { buildCsv, downloadFile } from '@/lib/csv';
import { fetchAllVotes } from '@/lib/votes';
import { votesWarning } from '@/lib/deleteText';
import {
  kindLabel,
  plural,
  prettyCode,
  resultsLabel,
  type Partner,
  type Poll,
  type Program,
  type Session,
} from '@/lib/types';

export default function SessionEditorPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { ready } = useHost();

  const [session, setSession] = useState<Session | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: s }, { data: p }, { data: pa }, { data: pr }] = await Promise.all([
      sb.from('sessions').select('*').eq('id', id).maybeSingle(),
      sb.from('polls').select('*').eq('session_id', id).order('position').order('created_at'),
      sb.from('partners').select('id, name, created_at').order('name'),
      sb.from('programs').select('id, partner_id, name, created_at').order('name'),
    ]);
    if (!s) {
      setNotFound(true);
      return;
    }
    const list = (p ?? []) as Poll[];
    setSession(s as Session);
    setPolls(list);
    setPartners((pa ?? []) as Partner[]);
    setPrograms((pr ?? []) as Program[]);
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

  /** Tells participants' phones and the presenter screen to refresh. */
  const notifyRoom = useCallback(async () => {
    if (!session) return;
    const ch = supabase().channel(roomChannel(session.code));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'refresh', payload: {} }).finally(() => supabase().removeChannel(ch));
      }
    });
  }, [session]);

  /** Runs a change, reloads, and returns an error message (for dialogs) or null. */
  async function apply(action: () => PromiseLike<{ error: unknown } | void>, failMsg: string): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res && res.error) throw res.error;
      await load();
      notifyRoom();
      return null;
    } catch {
      return failMsg;
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => PromiseLike<{ error: unknown } | void>, failMsg: string) {
    const err = await apply(action, failMsg);
    if (err) setError(err);
  }

  // ---------- Polls ----------
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

  function duplicatePoll(p: Poll) {
    run(() => supabase().rpc('duplicate_poll', { p_poll: p.id }), 'The poll could not be duplicated.');
  }

  function deletePoll(p: Poll) {
    const votes = voteCounts[p.id] ?? 0;
    setDialog({
      title: 'Delete this poll?',
      message: <>“{p.question}”</>,
      warning: votesWarning(votes),
      confirmLabel: votes > 0 ? 'Delete poll and responses' : 'Delete poll',
      danger: true,
      onConfirm: () => apply(() => supabase().from('polls').delete().eq('id', p.id), 'The poll could not be deleted.'),
    });
  }

  function clearVotes(p: Poll) {
    const votes = voteCounts[p.id] ?? 0;
    setDialog({
      title: 'Clear all responses?',
      message: <>All {plural(votes, 'response')} for “{p.question}” will be removed, so you can edit or reuse the poll.</>,
      warning: 'This cannot be undone. Export the results first if you need them.',
      confirmLabel: 'Clear responses',
      danger: true,
      onConfirm: () =>
        apply(() => supabase().from('votes').delete().eq('poll_id', p.id), 'The responses could not be cleared.'),
    });
  }

  // ---------- Session ----------
  function renameSession() {
    if (!session) return;
    setDialog({
      title: 'Rename session',
      input: { label: 'Session title', initial: session.title },
      confirmLabel: 'Save',
      onConfirm: (t) =>
        apply(() => supabase().from('sessions').update({ title: t }).eq('id', id), 'The title could not be saved.'),
    });
  }

  function changeProgram(programId: string) {
    run(
      () => supabase().from('sessions').update({ program_id: programId || null }).eq('id', id),
      'The program could not be changed.'
    );
  }

  function duplicateSession() {
    if (!session) return;
    setDialog({
      title: `Duplicate “${session.title}”?`,
      message: `A copy will be created with ${plural(polls.length, 'poll')}, a new join code and no responses. It opens straight away so you can adjust it.`,
      confirmLabel: 'Duplicate session',
      onConfirm: async () => {
        const { data, error } = await supabase().rpc('duplicate_session', { p_session: id });
        if (error || !data) return 'The session could not be duplicated.';
        router.push(`/sessions/${data as string}`);
        return null;
      },
    });
  }

  function deleteSession() {
    if (!session) return;
    const votes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
    setDialog({
      title: `Delete “${session.title}”?`,
      message: `The session and its ${plural(polls.length, 'poll')} will be deleted.`,
      warning: votesWarning(votes),
      confirmLabel: votes > 0 ? 'Delete session and responses' : 'Delete session',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase().from('sessions').delete().eq('id', id);
        if (error) return 'The session could not be deleted.';
        router.replace('/dashboard');
        return null;
      },
    });
  }

  async function exportCsv() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const votes = await fetchAllVotes(polls.map((p) => p.id));
      const program = programs.find((p) => p.id === session.program_id);
      const partner = partners.find((p) => p.id === program?.partner_id);
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
      downloadFile(
        `${slug}-results.csv`,
        buildCsv(session.title, polls, votes, { partner: partner?.name, program: program?.name })
      );
    } catch {
      setError('The results could not be exported. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Rendering ----------
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
  const program = programs.find((p) => p.id === session.program_id);
  const partner = partners.find((p) => p.id === program?.partner_id);

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
            <p className="eyebrow">
              {partner && program ? `${partner.name} · ${program.name} · ` : ''}Code {prettyCode(session.code)}
            </p>
            <div className="row-between">
              <h1 className="h-display">{session.title}</h1>
              <div className="actions">
                <button className="text-btn" onClick={renameSession}>
                  Rename
                </button>
                <button className="text-btn" onClick={duplicateSession}>
                  Duplicate session
                </button>
                <button className="text-btn text-btn--danger" onClick={deleteSession}>
                  Delete
                </button>
              </div>
            </div>

            <div className="field program-select">
              <label htmlFor="program">Program</label>
              <select
                id="program"
                value={session.program_id ?? ''}
                onChange={(e) => changeProgram(e.target.value)}
                disabled={busy}
              >
                <option value="">— Not assigned —</option>
                {partners.map((pa) => {
                  const progs = programs.filter((p) => p.partner_id === pa.id);
                  if (!progs.length) return null;
                  return (
                    <optgroup key={pa.id} label={pa.name}>
                      {progs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div className="btn-row">
              <a className="btn btn--dark" href={`/present/${session.id}`} target="_blank" rel="noopener">
                Open presenter view ↗
              </a>
              <button className="btn btn--beige" onClick={exportCsv} disabled={busy || totalVotes === 0}>
                Export results (CSV)
              </button>
              <span className="chip">{plural(totalVotes, 'response')} in total</span>
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
                        <span className="chip chip--white chip--small">{resultsLabel(p.results_mode)}</span>
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
                        {plural(votes, 'response')}
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
                      <button className="btn btn--white btn--sm" disabled={busy} onClick={() => duplicatePoll(p)}>
                        Duplicate
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
              <p className="small text-muted">
                Polls with responses are locked for editing, so results stay accurate. Use “Duplicate” to reuse a question.
              </p>
            )}
          </section>
        </div>
      </main>
      <Dialog config={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
