import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Backdrop3D from "@/components/Backdrop3D";
import { ChakraMark } from "@/components/kit";
import { apiGet, apiPost } from "@/lib/api";
import { deviceId } from "@/lib/device";
import { beginSession } from "@/lib/session";
import type { MeOut } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Login() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [shake, setShake] = useState(false);

  // Already unlocked? Straight to the dashboard.
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<MeOut>("/auth/me"),
    retry: false,
    staleTime: Infinity,
  });

  const unlock = useMutation({
    mutationFn: (value: string) =>
      apiPost<MeOut>("/auth/unlock", { pin: value, passkey: value, device_id: deviceId() }),
    onSuccess: () => {
      beginSession();
      navigate("/", { replace: true });
    },
    onError: (error) => {
      setPin("");
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      const detail =
        error instanceof Error && "body" in error
          ? (error as { body?: { detail?: string } }).body?.detail
          : undefined;
      toast.error(detail ?? "Incorrect password — try again");
    },
  });

  if (me.isSuccess) return <Navigate to="/" replace />;

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
              Professor 🥼
            </h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#8C6212]">
              Device-bound vault · UPSC CSE 2027
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#5E6258]">
              Enter your local passcode to unlock your study command centre.
            </p>
          </div>

          <form
            data-testid="login-form"
            className="mt-7 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pin.trim().length >= 4) unlock.mutate(pin.trim());
            }}
          >
            <div className="relative">
              <Input
                autoFocus
                data-testid="login-password-input"
                type={show ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 pr-11 text-center font-mono text-base tracking-[0.3em]"
              />
              <button
                type="button"
                data-testid="login-password-toggle"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8F83] transition-colors hover:text-[#1C1D18]"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={pin.trim().length < 4 || unlock.isPending}
              className="h-12 bg-[#1D3A2C] text-white transition-colors hover:bg-[#2F5E48]"
            >
              <ShieldCheck className="size-5" />
              {unlock.isPending ? "Unlocking…" : "Unlock vault"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-[#8B8F83]">
            Private to your trusted device · local unlock value
          </p>
        </div>
      </main>
    </div>
  );
}
