'use client';

import { useState } from 'react';
import type { Poll, PollKind, ResultsMode } from '@/lib/types';

export interface PollDraft {
  question: string;
  kind: PollKind;
  options: string[];
  allow_multiple: boolean;
  scale_max: number;
  results_mode: ResultsMode;
  duration_seconds: number | null;
}

interface Props {
  initial?: Poll;
  submitLabel: string;
  onSave: (draft: PollDraft) => Promise<string | null>; // returns an error message or null
  onCancel: () => void;
}

const MAX_OPTIONS = 10;
const PRESETS = [30, 60, 90, 120];

export default function PollForm({ initial, submitLabel, onSave, onCancel }: Props) {
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [kind, setKind] = useState<PollKind>(initial?.kind ?? 'choice');
  const [options, setOptions] = useState<string[]>(
    initial?.kind === 'choice' && initial.options.length ? initial.options : ['', '']
  );
  const [allowMultiple, setAllowMultiple] = useState(initial?.allow_multiple ?? false);
  const [scaleMax, setScaleMax] = useState(initial?.scale_max ?? 5);
  const [resultsMode, setResultsMode] = useState<ResultsMode>(initial?.results_mode ?? 'live');
  const [timer, setTimer] = useState<number | null>(initial?.duration_seconds ?? null);
  const [custom, setCustom] = useState(
    initial?.duration_seconds && !PRESETS.includes(initial.duration_seconds) ? String(initial.duration_seconds) : ''
  );
  const isCustom = timer !== null && !PRESETS.includes(timer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const timerValid = timer === null || (Number.isInteger(timer) && timer >= 5 && timer <= 3600);
  const valid =
    question.trim().length > 0 && (kind !== 'choice' || cleanOptions.length >= 2) && timerValid;

  /** Turning a timer on reveals results when time is up (can still be changed). */
  function chooseTimer(seconds: number | null) {
    if (seconds !== null && timer === null) setResultsMode('after_close');
    setTimer(seconds);
  }

  function setOption(i: number, value: string) {
    setOptions((o) => o.map((x, j) => (j === i ? value : x)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (kind === 'choice' && new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) {
      setError('Each answer option must be different.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSave({
      question: question.trim(),
      kind,
      options: kind === 'choice' ? cleanOptions : [],
      allow_multiple: kind === 'choice' ? allowMultiple : false,
      scale_max: kind === 'rating' ? scaleMax : 5,
      results_mode: resultsMode,
      duration_seconds: timer,
    });
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="card card--white form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          maxLength={300}
          placeholder="e.g. Which growth channel matters most for your business this year?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          autoFocus
        />
      </div>

      <fieldset className="field">
        <legend>Poll type</legend>
        <div className="pill-options">
          <label className="pill-option">
            <input type="radio" name="kind" checked={kind === 'choice'} onChange={() => setKind('choice')} />
            <span>Multiple choice</span>
          </label>
          <label className="pill-option">
            <input type="radio" name="kind" checked={kind === 'rating'} onChange={() => setKind('rating')} />
            <span>Rating scale</span>
          </label>
          <label className="pill-option">
            <input type="radio" name="kind" checked={kind === 'words'} onChange={() => setKind('words')} />
            <span>Word cloud</span>
          </label>
        </div>
      </fieldset>

      {kind === 'choice' ? (
        <>
          <fieldset className="field">
            <legend>Answer options</legend>
            <div className="option-inputs">
              {options.map((opt, i) => (
                <div className="option-input" key={i}>
                  <span className="option-input__num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="field" style={{ flex: 1 }}>
                    <input
                      aria-label={`Option ${i + 1}`}
                      maxLength={120}
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={(e) => setOption(i, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove option ${i + 1}`}
                    disabled={options.length <= 2}
                    onClick={() => setOptions((o) => o.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <div>
                <button type="button" className="btn btn--beige btn--sm" onClick={() => setOptions((o) => [...o, ''])}>
                  + Add option
                </button>
              </div>
            )}
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
            Participants can select more than one answer
          </label>
        </>
      ) : kind === 'words' ? (
        <p className="notice">
          Participants type a short answer (up to 40 characters). Identical answers are grouped, and the most
          frequent ones appear largest. Tip: ask for “2–3 words” in your question.
        </p>
      ) : (
        <fieldset className="field">
          <legend>Scale</legend>
          <div className="pill-options">
            {[5, 10].map((n) => (
              <label className="pill-option" key={n}>
                <input type="radio" name="scale" checked={scaleMax === n} onChange={() => setScaleMax(n)} />
                <span>1 to {n}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="field">
        <legend>Timer</legend>
        <div className="pill-options">
          <label className="pill-option">
            <input type="radio" name="timer" checked={timer === null} onChange={() => chooseTimer(null)} />
            <span>No timer</span>
          </label>
          {PRESETS.map((s) => (
            <label className="pill-option" key={s}>
              <input type="radio" name="timer" checked={timer === s} onChange={() => chooseTimer(s)} />
              <span>{s < 120 ? `${s} s` : `${s / 60} min`}</span>
            </label>
          ))}
          <label className="pill-option">
            <input
              type="radio"
              name="timer"
              checked={isCustom}
              onChange={() => chooseTimer(Number(custom) || 45)}
            />
            <span>Custom</span>
          </label>
        </div>
        {isCustom && (
          <div className="timer-custom">
            <input
              type="number"
              min={5}
              max={3600}
              step={5}
              aria-label="Timer in seconds"
              value={custom || String(timer)}
              onChange={(e) => {
                setCustom(e.target.value);
                setTimer(Math.round(Number(e.target.value)) || 0);
              }}
            />
            <span className="field__hint">seconds (5–3600)</span>
          </div>
        )}
        <p className="field__hint">
          {timer === null
            ? 'Voting stays open until you close it.'
            : 'A countdown shows on phones and on the screen. When it reaches zero, voting closes automatically.'}
        </p>
      </fieldset>

      <fieldset className="field">
        <legend>Show results</legend>
        <div className="pill-options">
          <label className="pill-option">
            <input type="radio" name="results" checked={resultsMode === 'live'} onChange={() => setResultsMode('live')} />
            <span>Live, as votes come in</span>
          </label>
          <label className="pill-option">
            <input
              type="radio"
              name="results"
              checked={resultsMode === 'after_close'}
              onChange={() => setResultsMode('after_close')}
            />
            <span>{timer !== null ? 'When time is up' : 'After I close voting'}</span>
          </label>
        </div>
        <p className="field__hint">
          {resultsMode === 'live'
            ? 'The bars grow on the screen and on phones while people vote.'
            : 'Results stay hidden (only the number of responses shows) until you click “Close voting”.'}
        </p>
      </fieldset>

      {error && <p className="notice notice--error">{error}</p>}

      <div className="btn-row">
        <button className="btn btn--dark btn--sm" type="submit" disabled={!valid || busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
