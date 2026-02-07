import { useState } from "react"
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { Providers } from "@/lib/providers"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import LoginPage from "@/pages/login"
import SignUpPage from "@/pages/signup"
import VerifyEmailPage from "@/pages/verify-email"
import ForgotPasswordPage from "@/pages/forgot-password"
import ResetPasswordPage from "@/pages/reset-password"
import CreateGamePage from "@/pages/create-game"
import LobbyPage from "@/pages/lobby"
import JoinGamePage from "@/pages/join-game"
import GamePage from "@/pages/game"
import AdminMapsPage from "@/pages/admin-maps"
import AdminMapEditorPage from "@/pages/admin-map-editor"

function HomePage() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState("")

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

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code) {
      navigate(`/join/${code}`)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link to="/" className="text-xl font-semibold">Risk</Link>
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
      <main className="mx-auto max-w-md p-6">
        <div className="flex flex-col gap-6">
          <Button asChild size="lg" className="w-full">
            <Link to="/games/new">Create Game</Link>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or join with code
              </span>
            </div>
          </div>

          <form onSubmit={handleJoin} className="flex gap-2">
            <Input
              placeholder="Enter invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="font-mono uppercase"
              maxLength={6}
            />
            <Button type="submit" variant="outline" disabled={!joinCode.trim()}>
              Join
            </Button>
          </form>
        </div>
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
          <Route path="/games/new" element={<CreateGamePage />} />
          <Route path="/g/:gameId" element={<LobbyPage />} />
          <Route path="/play/:gameId" element={<GamePage />} />
          <Route path="/join/:code" element={<JoinGamePage />} />
          <Route path="/admin/maps" element={<AdminMapsPage />} />
          <Route path="/admin/maps/:mapId" element={<AdminMapEditorPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </Providers>
  )
}

export default App
