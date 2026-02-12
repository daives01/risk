import { GameChatCard, GamePlayersCard } from "@/components/game/game-panels";
import type { HighlightFilter } from "@/lib/game/highlighting";
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
  playerMap: Array<{ displayName: string; enginePlayerId: string | null }>;
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
  chatMessages: ChatMessage[];
  chatChannel: ChatChannel;
  canUseTeamChat: boolean;
  myTeamName: string | null;
  canSendChat: boolean;
  chatDraft: string;
  chatEditingMessageId: string | null;
  onSetChatDraft: (value: string) => void;
  onSelectChannel: (channel: ChatChannel) => void;
  onStartEditMessage: (message: ChatMessage) => void;
  onCancelEditMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSendMessage: () => void;
}

export function GameSidePanels({
  playerStats,
  resolvedDisplayState,
  playerMap,
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
  chatMessages,
  chatChannel,
  canUseTeamChat,
  myTeamName,
  canSendChat,
  chatDraft,
  chatEditingMessageId,
  onSetChatDraft,
  onSelectChannel,
  onStartEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onSendMessage,
}: GameSidePanelsProps) {
  return (
    <>
      <div className="space-y-4">
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
        />
      </div>
      <div className="xl:order-last">
        <GameChatCard
          messages={chatMessages}
          activeChannel={chatChannel}
          teamGameEnabled={teamModeEnabled}
          teamAvailable={canUseTeamChat}
          activeTeamName={myTeamName}
          canSend={canSendChat}
          draftText={chatDraft}
          editingMessageId={chatEditingMessageId}
          onSetDraftText={onSetChatDraft}
          onSelectChannel={onSelectChannel}
          onStartEditMessage={onStartEditMessage}
          onCancelEditMessage={onCancelEditMessage}
          onDeleteMessage={onDeleteMessage}
          onSend={onSendMessage}
        />
      </div>
    </>
  );
}
