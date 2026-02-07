import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="page-shell flex items-center justify-center soft-grid">
        <Card className="glass-panel w-full max-w-md border-0 py-0">
          <CardHeader className="py-6">
            <CardTitle className="hero-title text-2xl">Invalid link</CardTitle>
            <CardDescription>This password reset link is invalid or expired.</CardDescription>
          </CardHeader>
          <CardFooter className="py-6">
            <Link to="/forgot-password" className="text-sm text-primary underline underline-offset-4">
              Request another link
            </Link>
          </CardFooter>
        </Card>
      </div>
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
      <div className="page-shell flex items-center justify-center soft-grid">
        <Card className="glass-panel w-full max-w-md border-0 py-0">
          <CardHeader className="py-6">
            <CardTitle className="hero-title text-2xl">Password updated</CardTitle>
            <CardDescription>You can now sign in with your new password.</CardDescription>
          </CardHeader>
          <CardFooter className="py-6">
            <Link to="/login" className="text-sm text-primary underline underline-offset-4">
              Go to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <Card className="glass-panel w-full max-w-md border-0 py-0">
        <CardHeader className="py-6">
          <CardTitle className="hero-title text-2xl">Reset password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
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
      </Card>
    </div>
  );
}
