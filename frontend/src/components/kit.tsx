import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared presentational kit for the editorial dashboard shell.

export function ChakraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden>
      <circle cx="20" cy="20" r="18.5" stroke="#1D3A2C" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="4" fill="#C8640E" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={20 + 5.5 * Math.cos(a)}
            y1={20 + 5.5 * Math.sin(a)}
            x2={20 + 17 * Math.cos(a)}
            y2={20 + 17 * Math.sin(a)}
            stroke="#1D3A2C"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function PageHeader({
  overline,
  title,
  description,
  actions,
  testId,
}: {
  overline?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {overline ? (
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[#8C6212]">
            {overline}
          </p>
        ) : null}
        <h1
          data-testid={testId}
          className="mt-1 font-serif text-3xl font-semibold tracking-tight text-[#1C1D18] sm:text-4xl"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5E6258]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  sub,
  testId,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  testId?: string;
  accent?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border p-5 shadow-[0_1px_2px_rgba(28,29,24,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        accent
          ? "border-[#E2DCCE] bg-[#FEF3E2]"
          : "border-[#E8E3D7] bg-white",
      )}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
        {label}
      </p>
      <p className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#1C1D18]">{value}</p>
      {sub ? <p className="mt-1 text-sm text-[#5E6258]">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  testId,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#E8E3D7] bg-[#FBF9F4]/60 px-6 py-10 text-center"
    >
      <div className="text-[#B9B29F]">{icon}</div>
      <p className="font-serif text-base font-medium text-[#383A34]">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-[#5E6258]">{hint}</p> : null}
    </div>
  );
}

export function SubjectChip({ short, color }: { short: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E3D7] bg-[#F6F2E9] px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#383A34]">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {short}
    </span>
  );
}

export function CardShell({
  title,
  overline,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  overline?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        "rounded-2xl border border-[#E8E3D7] bg-white p-6 shadow-[0_1px_2px_rgba(28,29,24,0.04)]",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {overline ? (
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
              {overline}
            </p>
          ) : null}
          <h2 className="font-serif text-xl font-medium tracking-tight text-[#1C1D18]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
