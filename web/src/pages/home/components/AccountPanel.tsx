import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type AccountPanelProps = {
  session: {
    user: {
      email: string;
      name: string;
    };
  };
  isAdmin: boolean | undefined;
};

export function AccountPanel({ session, isAdmin }: AccountPanelProps) {
  const navigate = useNavigate();
  const settings = useQuery(api.userSettings.getMySettings, {});
  const setTurnEmailSetting = useMutation(api.userSettings.setEmailTurnNotificationsEnabled);

  const sessionUsername = (session.user as { username?: string | null }).username ?? "";

  const [profileUsername, setProfileUsername] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [emailSettingSaving, setEmailSettingSaving] = useState(false);
  const [emailSettingError, setEmailSettingError] = useState<string | null>(null);

  useEffect(() => {
    setProfileUsername(sessionUsername || session.user.name || "");
  }, [session, sessionUsername]);

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    const nextUsername = profileUsername.trim();

    if (nextUsername.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      setProfileSuccess(null);
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const result = await authClient.updateUser({
        username: nextUsername,
        displayUsername: nextUsername,
        name: nextUsername,
      });
      if (result.error) {
        setProfileError(result.error.message ?? "Unable to update account details.");
        return;
      }
      setProfileSuccess("Account details updated.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();

    if (!currentPassword || !newPassword) {
      setPasswordError("Current and new password are required.");
      setPasswordSuccess(null);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation must match.");
      setPasswordSuccess(null);
      return;
    }

    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        setPasswordError(result.error.message ?? "Unable to change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function toggleTurnEmails(enabled: boolean) {
    setEmailSettingError(null);
    setEmailSettingSaving(true);
    try {
      await setTurnEmailSetting({ enabled });
    } catch (error) {
      setEmailSettingError(
        error instanceof Error ? error.message : "Unable to update notifications.",
      );
    } finally {
      setEmailSettingSaving(false);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <form
        onSubmit={submitProfile}
        className="space-y-3 rounded-lg border bg-background/75 p-3 lg:col-span-2"
      >
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Account</p>

        <div className="space-y-2">
          <label htmlFor="account-username" className="text-xs text-muted-foreground">
            Username
          </label>
          <Input
            id="account-username"
            value={profileUsername}
            onChange={(event) => setProfileUsername(event.target.value)}
            minLength={3}
            maxLength={30}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="account-email" className="text-xs text-muted-foreground">
            Email
          </label>
          <Input id="account-email" value={session.user.email} disabled />
        </div>

        {profileError && <p className="text-sm text-red-400">{profileError}</p>}
        {profileSuccess && <p className="text-sm text-emerald-400">{profileSuccess}</p>}
        <Button type="submit" variant="outline" disabled={profileSaving}>
          {profileSaving ? "Saving..." : "Save profile"}
        </Button>

        <hr className="border-border/50" />

        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Update password</p>
        <div className="space-y-2">
          <label htmlFor="current-password" className="text-xs text-muted-foreground">
            Current Password
          </label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-xs text-muted-foreground">
            New Password
          </label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-xs text-muted-foreground">
            Confirm New Password
          </label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
        {passwordSuccess && <p className="text-sm text-emerald-400">{passwordSuccess}</p>}
        <Button
          type="button"
          variant="outline"
          disabled={passwordSaving}
          onClick={submitPassword}
        >
          {passwordSaving ? "Updating..." : "Update password"}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="space-y-3 rounded-lg border bg-background/75 p-3">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Notifications</p>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Email notifications</span>
            <Switch
              checked={settings?.emailTurnNotificationsEnabled ?? false}
              onCheckedChange={(checked) => {
                void toggleTurnEmails(checked);
              }}
              disabled={emailSettingSaving || settings === undefined}
            />
          </label>
          {emailSettingError && <p className="text-sm text-red-400">{emailSettingError}</p>}
        </div>

        <div className="space-y-3 rounded-lg border bg-background/75 p-3">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Session</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => authClient.signOut()}>
              Sign out
            </Button>
            {isAdmin && (
              <>
                <Button onClick={() => navigate("/admin/maps")}>Open map editor</Button>
                <Button variant="outline" onClick={() => navigate("/admin/slack")}>
                  Open Slack admin
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
