import { useEffect } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { AsciiGlobe } from "@/pages/landing/AsciiGlobe";

export default function LandingPage() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    document.title = "Legally Distinct Global Domination";

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  return (
    <div className="soft-grid fixed inset-0 isolate flex h-dvh max-h-dvh flex-col overflow-hidden bg-[--app-bg] overscroll-none landscape:flex-row">
      <div className="pointer-events-none relative z-10 order-2 flex flex-1 flex-col justify-start px-6 pb-8 pt-0 portrait:-mt-[6svh] sm:px-8 landscape:order-1 landscape:min-h-dvh landscape:w-[44%] landscape:justify-center landscape:px-10 landscape:py-0 lg:landscape:px-16">
        <div className="mx-auto w-full max-w-[25rem] text-center landscape:mx-0 landscape:max-w-[35rem] landscape:text-left">
          <h1 className="text-[clamp(2.55rem,11vw,4.75rem)] font-bold leading-[0.94] tracking-[0.015em] text-primary text-balance landscape:text-[clamp(2.5rem,5.8vw,5.8rem)]">
            Legally Distinct
            <br />
            Global Domination
          </h1>

          <p className="mx-auto mt-6 max-w-[20rem] text-sm leading-[1.65] text-[--app-text]/80 text-pretty landscape:mx-0 landscape:max-w-[30rem] landscape:text-base">
            Command armies, forge alliances, and conquer every territory in
            this classic game of global strategy. Play with your coworkers with
            async turns.
          </p>

          <div className="pointer-events-auto fixed right-4 top-4 z-20 mt-0 landscape:static landscape:mt-8">
            <Link
              to={session ? "/home" : "/login"}
              className="inline-flex h-12 w-32 items-center justify-center border border-[--app-accent] bg-[--app-accent] px-7 text-sm font-semibold tracking-[0.08em] text-[--app-bg] shadow-[0_10px_30px_rgba(11,13,16,0.35)] transition-all hover:brightness-110"
            >
              {session ? "LAUNCH" : "LOG IN"}
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-0 order-1 flex h-[58svh] min-h-[18rem] justify-center overflow-visible portrait:-mt-[2svh] sm:min-h-[22rem] landscape:order-2 landscape:h-auto landscape:min-h-dvh landscape:flex-1 landscape:w-[56%]">
        <div className="relative h-full w-[min(132vw,44rem)] landscape:absolute landscape:inset-y-0 landscape:right-0 landscape:w-[min(68vw,78rem)]">
          <AsciiGlobe />
        </div>
      </div>
    </div>
  );
}
