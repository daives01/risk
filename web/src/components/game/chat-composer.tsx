import { ArrowUp, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createComposerCaretSpacer,
  createComposerMentionNode,
  getComposerCursor,
  serializeComposerNode,
  setComposerCursor,
} from "@/components/game/chat-composer-dom";
import {
  findActiveChatEmojiQuery,
  findChatEmojiMatches,
  type ChatEmojiOption,
} from "@/lib/game/chat-emoji";
import {
  findActiveChatMentionQuery,
  getMentionDisplayLabel,
  tokenizeChatText,
  type ChatMentionOption,
  type ChatMentionResolver,
} from "@/lib/game/chat-mentions";
import {
  buildChatTargetOptions,
  findChatTargetOptionMatches,
  getChatTargetSelectValue,
} from "@/lib/game/chat-targets";
import type { ChatChannel, PlayerRef } from "@/lib/game/types";

interface ChatComposerProps {
  activeChannel: ChatChannel;
  activeRecipientEnginePlayerId: string | null;
  playerOptions: PlayerRef[];
  myEnginePlayerId?: string | null;
  teamGameEnabled: boolean;
  teamAvailable: boolean;
  canSend: boolean;
  draftText: string;
  editingMessageId: string | null;
  editingChannel: ChatChannel | null;
  mentionResolver: ChatMentionResolver;
  onSetDraftText: (value: string) => void;
  onSelectChannel: (channel: ChatChannel, recipientEnginePlayerId?: string | null) => void;
  onToggleChannel: () => void;
  onCancelEditMessage: () => void;
  onSend: () => void;
}

