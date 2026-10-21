'use client';

import { useEffect, useRef, useState } from 'react';

export interface DialogConfig {
  title: string;
  message?: React.ReactNode;
  /** Highlighted red notice, e.g. when responses will be deleted. */
  warning?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** When set, the dialog asks for a text value (e.g. a name). */
  input?: { label: string; initial?: string; placeholder?: string };
  /** Return an error message to keep the dialog open, or nothing to close it. */
  onConfirm: (value: string) => Promise<string | null | void>;
}

/** Confirmation and naming dialog in the site style. */
export default function Dialog({ config, onClose }: { config: DialogConfig | null; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setValue(config?.input?.initial ?? '');
    setBusy(false);
    setError(null);
    if (config && !config.input) setTimeout(() => confirmRef.current?.focus(), 30);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config, busy, onClose]);

  if (!config) return null;

  const needsValue = !!config.input;
  const canConfirm = !busy && (!needsValue || value.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!config || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const err = await config.onConfirm(value.trim());
      if (err) {
        setError(err);
        setBusy(false);
      } else {
        onClose();
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={submit}>
        <h2 id="dialog-title" className="dialog__title">
          {config.title}
        </h2>
        {config.message && <div className="dialog__text">{config.message}</div>}
        {config.warning && <div className="dialog__warn">{config.warning}</div>}
        {config.input && (
          <div className="field">
            <label htmlFor="dialog-input">{config.input.label}</label>
            <input
              id="dialog-input"
              maxLength={120}
              placeholder={config.input.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {error && <p className="notice notice--error">{error}</p>}
        <div className="btn-row dialog__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={`btn btn--sm ${config.danger ? 'btn--danger-solid' : 'btn--dark'}`}
            disabled={!canConfirm}
          >
            {busy ? 'Please wait…' : config.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
