'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import { delay } from '@/lib/types';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const valid = /^\d{6}$/.test(code);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) router.push(`/join/${code}`);
  }

  return (
    <div className="page">
      <SiteHeader>
        <Link href="/login" className="lnk">
          Host login
        </Link>
      </SiteHeader>
      <main className="page__main">
        <div className="container container--narrow stack stack--lg">
          <div className="stack stack--sm fade-up">
            <p className="eyebrow">Session Polls</p>
            <h1 className="h-display">
              Join the <span className="accent">session</span>
            </h1>
            <p className="lead">Enter the 6-digit code shown on the screen, or scan the QR code.</p>
          </div>
          <form className="form fade-up" style={delay('.15s')} onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="code" className="visually-hidden">
                Session code
              </label>
              <input
                id="code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
            </div>
            <button className="btn btn--dark btn--block" type="submit" disabled={!valid}>
              Join
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
