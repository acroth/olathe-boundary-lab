// The contact form's checks and the email they turn into (src/server/feedbackEmail.ts).
import { describe, expect, it } from 'vitest';
import { composeFeedbackEmail, parseFeedback } from '../src/server/feedbackEmail';

const filledIn = { topic: 'Idea or request', message: 'Please add 2034-35 to the year picker.', plan: 'https://example.org/#build=1.1.1.1.1', name: 'Pat', email: 'pat@example.org', elapsed: 20000 };

describe('feedback form', () => {
  it('accepts a normal message', () => {
    expect(parseFeedback(filledIn, 'Test browser')).toEqual({ feedback: { ...filledIn, elapsed: undefined, userAgent: 'Test browser' } as any });
  });
  it('quietly drops likely spam', () => {
    expect(parseFeedback({ ...filledIn, website: 'spam.example' }, null)).toEqual({ spam: true });
    expect(parseFeedback({ ...filledIn, elapsed: 800 }, null)).toEqual({ spam: true });
  });
  it('asks for a message and a valid email', () => {
    expect(parseFeedback({ ...filledIn, message: 'hi' }, null)).toEqual({ error: 'Please write a message.' });
    expect(parseFeedback({ ...filledIn, email: 'not-an-email' }, null)).toEqual({ error: 'That email address doesn’t look right.' });
  });
  it('keeps optional fields optional', () => {
    const parsed = parseFeedback({ message: 'The 620 line looks off.', elapsed: 9000 }, null);
    expect(parsed).toEqual({ feedback: { topic: 'Other', message: 'The 620 line looks off.', plan: '', name: '', email: '', userAgent: '' } });
  });
});

describe('feedback email', () => {
  it('puts the message first and lets a reply go to the sender', () => {
    const parsed = parseFeedback(filledIn, 'Test browser');
    const email = composeFeedbackEmail(('feedback' in parsed ? parsed.feedback : null)!);
    expect(email.subject).toBe('Boundary Lab feedback: Idea or request');
    expect(email.text.startsWith(filledIn.message)).toBe(true);
    expect(email.text).toContain('From: Pat <pat@example.org>');
    expect(email.text).toContain(`Plan link: ${filledIn.plan}`);
    expect(email.replyTo).toEqual({ name: 'Pat', address: 'pat@example.org' });
  });
  it('has no reply address when the sender left none', () => {
    const email = composeFeedbackEmail({ topic: 'Other', message: 'Thanks for this.', plan: '', name: '', email: '', userAgent: '' });
    expect(email.replyTo).toBeUndefined();
    expect(email.text).toContain('From: (no name) (no email)');
  });
});
