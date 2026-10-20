'use client';

import { useState } from 'react';
import type { Poll, PollKind } from '@/lib/types';

export interface PollDraft {
  question: string;
  kind: PollKind;
  options: string[];
  allow_multiple: boolean;
  scale_max: number;
}

interface Props {
  initial?: Poll;
  submitLabel: string;
  onSave: (draft: PollDraft) => Promise<string | null>; // returns an error message or null
  onCancel: () => void;
}

const MAX_OPTIONS = 10;

export default function PollForm({ initial, submitLabel, onSave, onCancel }: Props) {
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [kind, setKind] = useState<PollKind>(initial?.kind ?? 'choice');
  const [options, setOptions] = useState<string[]>(
    initial?.kind === 'choice' && initial.options.length ? initial.options : ['', '']
  );
  const [allowMultiple, setAllowMultiple] = useState(initial?.allow_multiple ?? false);
  const [scaleMax, setScaleMax] = useState(initial?.scale_max ?? 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const valid =
    question.trim().length > 0 && (kind === 'rating' || cleanOptions.length >= 2);

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
