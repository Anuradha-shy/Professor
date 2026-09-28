import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Cloud, KeyRound, Lock, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CardShell, PageHeader } from "@/components/kit";
import { apiPatch, apiPost } from "@/lib/api";
import { errDetail, fmtDate, fmtMinutes } from "@/lib/format";
import {
  useDevices,
  useGoals,
  useNotionLogs,
  useNotionStatus,
  useProfile,
  useRevisions,
  useSessions,
  useSubjects,
  useTests,
} from "@/lib/queries";
import type { DeviceOut, NotionSyncOut, NotionTestOut, Profile } from "@/lib/types";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const FIELD_MAP = [
  { app: "Session topic + subject", notion: "Name", type: "Title" },
  { app: "Duration (minutes)", notion: "Hours", type: "Number" },
  { app: "Study date", notion: "Date", type: "Rich text" },
];

export default function Settings() {
  const qc = useQueryClient();
  const notionStatus = useNotionStatus();
  const logs = useNotionLogs();
  const devices = useDevices();
  const profile = useProfile();
  const subjects = useSubjects();
  const sessions = useSessions();
  const goals = useGoals();
  const revisions = useRevisions();
  const tests = useTests();

  const [form, setForm] = useState<Profile | null>(null);
  const [targetHours, setTargetHours] = useState("8");
  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    if (profile.data && form === null) {
      setForm(profile.data);
      setTargetHours(String(profile.data.daily_target_minutes / 60));
    }
  }, [profile.data, form]);

  const invalidateNotion = () => {
    qc.invalidateQueries({ queryKey: ["notion"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  const testConnection = useMutation({
    mutationFn: () => apiPost<NotionTestOut>("/notion/test"),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.warning(res.message);
      qc.invalidateQueries({ queryKey: ["notion", "logs"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const sync = useMutation({
    mutationFn: () => apiPost<NotionSyncOut>("/notion/push-sessions"),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      invalidateNotion();
      qc.invalidateQueries({ queryKey: ["notion", "logs"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      apiPatch<Profile>("/profile", {
        name: form?.name,
        target_exam: form?.target_exam,
        optional_subject: form?.optional_subject,
        daily_target_minutes: Math.max(30, Math.round(Number(targetHours) * 60)) || 480,
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const toggleDevice = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      apiPatch<DeviceOut>(`/auth/devices/${id}`, { approved }),
    onSuccess: (d) => {
      toast.success(d.approved ? "Device approved" : "Device revoked");
      qc.invalidateQueries({ queryKey: ["auth", "devices"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const changePin = useMutation({
    mutationFn: () => apiPost("/auth/pin", { current_pin: currentPin, new_pin: newPin }),
    onSuccess: () => {
      toast.success("Passcode updated");
      setPinOpen(false);
      setCurrentPin("");
      setNewPin("");
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const st = notionStatus.data;
  const pinValid =
    currentPin.length >= 4 &&
    newPin.length >= 4 &&
    newPin.length <= 32 &&
    newPin === newPin.trim() &&
    /^[A-Za-z0-9]+$/.test(newPin);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Preferences"
        title="Settings & Notion Sync"
        description="Your profile, the Notion database bridge, and the vault passcode."
      />

      {/* Notion sync hub */}
      <CardShell
        title="Notion Database Sync"
        overline="Two-way bridge"
        testId="notion-hub-card"
        action={
          <Badge
            data-testid="notion-status-badge"
            className={cn(
              "border-0 font-mono text-[10px] uppercase tracking-[0.14em]",
              st?.configured ? "bg-[#EDF5F0] text-[#1D4532]" : "bg-[#FEF3E2] text-[#8A3D04]",
            )}
          >
            {st === undefined ? "checking…" : st.configured ? "Live · connected" : "Simulated mode"}
          </Badge>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <dl className="space-y-2 text-sm" data-testid="notion-status-list">
              <div className="flex items-center justify-between rounded-lg border border-[#F0EDE5] px-3 py-2">
                <dt className="text-[#5E6258]">Integration token</dt>
                <dd className="font-mono text-[#1C1D18]" data-testid="notion-token-hint">
                  {st?.token_hint ?? "not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#F0EDE5] px-3 py-2">
                <dt className="text-[#5E6258]">Database ID</dt>
                <dd className="max-w-48 truncate font-mono text-[#1C1D18]" data-testid="notion-db-id">
                  {st?.database_id ?? "not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#F0EDE5] px-3 py-2">
                <dt className="text-[#5E6258]">Last sync</dt>
                <dd className="font-mono text-[#1C1D18]" data-testid="notion-last-sync">
                  {st?.last_synced_at ? new Date(st.last_synced_at).toLocaleString("en-IN") : "never"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                data-testid="notion-test-connection-btn"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending}
              >
                <RefreshCw className={cn("size-4", testConnection.isPending && "animate-spin")} />
                Test connection
              </Button>
              <Button
                data-testid="notion-sync-now-btn"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
              >
                <Cloud className="size-4" />
                {sync.isPending ? "Syncing…" : "Sync recent sessions"}
              </Button>
            </div>
            {!st?.configured ? (
              <p className="rounded-lg bg-[#FEF3E2] px-3 py-2 text-xs leading-relaxed text-[#8A3D04]" data-testid="notion-simulated-note">
                No token found. Add <span className="font-mono font-semibold">NOTION_TOKEN</span> to{" "}
                <span className="font-mono font-semibold">backend/.env</span> and restart the backend.
              </p>
            ) : (
              <p className="rounded-lg bg-[#EDF5F0] px-3 py-2 text-xs leading-relaxed text-[#1D4532]" data-testid="notion-live-note">
                Live sync is active. Browse, filter and edit every entry on the{" "}
                <span className="font-semibold">Notion</span> page — edits write back to your
                database in real time.
              </p>
            )}
            <details className="rounded-lg border border-[#F0EDE5] px-3 py-2 text-xs text-[#5E6258]" data-testid="notion-instructions">
              <summary className="cursor-pointer font-medium text-[#383A34]">How to connect (2 minutes)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Open notion.so/profile/integrations → New integration → copy the Internal Integration Secret.</li>
                <li>In your Notion database: ••• menu → Add connections → pick your integration.</li>
                <li>Copy the database ID from the URL (the 32-char string after the last “-”).</li>
                <li>Put both values in backend/.env and restart the backend. Run “Test connection”.</li>
              </ol>
            </details>
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
                Field mapping
              </p>
              <ul className="mt-2 space-y-1.5" data-testid="notion-field-map">
                {FIELD_MAP.map((f) => (
                  <li
                    key={f.notion}
                    className="flex items-center justify-between rounded-lg bg-[#F6F2E9] px-3 py-2 text-xs"
                  >
                    <span className="text-[#383A34]">{f.app}</span>
                    <span className="font-mono text-[#5E6258]">
                      → {f.notion} ({f.type})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
                Sync log
              </p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1" data-testid="notion-logs">
                {(logs.data ?? []).length === 0 ? (
                  <li className="rounded-lg border border-dashed border-[#E8E3D7] px-3 py-3 text-center text-xs text-[#8B8F83]">
                    No sync runs yet.
                  </li>
                ) : (
                  (logs.data ?? []).map((l) => (
                    <li key={l.id} data-testid={`notion-log-${l.id}`} className="flex items-start gap-2 text-xs">
                      {l.ok ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#15803D]" />
                      ) : (
                        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#C8640E]" />
                      )}
                      <span className="text-[#383A34]">{l.message}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-[#8B8F83]">
                        {l.mode}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-[#5E6258]" data-testid="notion-cache-line">
          {st?.cached_entries ?? 0} entries mirrored · {st?.unread_entries ?? 0} unread
        </p>
      </CardShell>

      {/* Trusted devices */}
      <CardShell title="Trusted devices" overline="Device binding" testId="devices-card">
        <p className="mb-3 text-sm text-[#5E6258]">
          The first device to unlock is trusted automatically. Any other device is refused until you
          approve it here — so nobody else can open your tracker even with the PIN.
        </p>
        <ul className="space-y-2" data-testid="devices-list">
          {(devices.data ?? []).length === 0 ? (
            <li className="rounded-lg border border-dashed border-[#E8E3D7] px-3 py-3 text-center text-xs text-[#8B8F83]">
              No devices recorded yet.
            </li>
          ) : (
            (devices.data ?? []).map((d: DeviceOut) => (
              <li
                key={d.id}
                data-testid={`device-${d.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F0EDE5] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-[#1C1D18]">
                    {d.label}
                    {d.current ? (
                      <Badge className="border-0 bg-[#EDF5F0] font-mono text-[10px] uppercase text-[#1D4532]">
                        this device
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-[#8B8F83]">{d.user_agent || d.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "border-0 font-mono text-[10px] uppercase tracking-[0.12em]",
                      d.approved ? "bg-[#EDF5F0] text-[#1D4532]" : "bg-[#FEF3E2] text-[#8A3D04]",
                    )}
                  >
                    {d.approved ? "approved" : "blocked"}
                  </Badge>
                  <Button
                    size="xs"
                    variant="outline"
                    data-testid={`device-toggle-${d.id}`}
                    onClick={() => toggleDevice.mutate({ id: d.id, approved: !d.approved })}
                  >
                    {d.approved ? "Revoke" : "Approve"}
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </CardShell>

      {/* Profile */}
      <CardShell title="Candidate profile" overline="Who is studying" testId="profile-card">
        {form === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-[#F0EDE5]" />
        ) : (
          <form
            data-testid="profile-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                data-testid="profile-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-exam">Target exam</Label>
              <Input
                id="profile-exam"
                data-testid="profile-exam-input"
                value={form.target_exam}
                onChange={(e) => setForm({ ...form, target_exam: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-optional">Optional subject</Label>
              <Input
                id="profile-optional"
                data-testid="profile-optional-input"
                value={form.optional_subject}
                onChange={(e) => setForm({ ...form, optional_subject: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-target">Daily target (hours)</Label>
              <Input
                id="profile-target"
                data-testid="profile-target-input"
                type="number"
                min={1}
                step={0.5}
                value={targetHours}
                onChange={(e) => setTargetHours(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                data-testid="profile-save-btn"
                disabled={saveProfile.isPending}
                className="bg-[#C8640E] text-white hover:bg-[#A85309]"
              >
                {saveProfile.isPending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        )}
      </CardShell>

      {/* Security */}
      <CardShell title="Vault & data" overline="Security" testId="security-card">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            data-testid="change-pin-btn"
            onClick={() => setPinOpen(true)}
          >
            <KeyRound className="size-4" /> Change password
          </Button>
          <Button
            variant="outline"
            data-testid="lock-now-btn"
            onClick={() => void endSession()}
          >
            <Lock className="size-4" /> Lock now
          </Button>
          <p className="text-xs text-[#5E6258]">
            {subjects.data?.length ?? 0} subjects · {sessions.data?.length ?? 0} sessions ·{" "}
            {goals.data?.length ?? 0} goals · {revisions.data?.length ?? 0} revisions ·{" "}
            {tests.data?.length ?? 0} tests
          </p>
        </div>
      </CardShell>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Change password</DialogTitle>
            <DialogDescription>
              4–32 letters or digits. You'll need it at the next unlock.
            </DialogDescription>
          </DialogHeader>
          <form
            data-testid="pin-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (pinValid) changePin.mutate();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="pin-current">Current passcode</Label>
              <Input
                id="pin-current"
                data-testid="pin-current-input"
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-new">New passcode</Label>
              <Input
                id="pin-new"
                data-testid="pin-new-input"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" data-testid="pin-cancel-button" onClick={() => setPinOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="pin-save-button"
                disabled={!pinValid || changePin.isPending}
                className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
              >
                {changePin.isPending ? "Updating…" : "Update passcode"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <p className="pb-6 text-center text-xs text-[#8B8F83]">
        Ashoka Academy · daily target {fmtMinutes(profile.data?.daily_target_minutes ?? 480)} ·
        targets {profile.data?.target_exam ?? "UPSC"}
      </p>
    </div>
  );
}
