// Initials fallback keeps the layout stable when no photo was uploaded.
export function Avatar({ name, photoUrl, size = 48 }: { name: string; photoUrl: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  // Stable colour per person, drawn from the school palette.
  const tones = ["bg-navy text-on-navy", "bg-accent text-accent-text", "bg-gold text-[#3c3011]", "bg-navy-2 text-gold"];
  const tone = tones[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % tones.length];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tone}`}
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {initials || "?"}
    </span>
  );
}
