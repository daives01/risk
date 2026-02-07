import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const resetToken = token ?? undefined;

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!resetToken) {
    return (
      <AuthShell
        title="Invalid link"
        description="This password reset link is invalid or expired."
        footer={
          <Link to="/forgot-password" className="text-sm text-primary underline underline-offset-4">
            Request another link
          </Link>
        }
      />
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.resetPassword({ newPassword: password, token: resetToken });
      if (result.error) {
        setError(result.error.message ?? "Reset failed");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell
        title="Password updated"
        description="You can now sign in with your new password."
        footer={
          <Link to="/login" className="text-sm text-primary underline underline-offset-4">
            Go to sign in
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell title="Reset password" description="Choose a new password for your account.">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 py-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Resetting..." : "Reset password"}
          </Button>
          <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </AuthShell>
  );
}
