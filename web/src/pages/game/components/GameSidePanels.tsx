import { GameChatCard, GamePlayersCard } from "@/components/game/game-panels";
import type { ChatMentionMap } from "@/lib/game/chat-mentions";
import type { ChatHoverTag, HighlightFilter } from "@/lib/game/highlighting";
import type { PlayerPanelStats } from "@/lib/game/player-stats";
import type { ChatChannel, ChatMessage, HandCard, PlayerRef, PublicState } from "@/lib/game/types";

interface GameSidePanelsProps {
  playerStats: PlayerPanelStats[];
  resolvedDisplayState: PublicState;
  playerMap: PlayerRef[];
  graphMap: ChatMentionMap;
  teamModeEnabled: boolean;
  teamNames: Record<string, string>;
  showTurnTimer: boolean;
  turnTimerLabel: string | null;
  highlightFilter: HighlightFilter;
  onTogglePlayerHighlight: (playerId: string) => void;
  onToggleTeamHighlight: (teamId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: PlayerRef[]) => string;
  myEnginePlayerId: string | undefined;
  teammateHands: Record<string, HandCard[]> | null;
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
  teammateHands,
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
          teammateHands={teammateHands}
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
