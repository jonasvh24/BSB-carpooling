// Cloudflare (the quick tunnel included) rewrites anything that looks like an email
// address in HTML and injects a decoder script, which React then sees as a hydration
// mismatch. The email_off markers tell Cloudflare to leave this span alone.
export function Email({ address, className }: { address: string; className?: string }) {
  const safe = address.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return <span className={className} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<!--email_off-->${safe}<!--/email_off-->` }} />;
}
