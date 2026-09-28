import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useSubjects } from "@/lib/queries";
import type { StudySession } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_MINUTES = [30, 45, 60, 90, 120, 180];

export default function SessionDialog({ open, onOpenChange }: SessionDialogProps) {
  const qc = useQueryClient();
  const subjects = useSubjects();
  const [subjectId, setSubjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSubjectId("");
    setTopic("");
    setMinutes("60");
    setDate(todayISO());
    setNotes("");
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost<StudySession>("/sessions", {
        subject_id: subjectId,
        topic: topic.trim(),
        duration_minutes: Number(minutes) || 0,
        date,
        notes: notes.trim(),
      }),
    onSuccess: (session) => {
      toast.success(`Logged ${session.duration_minutes}m on ${session.topic}`);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["notion", "status"] });
      reset();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not log the session"),
  });

  const valid = subjectId !== "" && topic.trim().length > 0 && Number(minutes) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Log a study session</DialogTitle>
          <DialogDescription>
            Every entry feeds your streak, velocity and insights.
          </DialogDescription>
        </DialogHeader>
        <form
          data-testid="session-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="session-subject">Subject</Label>
            <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
              <SelectTrigger data-testid="session-subject-select" className="w-full">
                <SelectValue>
                  {(v) =>
                    subjects.data?.find((s) => s.id === (v as string))?.short_name ??
                    "Choose subject"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(subjects.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="session-topic">Topic</Label>
            <Input
              id="session-topic"
              data-testid="session-topic-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Fundamental Rights — Article 21"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                data-testid="session-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="session-minutes">Duration (minutes)</Label>
              <Input
                id="session-minutes"
                data-testid="session-minutes-input"
                type="number"
                min={5}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`session-minutes-${m}`}
                onClick={() => setMinutes(String(m))}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors",
                  Number(minutes) === m
                    ? "border-[#C8640E] bg-[#FEF3E2] text-[#8A3D04]"
                    : "border-[#E8E3D7] text-[#5E6258] hover:border-[#C8640E]",
                )}
              >
                {m}m
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="session-notes">Notes (optional)</Label>
            <Textarea
              id="session-notes"
              data-testid="session-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Key takeaways, doubts to revisit…"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              data-testid="session-cancel-button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!valid || create.isPending}
              data-testid="session-save-button"
              className="bg-[#C8640E] text-white hover:bg-[#A85309]"
            >
              {create.isPending ? "Saving…" : "Save session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
