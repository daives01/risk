import type { ChatHoverTag } from "@/lib/game/highlighting";
import {
  getMentionDisplayLabel,
  tokenizeChatText,
  type ChatMentionResolver,
} from "@/lib/game/chat-mentions";

interface ChatMessageTextProps {
  text: string;
  resolver: ChatMentionResolver;
  onHoverTag: (tag: ChatHoverTag) => void;
  onLeaveTag: () => void;
  onClickTag: (tag: Exclude<ChatHoverTag, null>) => void;
}

export function ChatMessageText({
  text,
  resolver,
  onHoverTag,
  onLeaveTag,
  onClickTag,
}: ChatMessageTextProps) {
  const parts = tokenizeChatText(text, resolver);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{text}</>;

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === "string") return <span key={index}>{part}</span>;
        return (
          <button
            key={`${part.token}-${index}`}
            type="button"
            data-chat-tag="true"
            className="inline rounded border border-primary/35 bg-primary/10 px-1 font-semibold not-italic text-primary underline-offset-2 transition hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => onHoverTag(part.resolved)}
            onPointerLeave={onLeaveTag}
            onFocus={() => onHoverTag(part.resolved)}
            onBlur={onLeaveTag}
            onClick={() => onClickTag(part.resolved)}
          >
            {getMentionDisplayLabel(part.token)}
          </button>
        );
      })}
    </>
  );
}
