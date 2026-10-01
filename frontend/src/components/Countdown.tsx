import { useEffect, useState } from "react";
const EXAMS = {
  upsc: { label: "UPSC CSE Prelims", date: "24 May 2027", target: new Date("2027-05-24T09:30:00+05:30").getTime() },
  uppsc: { label: "UPPSC Prelims", date: "6 Dec 2026", target: new Date("2026-12-06T09:30:00+05:30").getTime() },
} as const;

/** Wall-clock countdown to an exam date; remains accurate after refresh and navigation. */
export default function Countdown({
  exam = "upsc",
  compact = false,
}: {
  exam?: keyof typeof EXAMS;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const info = EXAMS[exam];

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const diff = Math.max(0, info.target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const units = [
    { label: "days", value: days },
    { label: "hrs", value: hours },
    { label: "min", value: mins },
    { label: "sec", value: secs },
  ];

  if (compact) {
    return (
      <div
        data-testid={`${exam}-global-countdown`}
        className="flex min-w-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-white shadow-inner backdrop-blur-xl"
        aria-label={`${info.label}: ${days} days remaining`}
      >
        <span className="hidden font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#E8C79A] sm:inline">
          {exam === "upsc" ? "CSE" : "UPPSC"}
        </span>
        <span className="font-mono text-xs font-semibold tabular-nums sm:text-sm">
          {days}d {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      </div>
    );
  }

  return (
    <section
      data-testid="prelims-countdown"
      className="relative overflow-hidden rounded-2xl border border-[#1D3A2C]/20 bg-[#1D3A2C] p-6 text-white shadow-[0_8px_32px_rgba(29,58,44,0.18)]"
    >
      <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(200,100,14,0.35),transparent_65%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#E8C79A]">
            Final attempt · {info.label} · {info.date}
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold tracking-tight">
            {days > 0 ? `${days} days to go` : "Exam day is here"}
          </p>
        </div>
        <div className="flex items-end gap-3" data-testid="countdown-units">
          {units.map((u) => (
            <div key={u.label} className="text-center">
              <p className="font-mono text-3xl font-semibold tabular-nums leading-none sm:text-4xl">
                {String(u.value).padStart(2, "0")}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#B5C8BD]">
                {u.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
