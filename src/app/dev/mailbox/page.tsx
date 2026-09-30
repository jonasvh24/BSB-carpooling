import { devMailbox } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default function MailboxPage() {
  const mails = devMailbox();
  return (
    <>
      <h1 className="text-2xl font-semibold">Mailbox</h1>
      <p className="text-muted">Last {mails.length} messages sent by this process.</p>
      <ul className="mt-4 space-y-3">
        {mails.map((m, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="text-muted">{m.sentAt} · to {m.to}</div>
            <div className="font-medium">{m.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap break-all">{m.text}</pre>
          </li>
        ))}
      </ul>
    </>
  );
}
