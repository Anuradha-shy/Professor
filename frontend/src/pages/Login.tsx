import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Delete, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Backdrop3D from "@/components/Backdrop3D";
import { ChakraMark } from "@/components/kit";
import { apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { MeOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEMO_PIN = "1947";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function Login() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  // Already unlocked? Straight to the dashboard.
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<MeOut>("/auth/me"),
    retry: false,
    staleTime: Infinity,
  });
  if (me.isSuccess) return <Navigate to="/" replace />;

  const unlock = useMutation({
    mutationFn: (value: string) => apiPost<MeOut>("/auth/unlock", { pin: value }),
    onSuccess: () => {
      beginSession();
      navigate("/", { replace: true });
    },
    onError: () => {
      setPin("");
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      toast.error("Incorrect passcode — try again");
    },
  });

  const push = (digit: string) => {
    if (pin.length < 8 && !unlock.isPending) setPin(pin + digit);
  };
  const back = () => setPin(pin.slice(0, -1));

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#FBF9F4] px-4">
      <Backdrop3D />
      <main className="relative z-10 w-full max-w-sm">
        <div
          data-testid="pin-gate-card"
          className={cn(
            "rounded-2xl border border-[#E8E3D7] bg-white/95 p-8 shadow-[0_24px_64px_rgba(28,29,24,0.12)] backdrop-blur-2xl transition-transform",
            shake && "animate-shake",
          )}
        >
          <div className="flex flex-col items-center text-center">
            <ChakraMark className="size-14" />
            <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-[#1C1D18]">
              Ashoka Academy
            </h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#8C6212]">
              Vault protected · UPSC CSE Tracker
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#5E6258]">
              Enter your passcode to unlock your study command centre.
            </p>
          </div>

          <div
            data-testid="pin-dots"
            className="mt-6 flex items-center justify-center gap-2.5"
            aria-label="Passcode entry"
          >
            {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full border transition-colors",
                  i < pin.length ? "border-[#C8640E] bg-[#C8640E]" : "border-[#D8D2C2] bg-white",
                )}
              />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`pin-key-${k}`}
                onClick={() => push(k)}
                className="rounded-xl border border-[#E8E3D7] bg-white py-3.5 font-serif text-xl font-medium text-[#1C1D18] transition-all hover:border-[#C8640E] hover:bg-[#FEF3E2] active:scale-95"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              data-testid="pin-key-delete"
              onClick={back}
              aria-label="Delete last digit"
              className="rounded-xl border border-[#E8E3D7] bg-white py-3.5 text-[#5E6258] transition-all hover:border-[#C8640E] hover:text-[#1C1D18] active:scale-95"
            >
              <Delete className="mx-auto size-5" />
            </button>
            <button
              type="button"
              data-testid="pin-key-0"
              onClick={() => push("0")}
              className="rounded-xl border border-[#E8E3D7] bg-white py-3.5 font-serif text-xl font-medium text-[#1C1D18] transition-all hover:border-[#C8640E] hover:bg-[#FEF3E2] active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              data-testid="pin-unlock-button"
              disabled={pin.length < 4 || unlock.isPending}
              onClick={() => unlock.mutate(pin)}
              className="rounded-xl bg-[#1D3A2C] py-3.5 text-white transition-all hover:bg-[#2F5E48] disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
              aria-label="Unlock"
            >
              <ShieldCheck className="mx-auto size-5" />
            </button>
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full border-[#C8640E] bg-[#FEF3E2] font-medium text-[#8A3D04] hover:bg-[#C8640E] hover:text-white"
            data-testid="pin-demo-button"
            disabled={unlock.isPending}
            onClick={() => {
              setPin(DEMO_PIN);
              unlock.mutate(DEMO_PIN);
            }}
          >
            Quick unlock with demo PIN ({DEMO_PIN})
          </Button>
          <p className="mt-4 text-center text-xs text-[#8B8F83]">
            Demo passcode {DEMO_PIN} · change it anytime in Settings
          </p>
        </div>
      </main>
    </div>
  );
}
