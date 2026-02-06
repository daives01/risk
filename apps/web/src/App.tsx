import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { Providers } from "@/lib/providers"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import LoginPage from "@/pages/login"
import SignUpPage from "@/pages/signup"
import VerifyEmailPage from "@/pages/verify-email"
import ForgotPasswordPage from "@/pages/forgot-password"
import ResetPasswordPage from "@/pages/reset-password"

function HomePage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Risk</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {session.user.name}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => authClient.signOut()}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-muted-foreground">Welcome to Risk!</p>
      </main>
    </div>
  )
}

function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </Providers>
  )
}

export default App
