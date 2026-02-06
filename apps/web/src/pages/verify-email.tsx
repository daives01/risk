import { Link, useSearchParams, Navigate } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const errorMessages: Record<string, string> = {
  token_expired: "This verification link has expired. Please request a new one.",
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Verification failed</CardTitle>
          <CardDescription>
            {errorMessages[error] ?? "Something went wrong verifying your email."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            to="/login"
            className="text-sm text-primary underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
