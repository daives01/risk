import { useEffect } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { AsciiGlobe } from "@/pages/landing/AsciiGlobe";

export default function LandingPage() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    document.title = "Legally Distinct Global Domination";
  }, []);

  return (
    <div className="soft-grid flex min-h-screen flex-col bg-[--app-bg] lg:flex-row">
      <div className="flex flex-col justify-center px-6 py-16 md:px-12 lg:w-[42%] lg:px-16 lg:py-0">
        <div className="max-w-lg">
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-primary">
            Legally Distinct
            <br />
            Global Domination
          </h1>

          <p className="mb-10 mt-5 max-w-md text-sm leading-relaxed text-[--app-muted]">
            Command armies, forge alliances, and conquer every territory in
            this classic game of global strategy. Play with your coworkers with
            async turns.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to={session ? "/home" : "/signup"}
              className="inline-flex h-11 items-center justify-center border border-[--app-accent] bg-[--app-accent] px-7 text-sm font-semibold tracking-[0.08em] text-[--app-bg] transition-all hover:brightness-110"
            >
              {session ? "GO TO HQ" : "SIGN UP"}
            </Link>
            <Link
              to={session ? "/games/new" : "/login"}
              className="inline-flex h-11 items-center justify-center border border-[--app-border] bg-transparent px-7 text-sm font-medium tracking-[0.08em] text-[--app-muted] transition-all hover:border-[--app-accent] hover:text-[--app-accent]"
            >
              {session ? "START GAME" : "SIGN IN"}
            </Link>
          </div>

        </div>
      </div>

      <div className="relative flex-1 lg:w-[58%]">
        <div className="absolute inset-0">
          <AsciiGlobe />
        </div>
      </div>
    </div>
  );
}
