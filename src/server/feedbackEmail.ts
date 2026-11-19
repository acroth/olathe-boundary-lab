// Feedback from the contact form, checked and written up as an email to the site owner's Gmail inbox.
import nodemailer from 'nodemailer';

const LIMITS = { topic: 80, message: 5000, plan: 2000, name: 120, email: 200, website: 200, userAgent: 300 };
const MIN_MESSAGE_LENGTH = 5;
const MIN_FILL_TIME_MS = 3000;   // people take longer than this to write a message; bots don't
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Feedback { topic: string; message: string; plan: string; name: string; email: string; userAgent: string }
export type ParsedFeedback = { feedback: Feedback } | { spam: true } | { error: string };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Checks the form's fields. Spam is accepted quietly so bots don't learn they were caught. */
export function parseFeedback(body: any, userAgent: string | null): ParsedFeedback {
  const filledHiddenField = text(body?.website, LIMITS.website) !== '';
  const sentTooFast = typeof body?.elapsed === 'number' && body.elapsed < MIN_FILL_TIME_MS;
  if (filledHiddenField || sentTooFast) return { spam: true };

  const message = text(body?.message, LIMITS.message);
  if (message.length < MIN_MESSAGE_LENGTH) return { error: 'Please write a message.' };
  const email = text(body?.email, LIMITS.email);
  if (email && !EMAIL_PATTERN.test(email)) return { error: 'That email address doesn’t look right.' };

  return {
    feedback: {
      topic: text(body?.topic, LIMITS.topic) || 'Other', message, email,
      plan: text(body?.plan, LIMITS.plan), name: text(body?.name, LIMITS.name), userAgent: text(userAgent, LIMITS.userAgent),
    },
  };
}

/** The email the site owner receives. Replying goes straight to the sender when they left an address. */
export function composeFeedbackEmail(feedback: Feedback) {
  const sender = feedback.name || feedback.email || 'Someone';
  const details = [
    `From: ${feedback.name || '(no name)'}${feedback.email ? ` <${feedback.email}>` : ' (no email)'}`,
    `Topic: ${feedback.topic}`,
    feedback.plan && `Plan link: ${feedback.plan}`,
    feedback.userAgent && `Browser: ${feedback.userAgent}`,
  ].filter(Boolean);
  return {
    subject: `Boundary Lab feedback: ${feedback.topic}`,
    text: `${feedback.message}\n\n---\n${details.join('\n')}\n`,
    replyTo: feedback.email ? { name: sender, address: feedback.email } : undefined,
  };
}

/** Sends through the owner's Gmail account. Returns null until GMAIL_USER and GMAIL_APP_PASSWORD are set. */
export function gmailSender() {
  const user = process.env.GMAIL_USER, appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!user || !appPassword) return null;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: appPassword } });
  const to = process.env.FEEDBACK_TO || user;
  return (email: ReturnType<typeof composeFeedbackEmail>) => transport.sendMail({ from: { name: 'Olathe Boundary Lab', address: user }, to, ...email });
}
