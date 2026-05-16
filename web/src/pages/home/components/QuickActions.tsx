import { useState, useCallback, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/invite-codes";

type QuickActionsProps = {
  joinRef: RefObject<HTMLInputElement | null>;
  browsePublicLobbies: () => void;
};

export function QuickActions({ joinRef, browsePublicLobbies }: QuickActionsProps) {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  const submitJoinCode = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const code = normalizeInviteCode(joinCode);
      if (!code) return;
      if (!isValidInviteCode(code)) {
        setJoinCodeError("Enter a valid 6-character invite code.");
        return;
      }
      setJoinCodeError(null);
      navigate(`/join/${code}`);
    },
    [joinCode, navigate],
  );

  return (
    <section className="space-y-3 rounded-lg border bg-background/75 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Quick Actions</p>
      </div>

      <Button className="w-full justify-between" onClick={() => navigate("/games/new")}>
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" /> Create game
        </span>
        <ShortcutHint shortcut="n" />
      </Button>

      <form onSubmit={submitJoinCode} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input
          ref={joinRef}
          value={joinCode}
          onChange={(event) => {
            setJoinCode(normalizeInviteCode(event.target.value));
            if (joinCodeError) setJoinCodeError(null);
          }}
          placeholder="Join code"
          maxLength={6}
          className="font-mono uppercase"
        />
        <Button type="submit" variant="outline" disabled={!isValidInviteCode(joinCode)}>
          Join code
        </Button>
        <Button type="button" variant="ghost" onClick={browsePublicLobbies}>
          Browse lobbies
        </Button>
      </form>
      {joinCodeError && <p className="text-sm text-destructive">{joinCodeError}</p>}
    </section>
  );
}
