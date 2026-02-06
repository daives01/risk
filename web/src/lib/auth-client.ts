import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL ?? "http://localhost:3210",
  plugins: [usernameClient(), convexClient(), crossDomainClient()],
});
