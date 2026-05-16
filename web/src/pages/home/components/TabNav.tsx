import { ShortcutHint } from "@/components/ui/shortcut-hint";
import type { HomeTab } from "../types";

type TabNavProps = {
  tab: HomeTab;
  setTab: (tab: HomeTab) => void;
};

const TABS: { key: HomeTab; label: string; shortcut: string }[] = [
  { key: "home", label: "Home", shortcut: "1" },
  { key: "archive", label: "Archive", shortcut: "2" },
  { key: "account", label: "Account", shortcut: "3" },
];

export function TabNav({ tab, setTab }: TabNavProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {TABS.map(({ key, label, shortcut }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
            tab === key
              ? "border-primary bg-primary/12 text-primary"
              : "border-border/75 bg-background/70 hover:border-primary/45"
          }`}
        >
          <span>{label}</span>
          <ShortcutHint shortcut={shortcut} />
        </button>
      ))}
    </div>
  );
}
