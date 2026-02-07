import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const errorMessages: Record<string, string> = {
  token_expired: "This verification link has expired. Request a new one from sign in.",
  invalid_token: "This verification link is invalid.",
  user_not_found: "No account found for this email.",
};

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  if (!error) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <Card className="glass-panel w-full max-w-md border-0 py-0">
        <CardHeader className="py-6">
          <CardTitle className="hero-title text-2xl">Verification failed</CardTitle>
          <CardDescription>{errorMessages[error] ?? "Something went wrong verifying your email."}</CardDescription>
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
