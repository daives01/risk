import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatComposer } from "@/components/game/chat-composer";
import { ChatMessageText } from "@/components/game/chat-message-text";
import {
  buildChatMentionResolver,
  type ChatMentionMap,
} from "@/lib/game/chat-mentions";
import type { ChatHoverTag } from "@/lib/game/highlighting";
import type { ChatChannel, ChatMessage, PlayerRef } from "@/lib/game/types";

interface GameChatCardProps {
  messages: ChatMessage[];
  activeChannel: ChatChannel;
  activeRecipientEnginePlayerId: string | null;
  playerOptions: PlayerRef[];
  teamNames: Record<string, string>;
  graphMap: ChatMentionMap;
  myEnginePlayerId?: string | null;
  teamGameEnabled: boolean;
  teamAvailable: boolean;
  canSend: boolean;
  draftText: string;
  editingMessageId: string | null;
  editingChannel: ChatChannel | null;
  onSetDraftText: (value: string) => void;
  onSelectChannel: (channel: ChatChannel, recipientEnginePlayerId?: string | null) => void;
  onToggleChannel: () => void;
  onStartEditMessage: (message: ChatMessage) => void;
  onCancelEditMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: () => void;
  onHoverTag: (tag: ChatHoverTag) => void;
  onLeaveTag: () => void;
  onClickTag: (tag: Exclude<ChatHoverTag, null>) => void;
}

function formatChatTimestamp(timestamp: number, today: Date) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  if (date.toDateString() !== today.toDateString()) {
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    });
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GameChatCard({
  messages,
  activeChannel,
  activeRecipientEnginePlayerId,
  playerOptions,
  teamNames,
  graphMap,
  myEnginePlayerId,
  teamGameEnabled,
  teamAvailable,
  canSend,
  draftText,
  editingMessageId,
  editingChannel,
  onSetDraftText,
  onSelectChannel,
  onToggleChannel,
  onStartEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onSend,
  onHoverTag,
  onLeaveTag,
  onClickTag,
}: GameChatCardProps) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const messagesWithTimestamps = useMemo(() => {
    const today = new Date();
    return messages.map((message) => ({
      ...message,
      timestampLabel: formatChatTimestamp(message.createdAt, today),
    }));
  }, [messages]);

  const chatMentionResolver = useMemo(
    () => buildChatMentionResolver(playerOptions, teamNames, graphMap),
    [graphMap, playerOptions, teamNames],
  );

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  return (
    <Card className="glass-panel h-[min(30rem,50vh)] gap-2 border-0 py-0 xl:h-[min(34rem,50vh)]">
      <CardHeader className="flex flex-row items-center gap-2 pb-0 pt-3">
        <CardTitle className="text-base">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-3rem)] flex-col space-y-1.5 pb-3 pt-0">
        <div
          ref={messagesContainerRef}
          className="game-scrollbar flex-1 overflow-y-auto px-0.5 py-2 font-mono text-[0.8125rem] leading-snug"
        >
          <div className="mt-auto space-y-1">
            {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
            {messagesWithTimestamps.map((message) => {
              const timestampLabel = message.timestampLabel;
              const isTeamMessage = message.channel === "team";
              const isDmMessage = message.channel === "dm";
              const isSpecialMessage = isTeamMessage || isDmMessage;
              const displaySender = message.isMine ? "You" : message.senderDisplayName;
              const scopeLabel = isTeamMessage
                ? "[team]"
                : isDmMessage
                  ? message.isMine
                    ? `[to ${message.recipientDisplayName ?? "player"}]`
                    : "[to you]"
                  : null;

              return (
                <div
                  key={message._id}
                  className={`group relative text-left ${
                    isSpecialMessage ? "text-amber-400" : "text-foreground"
                  }`}
                >
                  {message.isMine && canSend && (
                    <span className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-0.5 bg-background/95 pr-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={editingMessageId === message._id ? "default" : "ghost"}
                        aria-label="Edit message"
                        onClick={() => onStartEditMessage(message)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Delete message"
                        onClick={() => onDeleteMessage(message._id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </span>
                  )}
                  <p className="break-normal [overflow-wrap:anywhere]">
                    {timestampLabel ? <span className="inline-block w-[4.75rem]">{timestampLabel}</span> : null}
                    {scopeLabel ? <>{scopeLabel} </> : null}
                    <span className="font-semibold">{displaySender}:</span>{" "}
                    <ChatMessageText
                      text={message.text}
                      resolver={chatMentionResolver}
                      onHoverTag={onHoverTag}
                      onLeaveTag={onLeaveTag}
                      onClickTag={onClickTag}
                    />
                    {message.editedAt ? <span className="ml-1 text-[0.72rem] text-muted-foreground">(edited)</span> : null}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <ChatComposer
          activeChannel={activeChannel}
          activeRecipientEnginePlayerId={activeRecipientEnginePlayerId}
          playerOptions={playerOptions}
          myEnginePlayerId={myEnginePlayerId}
          teamGameEnabled={teamGameEnabled}
          teamAvailable={teamAvailable}
          canSend={canSend}
          draftText={draftText}
          editingMessageId={editingMessageId}
          editingChannel={editingChannel}
          mentionResolver={chatMentionResolver}
          onSetDraftText={onSetDraftText}
          onSelectChannel={onSelectChannel}
          onToggleChannel={onToggleChannel}
          onCancelEditMessage={onCancelEditMessage}
          onSend={onSend}
        />
      </CardContent>
    </Card>
  );
}
