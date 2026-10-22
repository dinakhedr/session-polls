'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import ResultsView from '@/components/ResultsView';
import { CountdownRing, useCountdown } from '@/components/Countdown';
import { roomChannel, supabase } from '@/lib/supabase';
import { getVoterId } from '@/lib/voter';
import type { LiveState } from '@/lib/types';

type Status = 'loading' | 'ready' | 'notfound' | 'error';

export default function ParticipantPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? '').replace(/\D/g, '').slice(0, 6);

  const [status, setStatus] = useState<Status>('loading');
  const [live, setLive] = useState<LiveState | null>(null);
  const [choices, setChoices] = useState<number[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const requestSeq = useRef(0);
  const pollId = live?.poll?.id ?? null;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const { data, error } = await supabase().rpc('get_live_state', {
        p_code: code,
        p_voter: getVoterId(),
      });
      if (seq !== requestSeq.current) return; // a newer request is on its way
      if (error) throw error;
      if (!data) {
        setStatus('notfound');
        return;
      }
      const state = data as LiveState;
      if (state.server_now) setOffset(new Date(state.server_now).getTime() - Date.now());
      setLive(state);
      setStatus('ready');
    } catch {
      if (seq === requestSeq.current) setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [code]);

  // Initial load, live updates from the host, and a slow safety refresh.
  useEffect(() => {
    if (!/^\d{6}$/.test(code)) {
      setStatus('notfound');
      return;
    }
    load();
    const sb = supabase();
    const channel = sb
      .channel(roomChannel(code))
      .on('broadcast', { event: 'refresh' }, () => load())
      .subscribe();
    const timer = window.setInterval(load, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      sb.removeChannel(channel);
    };
  }, [code, load]);

  // Clear the selection whenever the host moves to another poll.
  useEffect(() => {
    setChoices([]);
    setRating(null);
    setAnswer('');
    setMessage(null);
  }, [pollId]);

  const poll = live?.poll ?? null;

  // Timed polls: count down, then fetch the closed state and results.
  const left = useCountdown(poll?.is_open ? poll?.closes_at : null, offset, () => {
    window.setTimeout(load, 700);
    window.setTimeout(load, 2500);
  });
  const timeUp = left === 0;
  const votingOpen = !!poll?.is_open && !timeUp;

  function toggleChoice(i: number) {
    if (!poll) return;
    if (poll.allow_multiple) {
      setChoices((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i].sort((a, b) => a - b)));
    } else {
      setChoices([i]);
    }
  }

  async function submit() {
    if (!poll) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const { data, error } = await supabase().rpc('cast_vote', {
        p_poll: poll.id,
        p_voter: getVoterId(),
        p_choices: poll.kind === 'choice' ? choices : null,
        p_rating: poll.kind === 'rating' ? rating : null,
        p_answer: poll.kind === 'words' ? answer.trim() : null,
      });
      if (error) throw error;
      if (data === 'closed') setMessage('Voting has just closed for this poll.');
      else if (data === 'invalid') setMessage('Please check your answer and try again.');
      await load();
    } catch {
      setMessage('Your vote could not be sent. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!poll &&
    !submitting &&
    (poll.kind === 'choice' ? choices.length > 0 : poll.kind === 'words' ? answer.trim().length > 0 : rating !== null);

  return (
    <div className="page">
      <SiteHeader>
        {live?.session.title ? <span className="chip">{live.session.title}</span> : null}
      </SiteHeader>
      <main className="page__main">
        <div className="container container--narrow">
          {status === 'loading' && (
            <div className="status-panel" aria-live="polite">
              <div className="waiting-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className="text-muted">Connecting to the session…</p>
            </div>
          )}

          {status === 'notfound' && (
            <div className="status-panel fade-up">
              <div className="status-icon" aria-hidden="true">?</div>
              <h1 className="h-section">Session not found</h1>
              <p className="text-muted">
                There is no active session with the code <strong>{code || '—'}</strong>. Please check the
                code on the screen.
              </p>
              <Link href="/" className="btn btn--dark">
                Try another code
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="status-panel fade-up">
              <div className="status-icon" aria-hidden="true">!</div>
              <h1 className="h-section">Connection problem</h1>
              <p className="text-muted">We could not reach the session. Please check your internet connection.</p>
              <button className="btn btn--dark" onClick={() => load()}>
                Try again
              </button>
            </div>
          )}

          {status === 'ready' && live && !poll && (
            <div className="status-panel fade-up" aria-live="polite">
              <div className="waiting-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h1 className="h-section">You&rsquo;re in.</h1>
              <p className="text-muted">The first poll will appear here as soon as the host starts it.</p>
            </div>
          )}

          {status === 'ready' && live && poll && (
            <div className="stack stack--lg fade-up" key={poll.id}>
              <div className="stack stack--sm">
                <p className="eyebrow">
                  {poll.kind === 'words'
                    ? 'Type a short answer'
                    : poll.kind === 'rating'
                    ? `Rate from 1 to ${poll.scale_max}`
                    : poll.allow_multiple
                      ? 'Select all that apply'
                      : 'Choose one answer'}
                </p>
                <h1 className="h-section">{poll.question}</h1>
              </div>

              {votingOpen && left !== null && poll.duration_seconds && (
                <div className="timer-strip">
                  <CountdownRing left={left} total={poll.duration_seconds} />
                  <p className="timer-strip__text">
                    {live.has_voted ? 'Results are revealed when time is up.' : 'Time left to answer'}
                  </p>
                </div>
              )}

              {/* Voting */}
              {votingOpen && !live.has_voted && (
                <div className="stack">
                  {poll.kind === 'words' ? (
                    <form
                      className="field"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (canSubmit) submit();
                      }}
                    >
                      <label htmlFor="answer" className="visually-hidden">
                        Your answer
                      </label>
                      <input
                        id="answer"
                        className="answer-input"
                        maxLength={40}
                        autoComplete="off"
                        placeholder="Your answer"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                      />
                      <span className="field__hint answer-count">{answer.length}/40</span>
                    </form>
                  ) : poll.kind === 'choice' ? (
                    <div
                      className="vote-options"
                      role={poll.allow_multiple ? 'group' : 'radiogroup'}
                      aria-label={poll.question}
                    >
                      {poll.options.map((opt, i) => {
                        const on = choices.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            className="vote-option"
                            role={poll.allow_multiple ? 'checkbox' : 'radio'}
                            aria-checked={on}
                            onClick={() => toggleChoice(i)}
                          >
                            <span
                              className={`vote-option__mark vote-option__mark--${poll.allow_multiple ? 'check' : 'radio'}`}
                              aria-hidden="true"
                            />
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="stack stack--sm">
                      <div className="rating-grid" role="radiogroup" aria-label={poll.question}>
                        {Array.from({ length: poll.scale_max }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="rating-btn"
                            role="radio"
                            aria-checked={rating === n}
                            onClick={() => setRating(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div className="rating-legend">
                        <span>1 = lowest</span>
                        <span>{poll.scale_max} = highest</span>
                      </div>
                    </div>
                  )}
                  {message && <p className="notice notice--error">{message}</p>}
                  <button className="btn btn--dark btn--block" disabled={!canSubmit} onClick={submit}>
                    {submitting ? 'Sending…' : 'Submit vote'}
                  </button>
                </div>
              )}

              {/* After voting, or when voting is closed */}
              {(live.has_voted || !votingOpen) && (
                <div className="stack">
                  <div className="card" aria-live="polite">
                    <div className="status-row">
                      <div className="stack stack--sm">
                        <p className="card__title">
                          {live.has_voted
                            ? 'Thank you, your vote is in.'
                            : timeUp
                              ? 'Time is up.'
                              : 'Voting is closed for this poll.'}
                        </p>
                        <p className="card__text">
                          {!live.show_results
                            ? 'Results will be shared on the main screen.'
                            : live.results
                              ? votingOpen
                                ? 'Results update live below.'
                                : 'Final results are below.'
                              : poll.closes_at && votingOpen
                                ? 'Results will appear here when time is up.'
                                : timeUp
                                  ? 'Loading the results…'
                                  : 'Results will appear here when voting closes.'}
                        </p>
                      </div>
                      <div className={`status-icon${live.has_voted ? ' status-icon--done' : ''}`} aria-hidden="true">
                        {live.has_voted ? '✓' : '–'}
                      </div>
                    </div>
                  </div>
                  {message && <p className="notice notice--error">{message}</p>}
                  {live.show_results && live.results && (
                    <ResultsView
                      kind={poll.kind}
                      options={poll.options}
                      scaleMax={poll.scale_max}
                      results={live.results}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
