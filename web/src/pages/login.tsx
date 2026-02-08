import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestedRedirect = searchParams.get("redirect");
  const redirectTarget =
    requestedRedirect && requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trimmedIdentifier = identifier.trim();
      const result = trimmedIdentifier.includes("@")
        ? await authClient.signIn.email({
            email: trimmedIdentifier,
            password,
            callbackURL: redirectTarget,
          })
        : await authClient.signIn.username({
            username: trimmedIdentifier,
            password,
            callbackURL: redirectTarget,
          });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
      } else {
        navigate(redirectTarget, { replace: true });
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      description="Continue your active games or start a new one."
      masthead={(
        <div className="text-center">
          <h1 className="hero-title text-2xl leading-tight text-balance text-primary sm:text-3xl md:text-4xl">
            <span className="block">Legally Distinct</span>
            <span className="block">Global Domination</span>
          </h1>
        </div>
      )}
    >
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or username</Label>
            <Input id="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-sm text-primary underline underline-offset-4">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 py-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-sm text-muted-foreground">
            No account yet?{" "}
            <Link to="/signup" className="text-primary underline underline-offset-4">
              Create one
            </Link>
          </p>
        </CardFooter>
      </form>
    </AuthShell>
  );
}
