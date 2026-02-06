import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "./auth-client";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3210",
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
