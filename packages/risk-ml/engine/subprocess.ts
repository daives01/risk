import * as readline from "node:readline";
import {
  ActionError,
  applyAction,
  defaultRuleset,
  getLegalActions,
  type Action,
  type GameState,
  type PlayerId,
} from "risk-engine";
import { classicMap } from "risk-maps";
import { createInitialState } from "./create_initial_state.js";

type CreateGameRequest = {
  readonly cmd: "createGame";
  readonly numPlayers: number;
  readonly seed: string | number;
};

type GetLegalActionsRequest = {
  readonly cmd: "getLegalActions";
  readonly state: GameState;
};

type ApplyActionRequest = {
  readonly cmd: "applyAction";
  readonly state: GameState;
  readonly playerId: string;
  readonly action: Action;
};

type GetStaticInfoRequest = {
  readonly cmd: "getStaticInfo";
};

type Request =
  | CreateGameRequest
  | GetLegalActionsRequest
  | ApplyActionRequest
  | GetStaticInfoRequest;

function writeResponse(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function handleRequest(request: Request): unknown {
  switch (request.cmd) {
    case "createGame": {
      const state = createInitialState(
        classicMap,
        defaultRuleset,
        request.numPlayers,
        request.seed,
      );
      return { state };
    }

    case "getLegalActions": {
      const legalActions = getLegalActions(request.state, {
        map: classicMap,
        combat: defaultRuleset.combat,
        fortify: defaultRuleset.fortify,
        cards: defaultRuleset.cards,
        teams: defaultRuleset.teams,
      });
      return { legalActions };
    }

    case "applyAction": {
      const result = applyAction(
        request.state,
        request.playerId as PlayerId,
        request.action,
        classicMap,
        defaultRuleset.combat,
        defaultRuleset.fortify,
        defaultRuleset.cards,
        defaultRuleset.teams,
      );
      return { state: result.state, events: result.events };
    }

    case "getStaticInfo": {
      return {
        map: {
          territoryIds: Object.keys(classicMap.territories),
          adjacency: classicMap.adjacency,
          territoryContinents: Object.fromEntries(
            Object.entries(classicMap.territories).map(([territoryId, territoryInfo]) => [
              territoryId,
              territoryInfo.continentId,
            ]),
          ),
        },
      };
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) continue;

  try {
    const parsed = JSON.parse(line) as Request;
    const response = handleRequest(parsed);
    writeResponse(response);
  } catch (error) {
    if (error instanceof ActionError || error instanceof Error) {
      writeResponse({ error: error.message });
      continue;
    }
    writeResponse({ error: "Unknown subprocess error" });
  }
}
