import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border bg-background/75 p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-primary">{title}</p>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
      <summary className="cursor-pointer list-none font-medium text-foreground transition hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="inline-block text-[10px] text-muted-foreground transition-transform group-open:rotate-90">▶</span>
          {q}
        </span>
      </summary>
      <div className="mt-1.5 space-y-1 pl-[18px]">{children}</div>
    </details>
  );
}

export default function FaqPage() {
  const navigate = useNavigate();

  return (
    <div className="page-shell soft-grid">
      <div className="page-container mx-auto max-w-4xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="space-y-4 py-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="size-4" />
              </Button>
              <CardTitle className="hero-title">
                <span className="text-primary">FAQ &amp; How to Play</span>
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
            <Section title="Basics">
              <Q q="What is this game?">
                <p>
                  Legally Distinct Global Domination is an online multiplayer strategy game inspired
                  by classic Risk. Conquer territories, collect cards, and eliminate opponents to
                  achieve world domination — or at least your team&apos;s version of it.
                </p>
              </Q>
              <Q q="How do I start a game?">
                <p>
                  From the home page, click <strong>Create game</strong> to set up a new lobby. Share
                  the invite code with friends, or make it public so others can join. Once everyone is
                  ready, the host starts the game.
                </p>
              </Q>
              <Q q="How many players can play?">
                <p>
                  Games support 2–6 players. Fewer players means more starting troops per person;
                  more players means tighter competition for continents.
                </p>
              </Q>
            </Section>

            <Section title="Turn Structure">
              <Q q="What happens on my turn?">
                <p>Each turn has three phases:</p>
                <ol className="list-inside list-decimal space-y-1 pl-2">
                  <li>
                    <strong>Reinforce</strong> — Place new troops on territories you control.
                  </li>
                  <li>
                    <strong>Attack</strong> — Invade adjacent enemy territories using dice combat.
                  </li>
                  <li>
                    <strong>Fortify</strong> — Move troops between your connected territories.
                  </li>
                </ol>
              </Q>
              <Q q="How are reinforcements calculated?">
                <p>
                  You receive the greater of <strong>3 troops</strong> or{" "}
                  <strong>⌊territories owned ÷ 3⌋</strong> each turn. On top of that, controlling
                  every territory in a continent awards that continent&apos;s bonus.
                </p>
              </Q>
            </Section>

            <Section title="Combat">
              <Q q="How does attacking work?">
                <p>
                  The attacker rolls up to <strong>3 dice</strong> (must have at least one more troop
                  than dice used). The defender rolls up to <strong>2 dice</strong>. Highest dice are
                  compared pair by pair — ties go to the defender. Losers remove one troop per lost
                  comparison.
                </p>
              </Q>
              <Q q="Can I choose how many dice to roll?">
                <p>
                  Yes — attackers can choose to roll 1, 2, or 3 dice (troop count permitting). The
                  defender always rolls the maximum allowed.
                </p>
              </Q>
            </Section>

            <Section title="Cards &amp; Trading">
              <Q q="How do I earn cards?">
                <p>
                  Capture at least one territory during your turn to receive a card at the end of
                  your turn. You only get one card per turn regardless of how many territories you
                  capture.
                </p>
              </Q>
              <Q q="How does card trading work?">
                <p>
                  Trade a set of 3 cards for bonus troops. Valid sets are{" "}
                  <strong>three of a kind</strong> or <strong>one of each type</strong>.
                  Wilds can substitute for any type. If you hold <strong>5 or more cards</strong>,
                  you must trade before reinforcing.
                </p>
              </Q>
              <Q q="What are the trade-in values?">
                <p>
                  Trade values escalate with each trade: <strong>4, 6, 8, 10, 12, 15</strong>, then
                  +5 for every subsequent trade (20, 25, 30…). These values are shared across all
                  players — the Nth trade globally uses the Nth value.
                </p>
              </Q>
              <Q q="What is the territory bonus on trade-in?">
                <p>
                  If one of your traded cards matches a territory you currently own, you receive an
                  extra <strong>2 bonus troops</strong> placed on that territory.
                </p>
              </Q>
            </Section>

            <Section title="Fortifying">
              <Q q="How does fortifying work?">
                <p>
                  At the end of your turn you can move troops between your territories. By default,
                  you can fortify between any two <strong>connected</strong> territories (not just
                  adjacent) and make multiple moves per turn. At least 1 troop must remain on
                  the source territory.
                </p>
              </Q>
            </Section>

            <Section title="Teams">
              <Q q="How do teams work?">
                <p>
                  When teams are enabled, you cannot attack your teammates. The win condition is{" "}
                  <strong>last team standing</strong> — your team wins when all opposing teams are
                  eliminated.
                </p>
              </Q>
              <Q q="Can I help my teammates?">
                <p>
                  Depending on game settings, you may be able to{" "}
                  <strong>place reinforcements on teammate territories</strong> and{" "}
                  <strong>fortify troops to or through teammate territories</strong>. Check the lobby
                  rules panel to see which options are enabled.
                </p>
              </Q>
              <Q q="How do continent bonuses work with teams?">
                <p>
                  When a team controls every territory in a continent, the bonus goes to the{" "}
                  <strong>majority holder</strong> — the teammate who owns the most territories in
                  that continent. If tied, the player earlier in <strong>turn order</strong> wins
                  the tiebreak. Only one player receives the full bonus; it is not split.
                </p>
                <p>
                  Alternatively, the game host can set continent bonuses to{" "}
                  <strong>individual mode</strong>, where each player only earns bonuses for
                  continents they personally control (all territories), regardless of teammates.
                </p>
              </Q>
              <Q q="How is turn order determined in team games?">
                <p>
                  Team games use <strong>interleaved turn order</strong> — players from different
                  teams alternate so no team gets consecutive turns. Within each team, order is
                  randomized. This ensures fair pacing across teams.
                </p>
              </Q>
            </Section>

            <Section title="Setup &amp; Map">
              <Q q="How are territories distributed?">
                <p>
                  Territories are distributed via <strong>round-robin</strong> assignment by default,
                  ensuring even distribution. Some maps include{" "}
                  <strong>neutral territories</strong> (unowned at start) that must be conquered
                  during the game.
                </p>
              </Q>
            </Section>

            <Section title="Other">
              <Q q="What are keyboard shortcuts?">
                <p>
                  Many actions have keyboard shortcuts shown as small badges in the UI. During
                  gameplay, safe actions use single keys while phase-ending or destructive actions
                  require a <strong>Cmd/Ctrl</strong> modifier to prevent accidents.
                </p>
              </Q>
              <Q q="Is there email notifications?">
                <p>
                  Yes — enable &quot;Email me when it&apos;s my turn&quot; in your account settings
                  to receive turn notifications.
                </p>
              </Q>
            </Section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
