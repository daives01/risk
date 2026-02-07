import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { GlobalKeyboardNav } from "@/components/ui/global-keyboard-nav";
import { Providers } from "@/lib/providers";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import SignUpPage from "@/pages/signup";
import VerifyEmailPage from "@/pages/verify-email";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import CreateGamePage from "@/pages/create-game";
import LobbyPage from "@/pages/lobby";
import JoinGamePage from "@/pages/join-game";
import GamePage from "@/pages/game";
import AdminMapsPage from "@/pages/admin-maps";
import AdminMapEditorPage from "@/pages/admin-map-editor";

function App() {
  return (
    <Providers>
      <BrowserRouter>
        <GlobalKeyboardNav />
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
  );
}

export default App;
