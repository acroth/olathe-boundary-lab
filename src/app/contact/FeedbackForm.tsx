'use client';
import { useRef, useState } from 'react';

const TOPICS = ['Correction to a boundary or number', 'Something isn’t working', 'Idea or request', 'Other'];

export default function FeedbackForm({ plan }: { plan: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const opened = useRef(Date.now());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('sending'); setErr('');
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(f.entries()), elapsed: Date.now() - opened.current }),
      });
      if (r.ok) { setState('sent'); return; }
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? 'Something went wrong.'); setState('error');
    } catch { setErr('Couldn’t reach the server. Check your connection and try again.'); setState('error'); }
  }

  if (state === 'sent') return <p className="status ok" role="status"><b>Thanks, your message was sent.</b> If you left an email address, you may get a reply there.</p>;
  return (
    <form className="form" onSubmit={submit}>
      <label>What is it about?
        <select name="topic" defaultValue={TOPICS[0]}>{TOPICS.map(t => <option key={t}>{t}</option>)}</select>
      </label>
      <label>Message
        <textarea name="message" required minLength={5} maxLength={5000} placeholder="Which option, school or street, and what looks wrong or what you’d like to see" />
      </label>
      <label><span>Link to a plan <span className="opt">(optional)</span></span>
        <input name="plan" type="url" defaultValue={plan} placeholder="Use Share in the lab and paste the link here" maxLength={2000} />
      </label>
      <div className="two">
        <label><span>Name <span className="opt">(optional)</span></span><input name="name" autoComplete="name" maxLength={120} /></label>
        <label><span>Email <span className="opt">(optional, for a reply)</span></span><input name="email" type="email" autoComplete="email" maxLength={200} /></label>
      </div>
      <div className="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="actions">
        <button type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
        <span className="hint">Your name and email are only used to reply to you and are never shown on the site.</span>
      </div>
      {state === 'error' && <p className="status err" role="alert">{err}</p>}
    </form>
  );
}
