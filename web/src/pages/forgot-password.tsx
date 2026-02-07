import { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
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
      <div className="page-shell flex items-center justify-center soft-grid">
        <Card className="glass-panel w-full max-w-md border-0 py-0">
          <CardHeader className="py-6">
            <CardTitle className="hero-title text-2xl">Check your email</CardTitle>
            <CardDescription>If an account exists for {email}, we sent a reset link.</CardDescription>
          </CardHeader>
          <CardFooter className="py-6">
            <Link to="/login" className="text-sm text-primary underline underline-offset-4">
              Back to sign in
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
          <CardTitle className="hero-title text-2xl">Forgot password</CardTitle>
          <CardDescription>Enter your email to receive a reset link.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
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
      </Card>
    </div>
  );
}