export function ChatComposer({
  activeChannel,
  activeRecipientEnginePlayerId,
  playerOptions,
  myEnginePlayerId,
  teamGameEnabled,
  teamAvailable,
  canSend,
  draftText,
  editingMessageId,
  editingChannel,
  mentionResolver,
  onSetDraftText,
  onSelectChannel,
  onToggleChannel,
  onCancelEditMessage,
  onSend,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const [emojiSelectionIndex, setEmojiSelectionIndex] = useState(0);
  const [draftCursor, setDraftCursor] = useState(draftText.length);

  const currentInputChannel = editingChannel ?? activeChannel;
  const dmTarget = currentInputChannel === "dm"
    ? playerOptions.find((player) => player.enginePlayerId === activeRecipientEnginePlayerId) ?? null
    : null;
  const chatTargetOptions = useMemo(() => buildChatTargetOptions({
    players: playerOptions,
    myEnginePlayerId,
    teamGameEnabled,
    teamAvailable,
  }), [myEnginePlayerId, playerOptions, teamAvailable, teamGameEnabled]);
  const dmTargetOptions = useMemo(
    () => chatTargetOptions.filter((option) => option.channel === "dm"),
    [chatTargetOptions],
  );
  const targetLabel = currentInputChannel === "dm" && dmTarget
    ? `${dmTarget.displayName}:`
    : currentInputChannel === "team" && teamAvailable
      ? "Team:"
      : "All:";
  const isSpecialInputTarget = currentInputChannel === "team" || currentInputChannel === "dm";
  const selectValue = getChatTargetSelectValue(activeChannel, activeRecipientEnginePlayerId);
  const canSubmitToSelectedTarget = activeChannel !== "dm" || !!activeRecipientEnginePlayerId;
  const slashToken = !editingMessageId && draftText.startsWith("/") && !/\s/.test(draftText)
    ? draftText.slice(1).toLowerCase()
    : null;
  const slashMatches = useMemo(
    () => findChatTargetOptionMatches(chatTargetOptions, slashToken),
    [chatTargetOptions, slashToken],
  );
  const showSlashMenu = slashMatches.length > 0 && slashToken !== null;
  const selectedSlashOption = slashMatches[Math.min(slashSelectionIndex, Math.max(0, slashMatches.length - 1))] ?? null;
  const activeMentionQuery = useMemo(
    () => findActiveChatMentionQuery(draftText, draftCursor, editingMessageId),
    [draftCursor, draftText, editingMessageId],
  );
  const mentionMatches = useMemo(() => {
    if (!activeMentionQuery || !activeMentionQuery.normalizedQuery) return [];
    return mentionResolver.options
      .filter((option) => option.searchText.includes(activeMentionQuery.normalizedQuery))
      .slice(0, 12);
  }, [activeMentionQuery, mentionResolver]);
  const showMentionMenu = mentionMatches.length > 0 && !!activeMentionQuery;
  const selectedMentionOption =
    mentionMatches[Math.min(mentionSelectionIndex, Math.max(0, mentionMatches.length - 1))] ?? null;
  const activeEmojiQuery = useMemo(
    () => findActiveChatEmojiQuery(draftText, draftCursor, editingMessageId),
    [draftCursor, draftText, editingMessageId],
  );
  const emojiMatches = useMemo(
    () => findChatEmojiMatches(activeEmojiQuery),
    [activeEmojiQuery],
  );
  const showEmojiMenu = emojiMatches.length > 0 && !!activeEmojiQuery && !showMentionMenu;
  const selectedEmojiOption =
    emojiMatches[Math.min(emojiSelectionIndex, Math.max(0, emojiMatches.length - 1))] ?? null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  const applyChatTargetOption = (option: { channel: ChatChannel; recipientEnginePlayerId: string | null }) => {
    onSelectChannel(option.channel, option.recipientEnginePlayerId);
    onSetDraftText("");
    setSlashSelectionIndex(0);
  };

  const completeSlashOption = (option: { command: string }) => {
    onSetDraftText(`/${option.command}`);
    setSlashSelectionIndex(0);
  };

  const renderComposerDraft = useCallback((text: string, cursorOffset = text.length) => {
    const input = inputRef.current;
    if (!input) return;
    input.replaceChildren();
    for (const part of tokenizeChatText(text, mentionResolver)) {
      if (typeof part === "string") {
        input.append(document.createTextNode(part));
        continue;
      }
      input.append(createComposerCaretSpacer());
      input.append(createComposerMentionNode(part.token, getMentionDisplayLabel(part.token)));
      input.append(createComposerCaretSpacer());
    }
    setComposerCursor(input, cursorOffset);
  }, [mentionResolver]);

  const applyMentionOption = (option: ChatMentionOption) => {
    if (!activeMentionQuery) return;
    const nextText = `${draftText.slice(0, activeMentionQuery.tokenStart)}${option.token} ${draftText.slice(activeMentionQuery.cursor)}`;
    const nextCursor = activeMentionQuery.tokenStart + option.token.length + 1;
    onSetDraftText(nextText);
    setMentionSelectionIndex(0);
    setDraftCursor(nextCursor);
    window.requestAnimationFrame(() => {
      renderComposerDraft(nextText, nextCursor);
      inputRef.current?.focus();
    });
  };

  const applyEmojiOption = (option: ChatEmojiOption) => {
    if (!activeEmojiQuery) return;
    const nextText = `${draftText.slice(0, activeEmojiQuery.tokenStart)}${option.unicode} ${
      draftText.slice(activeEmojiQuery.cursor)
    }`;
    const nextCursor = activeEmojiQuery.tokenStart + option.unicode.length + 1;
    onSetDraftText(nextText);
    setEmojiSelectionIndex(0);
    setDraftCursor(nextCursor);
    window.requestAnimationFrame(() => {
      renderComposerDraft(nextText, nextCursor);
      inputRef.current?.focus();
    });
  };

  const syncDraftFromComposer = (input: HTMLDivElement) => {
    const nextText = serializeComposerNode(input);
    if (!nextText) {
      input.replaceChildren();
    }
    setDraftCursor(getComposerCursor(input));
    onSetDraftText(nextText);
  };

  const updateDraftCursorFromInput = (input: HTMLDivElement) => {
    setDraftCursor(getComposerCursor(input));
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" && draftCursor > 0) {
      const selection = window.getSelection();
      const input = inputRef.current;
      if (selection && input && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const previousElement =
          range.startContainer === input && range.startOffset > 0
            ? input.childNodes[range.startOffset - 1]
            : null;
        if (previousElement instanceof HTMLElement && previousElement.dataset.mentionToken) {
          event.preventDefault();
          previousElement.remove();
          syncDraftFromComposer(input);
          return;
        }
      }
      const beforeCursor = draftText.slice(0, draftCursor);
      const afterCursor = draftText.slice(draftCursor);
      const mentionAtCursor = /@\[([^\]\n]{1,80})\]\s?$/.exec(beforeCursor);
      if (mentionAtCursor) {
        event.preventDefault();
        const nextCursor = beforeCursor.length - mentionAtCursor[0].length;
        const nextText = `${draftText.slice(0, nextCursor)}${afterCursor}`;
        onSetDraftText(nextText);
        setDraftCursor(nextCursor);
        window.requestAnimationFrame(() => {
          renderComposerDraft(nextText, nextCursor);
          inputRef.current?.focus();
        });
        return;
      }
    }
    if (showMentionMenu && event.key === "ArrowDown") {
      event.preventDefault();
      setMentionSelectionIndex((index) => (index + 1) % mentionMatches.length);
      return;
    }
    if (showMentionMenu && event.key === "ArrowUp") {
      event.preventDefault();
      setMentionSelectionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
      return;
    }
    if (showMentionMenu && event.key === "Tab") {
      event.preventDefault();
      if (mentionMatches.length > 1) {
        setMentionSelectionIndex((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (selectedMentionOption) applyMentionOption(selectedMentionOption);
      return;
    }
    if (showMentionMenu && (event.key === "Enter" || event.key === " ") && selectedMentionOption) {
      event.preventDefault();
      applyMentionOption(selectedMentionOption);
      return;
    }
    if (showEmojiMenu && event.key === "ArrowDown") {
      event.preventDefault();
      setEmojiSelectionIndex((index) => (index + 1) % emojiMatches.length);
      return;
    }
    if (showEmojiMenu && event.key === "ArrowUp") {
      event.preventDefault();
      setEmojiSelectionIndex((index) => (index - 1 + emojiMatches.length) % emojiMatches.length);
      return;
    }
    if (showEmojiMenu && event.key === "Tab") {
      event.preventDefault();
      if (emojiMatches.length > 1) {
        setEmojiSelectionIndex((index) => (index + 1) % emojiMatches.length);
        return;
      }
      if (selectedEmojiOption) applyEmojiOption(selectedEmojiOption);
      return;
    }
    if (showEmojiMenu && (event.key === "Enter" || event.key === " ") && selectedEmojiOption) {
      event.preventDefault();
      applyEmojiOption(selectedEmojiOption);
      return;
    }
    if (showSlashMenu && event.key === "ArrowDown") {
      event.preventDefault();
      setSlashSelectionIndex((index) => (index + 1) % slashMatches.length);
      return;
    }
    if (showSlashMenu && event.key === "ArrowUp") {
      event.preventDefault();
      setSlashSelectionIndex((index) => (index - 1 + slashMatches.length) % slashMatches.length);
      return;
    }
    if (showSlashMenu && event.key === "Tab" && selectedSlashOption) {
      event.preventDefault();
      if (slashMatches.length > 1) {
        setSlashSelectionIndex((index) => (index + 1) % slashMatches.length);
        return;
      }
      completeSlashOption(selectedSlashOption);
      return;
    }
    if (showSlashMenu && (event.key === " " || event.key === "Enter") && selectedSlashOption) {
      const exactMatch = selectedSlashOption.command === slashToken ||
        selectedSlashOption.aliases?.includes(slashToken ?? "");
      event.preventDefault();
      if (exactMatch || slashMatches.length === 1 || event.key === "Enter") {
        applyChatTargetOption(selectedSlashOption);
        return;
      }
      completeSlashOption(selectedSlashOption);
      return;
    }
    if (event.key === "Tab" && teamAvailable && !editingMessageId && !event.shiftKey) {
      event.preventDefault();
      onToggleChannel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (serializeComposerNode(input) === draftText) return;
    renderComposerDraft(draftText, draftText.length);
  }, [draftText, renderComposerDraft]);

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        {showSlashMenu && (
          <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-20 w-[min(22rem,100%)] border border-border/80 bg-popover p-1 text-xs text-popover-foreground shadow-md">
            {slashMatches.map((option, index) => {
              const isSelected = index === Math.min(slashSelectionIndex, slashMatches.length - 1);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`flex w-full items-center justify-between px-2 py-1.5 text-left outline-none ${
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyChatTargetOption(option);
                  }}
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-[0.7rem] text-muted-foreground">/{option.command}</span>
                </button>
              );
            })}
          </div>
        )}
        {showMentionMenu && activeMentionQuery && (
          <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-20 max-h-64 w-[min(24rem,100%)] overflow-y-auto border border-border/80 bg-popover p-1 text-xs text-popover-foreground shadow-md game-scrollbar">
            {mentionMatches.map((option, index) => {
              const isSelected = index === Math.min(mentionSelectionIndex, mentionMatches.length - 1);
              const kindLabel =
                option.resolved.kind === "player"
                  ? "player"
                  : option.resolved.kind === "team"
                    ? "team"
                    : "territory";
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left outline-none ${
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyMentionOption(option);
                  }}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">{kindLabel}</span>
                </button>
              );
            })}
          </div>
        )}
        {showEmojiMenu && activeEmojiQuery && (
          <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-20 max-h-64 w-[min(22rem,100%)] overflow-y-auto border border-border/80 bg-popover p-1 text-xs text-popover-foreground shadow-md game-scrollbar">
            {emojiMatches.map((option, index) => {
              const isSelected = index === Math.min(emojiSelectionIndex, emojiMatches.length - 1);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left outline-none ${
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyEmojiOption(option);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-base leading-none">{option.unicode}</span>
                    <span className="min-w-0 truncate">:{option.shortcode}:</span>
                  </span>
                  <span className="shrink-0 truncate text-[0.7rem] text-muted-foreground">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {canSend && !editingMessageId ? (
          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value.startsWith("dm:")) {
                onSelectChannel("dm", value.slice("dm:".length));
                return;
              }
              onSelectChannel(value as ChatChannel, null);
            }}
          >
            <SelectTrigger
              aria-label="Chat target"
              className={`h-9 w-auto shrink-0 justify-start gap-1 border-0 bg-transparent px-0.5 text-xs font-semibold shadow-none hover:bg-background/35 focus-visible:ring-1 [&>svg]:order-first [&>svg]:size-3 ${
                activeChannel === "team" ? "text-amber-400 [&>svg]:text-amber-400" : ""
              } ${
                activeChannel === "dm" ? "text-amber-400 [&>svg]:text-amber-400" : ""
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="min-w-[11rem]">
              <SelectItem value="all">All:</SelectItem>
              {teamGameEnabled && teamAvailable && (
                <SelectItem value="team" className="text-amber-400 focus:text-amber-300">Team:</SelectItem>
              )}
              {dmTargetOptions.map((option) => option.recipientEnginePlayerId ? (
                <SelectItem
                  key={option.key}
                  value={`dm:${option.recipientEnginePlayerId}`}
                  className="text-amber-400 focus:text-amber-300"
                >
                  {option.label}
                </SelectItem>
              ) : null)}
            </SelectContent>
          </Select>
        ) : (
          <div
            className={`flex h-9 w-auto shrink-0 items-center truncate px-0.5 text-xs font-semibold ${
              isSpecialInputTarget ? "text-amber-400" : "text-muted-foreground"
            }`}
          >
            {targetLabel}
          </div>
        )}
        <div
          ref={inputRef}
          role="textbox"
          aria-label="Chat message"
          aria-disabled={!canSend}
          contentEditable={canSend}
          suppressContentEditableWarning
          data-placeholder={
            canSend
              ? editingMessageId
                ? "Edit your message and press Enter..."
                : "Send a message..."
              : "Chat is read-only"
          }
          className={`relative flex h-9 min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-pre-wrap break-words rounded-none border border-input bg-transparent px-3 py-1 text-base leading-5 shadow-xs outline-none transition-[color,box-shadow] [scrollbar-width:none] empty:before:pointer-events-none empty:before:leading-5 empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus-visible:border-input focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 md:text-sm [&::-webkit-scrollbar]:hidden ${
            isSpecialInputTarget ? "text-amber-400 empty:before:text-amber-400/55" : ""
          }`}
          onInput={(event) => {
            setSlashSelectionIndex(0);
            setMentionSelectionIndex(0);
            setEmojiSelectionIndex(0);
            syncDraftFromComposer(event.currentTarget);
          }}
          onClick={(event) => updateDraftCursorFromInput(event.currentTarget)}
          onKeyUp={(event) => updateDraftCursorFromInput(event.currentTarget)}
          onSelect={(event) => updateDraftCursorFromInput(event.currentTarget)}
          onKeyDown={handleInputKeyDown}
        />
      </div>
      {editingMessageId && (
        <Button type="button" size="icon" variant="outline" disabled={!canSend} onClick={onCancelEditMessage}>
          <X className="size-3.5" />
        </Button>
      )}
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        aria-label={editingMessageId ? "Save message edit" : "Send message"}
        title={editingMessageId ? "Save edit" : "Send message"}
        className={`h-9 w-8 border border-transparent bg-transparent text-muted-foreground shadow-none hover:border-border/70 hover:bg-background/45 hover:text-foreground focus-visible:border-input focus-visible:ring-0 disabled:opacity-30 ${
          isSpecialInputTarget ? "text-amber-400 hover:text-amber-300" : ""
        } ${
          editingMessageId ? "border-amber-500/35 text-amber-400 hover:border-amber-500/60 hover:text-amber-300" : ""
        }`}
        disabled={!canSend || !canSubmitToSelectedTarget || !draftText.trim()}
      >
        {editingMessageId ? <Check className="size-3.5" /> : <ArrowUp className="size-4" />}
      </Button>
    </form>
  );
}
