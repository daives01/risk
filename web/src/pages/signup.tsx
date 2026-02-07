import { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signUp.email({
        name,
        username,
        displayUsername: name || username,
        email,
        password,
        callbackURL: "/verify-email",
      });

      if (result.error) {
        setError(result.error.message ?? "Sign up failed");
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
            <CardDescription>
              A verification link was sent to <strong>{email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardFooter className="py-6">
            <p className="text-sm text-muted-foreground">
              Already verified?{" "}
              <Link to="/login" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <Card className="glass-panel w-full max-w-md border-0 py-0">
        <CardHeader className="py-6">
          <CardTitle className="hero-title text-2xl">Create account</CardTitle>
          <CardDescription>Set up your profile and start playing.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              {loading ? "Creating account..." : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have one?{" "}
              <Link to="/login" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
