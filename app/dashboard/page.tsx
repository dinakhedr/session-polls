'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import Dialog, { type DialogConfig } from '@/components/Dialog';
import { supabase } from '@/lib/supabase';
import { useHost } from '@/lib/useHost';
import { contentsText, votesWarning } from '@/lib/deleteText';
import {
  delay,
  plural,
  prettyCode,
  type Partner,
  type Program,
  type Session,
  type SessionStat,
} from '@/lib/types';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DashboardPage() {
  const router = useRouter();
  const { ready } = useHost();

  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Record<string, SessionStat>>({});
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  // New-session form
  const [title, setTitle] = useState('');
  const [programId, setProgramId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [pa, pr, se, st] = await Promise.all([
      sb.from('partners').select('id, name, created_at').order('name'),
      sb.from('programs').select('id, partner_id, name, created_at').order('name'),
      sb.from('sessions').select('*').order('created_at', { ascending: false }),
      sb.rpc('session_stats'),
    ]);
    if (pa.error || pr.error || se.error) {
      setError(
        'Your data could not be loaded. If you have just updated the app, please run the database update file in Supabase (see the guide), then refresh.'
      );
      setPartners([]);
      return;
    }
    setError(null);
    setPartners((pa.data ?? []) as Partner[]);
    setPrograms((pr.data ?? []) as Program[]);
    setSessions((se.data ?? []) as Session[]);
    const map: Record<string, SessionStat> = {};
    for (const s of (st.data ?? []) as SessionStat[]) map[s.session_id] = s;
    setStats(map);
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // Pre-select the first program in the new-session form.
  useEffect(() => {
    if (!programId && programs.length) setProgramId(programs[0].id);
    if (programId && !programs.some((p) => p.id === programId)) setProgramId(programs[0]?.id ?? '');
  }, [programs, programId]);

  // ---------- Derived totals ----------
  const sessionsByProgram = useMemo(() => {
    const m: Record<string, Session[]> = {};
    for (const s of sessions) if (s.program_id) (m[s.program_id] ??= []).push(s);
    return m;
  }, [sessions]);
  const unassigned = sessions.filter((s) => !s.program_id || !programs.some((p) => p.id === s.program_id));

  const programTotals = (programId: string) => {
    const list = sessionsByProgram[programId] ?? [];
    return {
      sessions: list.length,
      polls: list.reduce((a, s) => a + (stats[s.id]?.poll_count ?? 0), 0),
      votes: list.reduce((a, s) => a + (stats[s.id]?.vote_count ?? 0), 0),
    };
  };
  const partnerTotals = (partnerId: string) => {
    const progs = programs.filter((p) => p.partner_id === partnerId);
    return progs.reduce(
      (a, p) => {
        const t = programTotals(p.id);
        return { programs: a.programs + 1, sessions: a.sessions + t.sessions, polls: a.polls + t.polls, votes: a.votes + t.votes };
      },
      { programs: 0, sessions: 0, polls: 0, votes: 0 }
    );
  };

  // ---------- Actions ----------
  async function save(action: PromiseLike<{ error: unknown }>, failMsg: string) {
    const { error } = await action;
    if (error) return failMsg;
    await load();
    return null;
  }

  function newPartner() {
    setDialog({
      title: 'New partner',
      message: 'For example a client, donor or university you run programs with.',
      input: { label: 'Partner name', placeholder: 'e.g. ICEALEX' },
      confirmLabel: 'Create partner',
      onConfirm: (name) => save(supabase().from('partners').insert({ name }), 'The partner could not be created.'),
    });
  }

  function renamePartner(p: Partner) {
    setDialog({
      title: 'Rename partner',
      input: { label: 'Partner name', initial: p.name },
      confirmLabel: 'Save',
      onConfirm: (name) => save(supabase().from('partners').update({ name }).eq('id', p.id), 'The name could not be saved.'),
    });
  }

  function deletePartner(p: Partner) {
    const t = partnerTotals(p.id);
    setDialog({
      title: `Delete “${p.name}”?`,
      message:
        t.programs > 0
          ? `This partner and everything under it will be deleted: ${contentsText(t)}.`
          : 'This partner has no programs yet.',
      warning: votesWarning(t.votes),
      confirmLabel: t.votes > 0 ? 'Delete partner and all data' : 'Delete partner',
      danger: true,
      onConfirm: () => save(supabase().from('partners').delete().eq('id', p.id), 'The partner could not be deleted.'),
    });
  }

  function newProgram(partner: Partner) {
    setDialog({
      title: `New program for ${partner.name}`,
      input: { label: 'Program name', placeholder: 'e.g. ECH Impact Edition' },
      confirmLabel: 'Create program',
      onConfirm: (name) =>
        save(supabase().from('programs').insert({ name, partner_id: partner.id }), 'The program could not be created.'),
    });
  }

  function renameProgram(p: Program) {
    setDialog({
      title: 'Rename program',
      input: { label: 'Program name', initial: p.name },
      confirmLabel: 'Save',
      onConfirm: (name) => save(supabase().from('programs').update({ name }).eq('id', p.id), 'The name could not be saved.'),
    });
  }

  function deleteProgram(p: Program) {
    const t = programTotals(p.id);
    setDialog({
      title: `Delete “${p.name}”?`,
      message:
        t.sessions > 0
          ? `This program and everything under it will be deleted: ${contentsText(t)}.`
          : 'This program has no sessions yet.',
      warning: votesWarning(t.votes),
      confirmLabel: t.votes > 0 ? 'Delete program and all data' : 'Delete program',
      danger: true,
      onConfirm: () => save(supabase().from('programs').delete().eq('id', p.id), 'The program could not be deleted.'),
    });
  }

  function newSessionIn(p: Program) {
    setDialog({
      title: `New session in ${p.name}`,
      input: { label: 'Session title', placeholder: 'e.g. Day 1 — Problem framing' },
      confirmLabel: 'Create session',
      onConfirm: async (t) => {
        const { data, error } = await supabase()
          .from('sessions')
          .insert({ title: t, program_id: p.id })
          .select('id')
          .single();
        if (error || !data) return 'The session could not be created.';
        router.push(`/sessions/${data.id}`);
        return null;
      },
    });
  }

  function renameSession(s: Session) {
    setDialog({
      title: 'Rename session',
      input: { label: 'Session title', initial: s.title },
      confirmLabel: 'Save',
      onConfirm: (t) => save(supabase().from('sessions').update({ title: t }).eq('id', s.id), 'The title could not be saved.'),
    });
  }

  function duplicateSession(s: Session) {
    const polls = stats[s.id]?.poll_count ?? 0;
    setDialog({
      title: `Duplicate “${s.title}”?`,
      message: `A copy will be created with ${plural(polls, 'poll')}, a new join code and no responses.`,
      confirmLabel: 'Duplicate session',
      onConfirm: async () => {
        const { error } = await supabase().rpc('duplicate_session', { p_session: s.id });
        if (error) return 'The session could not be duplicated.';
        await load();
        return null;
      },
    });
  }

  function deleteSession(s: Session) {
    const st = stats[s.id];
    setDialog({
      title: `Delete “${s.title}”?`,
      message: `The session and its ${plural(st?.poll_count ?? 0, 'poll')} will be deleted.`,
      warning: votesWarning(st?.vote_count ?? 0),
      confirmLabel: (st?.vote_count ?? 0) > 0 ? 'Delete session and responses' : 'Delete session',
      danger: true,
      onConfirm: () => save(supabase().from('sessions').delete().eq('id', s.id), 'The session could not be deleted.'),
    });
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !programId) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase()
      .from('sessions')
      .insert({ title: t, program_id: programId })
      .select('id')
      .single();
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

  // ---------- Rendering ----------
  const sessionCard = (s: Session, i: number) => {
    const st = stats[s.id];
    return (
      <div className="card card--white session-card fade-up" key={s.id} style={delay(`${Math.min(i, 8) * 0.04}s`)}>
        <p className="card__kicker">{dateFmt.format(new Date(s.created_at))}</p>
        <Link href={`/sessions/${s.id}`} className="card__title session-card__link">
          {s.title}
        </Link>
        <div className="btn-row session-card__chips">
          <span className="chip code-chip">Code {prettyCode(s.code)}</span>
          <span className="chip">{plural(st?.poll_count ?? 0, 'poll')}</span>
          <span className="chip">{plural(st?.vote_count ?? 0, 'response')}</span>
        </div>
        <div className="actions">
          <Link href={`/sessions/${s.id}`} className="text-btn text-btn--strong">
            Open
          </Link>
          <button className="text-btn" onClick={() => duplicateSession(s)}>
            Duplicate
          </button>
          <button className="text-btn" onClick={() => renameSession(s)}>
            Rename
          </button>
          <button className="text-btn text-btn--danger" onClick={() => deleteSession(s)}>
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <SiteHeader href="/dashboard">
        <button className="lnk" onClick={signOut}>
          Sign out
        </button>
      </SiteHeader>
      <main className="page__main">
        <div className="container stack stack--lg">
          <div className="row-between fade-up">
            <div className="stack stack--sm">
              <p className="eyebrow">Dashboard</p>
              <h1 className="h-display">
                Your <span className="accent">sessions</span>
              </h1>
            </div>
            <button className="btn btn--dark" onClick={newPartner}>
              + New partner
            </button>
          </div>

          {error && <p className="notice notice--error">{error}</p>}

          {/* Quick create */}
          {programs.length > 0 && (
            <form className="card card--beige fade-up" style={delay('.08s')} onSubmit={createSession}>
              <div className="field">
                <label htmlFor="title">New session</label>
                <p className="field__hint">Choose the program it belongs to, then add your questions.</p>
              </div>
              <div className="quick-create">
                <div className="field">
                  <input
                    id="title"
                    aria-label="Session title"
                    placeholder="Session title"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <select aria-label="Program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                    {(partners ?? []).map((pa) => {
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
                <button className="btn btn--dark" type="submit" disabled={busy || !title.trim() || !programId}>
                  {busy ? 'Creating…' : 'Create session'}
                </button>
              </div>
            </form>
          )}

          {partners && partners.length === 0 && !error && (
            <div className="empty stack stack--sm">
              <p className="card__title">Start by adding a partner</p>
              <p>Add a partner (e.g. ICEALEX), then a program (e.g. ECH Impact Edition), then its sessions.</p>
              <div>
                <button className="btn btn--dark btn--sm" onClick={newPartner}>
                  + New partner
                </button>
              </div>
            </div>
          )}

          {/* Partners → programs → sessions */}
          {(partners ?? []).map((pa) => {
            const progs = programs.filter((p) => p.partner_id === pa.id);
            const t = partnerTotals(pa.id);
            return (
              <section className="partner fade-up" key={pa.id}>
                <div className="partner__head">
                  <div className="stack stack--sm" style={{ gap: 4 }}>
                    <p className="eyebrow">Partner</p>
                    <h2 className="partner__name">{pa.name}</h2>
                    <p className="small text-muted">
                      {plural(t.programs, 'program')} · {plural(t.sessions, 'session')} · {plural(t.votes, 'response')}
                    </p>
                  </div>
                  <div className="actions">
                    <button className="btn btn--beige btn--sm" onClick={() => newProgram(pa)}>
                      + Program
                    </button>
                    <button className="text-btn" onClick={() => renamePartner(pa)}>
                      Rename
                    </button>
                    <button className="text-btn text-btn--danger" onClick={() => deletePartner(pa)}>
                      Delete
                    </button>
                  </div>
                </div>

                {progs.length === 0 && (
                  <p className="small text-muted">No programs yet. Add the first program for {pa.name}.</p>
                )}

                {progs.map((p) => {
                  const list = sessionsByProgram[p.id] ?? [];
                  return (
                    <div className="program" key={p.id}>
                      <div className="program__head">
                        <div className="stack stack--sm" style={{ gap: 2 }}>
                          <p className="card__kicker">Program</p>
                          <h3 className="program__name">{p.name}</h3>
                        </div>
                        <div className="actions">
                          <button className="btn btn--dark btn--sm" onClick={() => newSessionIn(p)}>
                            + Session
                          </button>
                          <button className="text-btn" onClick={() => renameProgram(p)}>
                            Rename
                          </button>
                          <button className="text-btn text-btn--danger" onClick={() => deleteProgram(p)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {list.length > 0 ? (
                        <div className="grid">{list.map(sessionCard)}</div>
                      ) : (
                        <p className="small text-muted">No sessions yet.</p>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}

          {unassigned.length > 0 && (
            <section className="partner">
              <div className="partner__head">
                <div className="stack stack--sm" style={{ gap: 4 }}>
                  <p className="eyebrow">Not assigned</p>
                  <h2 className="partner__name">Sessions without a program</h2>
                  <p className="small text-muted">Open a session to assign it to a program.</p>
                </div>
              </div>
              <div className="grid">{unassigned.map(sessionCard)}</div>
            </section>
          )}
        </div>
      </main>
      <Dialog config={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
