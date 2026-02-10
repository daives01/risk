import { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({ email });
      if (result.error) {
        setError(result.error.message ?? "Request failed");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        description={`If an account exists for ${email}, we sent a reset link.`}
        footer={
          <Link to="/login" className="text-sm text-primary underline underline-offset-4">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell title="Forgot password" description="Enter your email to receive a reset link.">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 py-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
          <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </AuthShell>
  );
}
