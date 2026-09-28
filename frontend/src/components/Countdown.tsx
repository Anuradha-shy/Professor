import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { ForecastOut } from "@/lib/types";

const PRELIMS = new Date("2027-05-24T09:30:00+05:30").getTime();

/** Real-time countdown to UPSC CSE Prelims, 24 May 2027 (server-anchored days). */
export default function Countdown() {
  const [now, setNow] = useState(() => Date.now());
  const server = useQuery({
    queryKey: ["analytics", "forecast"],
    queryFn: () => apiGet<ForecastOut>("/analytics/forecast"),
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const diff = Math.max(0, PRELIMS - now);
  const days = server.data?.days_to_prelims ?? Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const units = [
    { label: "days", value: days },
    { label: "hrs", value: hours },
    { label: "min", value: mins },
    { label: "sec", value: secs },
  ];

  return (
    <section
      data-testid="prelims-countdown"
      className="relative overflow-hidden rounded-2xl border border-[#1D3A2C]/20 bg-[#1D3A2C] p-6 text-white shadow-[0_8px_32px_rgba(29,58,44,0.18)]"
    >
      <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(200,100,14,0.35),transparent_65%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#E8C79A]">
            Final attempt · Prelims 24 May 2027
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold tracking-tight">
            Every hour counts from here
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
