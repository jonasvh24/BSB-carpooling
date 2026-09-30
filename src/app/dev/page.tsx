import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DevIndex() {
  const users = await db.user.findMany({
    orderBy: [{ isSeed: "asc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, isSeed: true, onboardingCompletedAt: true },
    take: 100,
  });
  return (
    <>
      <h1 className="text-2xl font-semibold">Development tools</h1>
      <p className="text-muted">Not available in pilot mode.</p>
      <p className="mt-4">
        <a className="underline" href="/dev/mailbox">Mailbox</a>
      </p>
      <h2 className="mt-6 text-lg font-medium">Sign in as</h2>
      <ul className="mt-2 divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {u.name || "(no name)"} · {u.email} · {u.role}
              {u.isSeed ? " · seed" : ""}
              {u.onboardingCompletedAt ? "" : " · not onboarded"}
            </span>
            <a className="underline" href={`/dev/login-as/${u.id}`}>login</a>
          </li>
        ))}
      </ul>
    </>
  );
}
