import { notFound } from "next/navigation";
import { isDevConvenienceEnabled } from "@/lib/env";

// Everything under /dev exists only in development outside pilot mode.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!isDevConvenienceEnabled()) notFound();
  return <main id="main" className="mx-auto max-w-3xl px-4 py-6">{children}</main>;
}
