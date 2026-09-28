interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
  testId?: string;
}

// Animated SVG progress ring — stroke-dashoffset eases out over 0.8s.
export default function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  label,
  className,
  testId,
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      data-testid={testId}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(clamped)}% complete`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8E3D7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#C8640E"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-lg font-semibold text-[#1C1D18]">
          {label ?? `${Math.round(clamped)}%`}
        </span>
      </div>
    </div>
  );
}
