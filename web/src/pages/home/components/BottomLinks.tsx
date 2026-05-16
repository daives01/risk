import { useNavigate } from "react-router-dom";

export function BottomLinks() {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-4 left-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => navigate("/faq")}
        className="text-xs font-medium text-muted-foreground/60 transition hover:text-muted-foreground"
      >
        FAQ
      </button>
      <span className="text-muted-foreground/30">·</span>
      <a
        href="https://buymeacoffee.com/danielives"
        target="_blank"
        rel="noreferrer"
        className="text-xs font-medium text-muted-foreground/60 transition hover:text-muted-foreground"
      >
        Support the dev
      </a>
    </div>
  );
}
