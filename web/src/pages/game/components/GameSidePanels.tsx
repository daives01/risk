import { GameChatCard, GamePlayersCard } from "@/components/game/game-panels";
import type { ChatHoverTag, HighlightFilter } from "@/lib/game/highlighting";
import type { ChatChannel, ChatMessage, PublicState } from "@/lib/game/types";

interface GameSidePanelsProps {
  playerStats: Array<{
    playerId: string;
    territories: number;
    armies: number;
    reserveTroops: number;
    cards: number;
    status: string;
    teamId?: string;
  }>;
  resolvedDisplayState: PublicState;
  playerMap: Array<{ userId?: string; displayName: string; enginePlayerId: string | null; teamId?: string | null }>;
  graphMap: {
    territories: Record<string, { name?: string }>;
  };
  teamModeEnabled: boolean;
  teamNames: Record<string, string>;
  showTurnTimer: boolean;
  turnTimerLabel: string | null;
  highlightFilter: HighlightFilter;
  onTogglePlayerHighlight: (playerId: string) => void;
  onToggleTeamHighlight: (teamId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: Array<{ displayName: string; enginePlayerId: string | null }>) => string;
  myEnginePlayerId: string | undefined;
  canResign: boolean;
  onResign: () => void;
  delegatablePlayerId: string | null;
  delegatedPlayerId: string | null;
  onStartDelegation: (playerId: string) => void;
  onStopDelegation: () => void;
  chatMessages: ChatMessage[];
  chatChannel: ChatChannel;
  chatRecipientEnginePlayerId: string | null;
  canUseTeamChat: boolean;
  canSendChat: boolean;
  chatDraft: string;
  chatEditingMessageId: string | null;
  chatEditingChannel: ChatChannel | null;
  onSetChatDraft: (value: string) => void;
  onSelectChannel: (channel: ChatChannel, recipientEnginePlayerId?: string | null) => void;
  onToggleChannel: () => void;
  onStartEditMessage: (message: ChatMessage) => void;
  onCancelEditMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSendMessage: () => void;
  onHoverChatTag: (tag: ChatHoverTag) => void;
  onLeaveChatTag: () => void;
  onClickChatTag: (tag: Exclude<ChatHoverTag, null>) => void;
}

export function GameSidePanels({
  playerStats,
  resolvedDisplayState,
  playerMap,
  graphMap,
  teamModeEnabled,
  teamNames,
  showTurnTimer,
  turnTimerLabel,
  highlightFilter,
  onTogglePlayerHighlight,
  onToggleTeamHighlight,
  getPlayerColor,
  getPlayerName,
  myEnginePlayerId,
  canResign,
  onResign,
  delegatablePlayerId,
  delegatedPlayerId,
  onStartDelegation,
  onStopDelegation,
  chatMessages,
  chatChannel,
  chatRecipientEnginePlayerId,
  canUseTeamChat,
  canSendChat,
  chatDraft,
  chatEditingMessageId,
  chatEditingChannel,
  onSetChatDraft,
  onSelectChannel,
  onToggleChannel,
  onStartEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onSendMessage,
  onHoverChatTag,
  onLeaveChatTag,
  onClickChatTag,
}: GameSidePanelsProps) {
  return (
    <>
      <div className="min-w-0 space-y-4">
        <GamePlayersCard
          playerStats={playerStats}
          displayState={resolvedDisplayState}
          playerMap={playerMap}
          teamModeEnabled={teamModeEnabled}
          teamNames={teamNames}
          showTurnTimer={showTurnTimer}
          turnTimerLabel={turnTimerLabel}
          activeHighlight={highlightFilter}
          onTogglePlayerHighlight={onTogglePlayerHighlight}
          onToggleTeamHighlight={onToggleTeamHighlight}
          getPlayerColor={getPlayerColor}
          getPlayerName={getPlayerName}
          myPlayerId={myEnginePlayerId}
          canResign={canResign}
          onResign={onResign}
          delegatablePlayerId={delegatablePlayerId}
          delegatedPlayerId={delegatedPlayerId}
          onStartDelegation={onStartDelegation}
          onStopDelegation={onStopDelegation}
        />
      </div>
      <div className="min-w-0 xl:order-last">
        <GameChatCard
          messages={chatMessages}
          activeChannel={chatChannel}
          activeRecipientEnginePlayerId={chatRecipientEnginePlayerId}
          playerOptions={playerMap}
          teamNames={teamNames}
          graphMap={graphMap}
          myEnginePlayerId={myEnginePlayerId}
          teamGameEnabled={teamModeEnabled}
          teamAvailable={canUseTeamChat}
          canSend={canSendChat}
          draftText={chatDraft}
          editingMessageId={chatEditingMessageId}
          editingChannel={chatEditingChannel}
          onSetDraftText={onSetChatDraft}
          onSelectChannel={onSelectChannel}
          onToggleChannel={onToggleChannel}
          onStartEditMessage={onStartEditMessage}
          onCancelEditMessage={onCancelEditMessage}
          onDeleteMessage={onDeleteMessage}
          onSend={onSendMessage}
          onHoverTag={onHoverChatTag}
          onLeaveTag={onLeaveChatTag}
          onClickTag={onClickChatTag}
        />
      </div>
    </>
  );
}
