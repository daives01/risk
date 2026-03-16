# risk-ml

`risk-ml` trains a self-play PPO policy using a Bun subprocess around `risk-engine`, with Python managed by `uv`.

## Prerequisites

- Bun
- Python 3.11+
- uv

## Layout

- `engine/subprocess.ts`: long-lived JSON-line subprocess wrapping `risk-engine`.
- `engine/create_initial_state.ts`: deterministic game initialization helper.
- `src/risk_ml/engine_client.py`: Python subprocess client.
- `src/risk_ml/train.py`: PPO self-play trainer with a graph-aware policy/value model.

## Subprocess protocol

Each stdin line is one JSON request. Each stdout line is one JSON response.

- `createGame`
  - Request: `{"cmd":"createGame","numPlayers":2,"seed":42}`
  - Response: `{"state": ...}`
- `getLegalActions`
  - Request: `{"cmd":"getLegalActions","state": ...}`
  - Response: `{"legalActions":[...]}`
- `applyAction`
  - Request: `{"cmd":"applyAction","state":...,"playerId":"p0","action":...}`
  - Response: `{"state":...,"events":[...]}`

Errors are returned as `{"error":"message"}`.

- `getStaticInfo`
  - Request: `{"cmd":"getStaticInfo"}`
  - Response: `{"map":{"territoryIds":[...],"adjacency":{...},"territoryContinents":{...}}}`

## Run the engine subprocess manually

From this package directory:

```bash
bun run engine/subprocess.ts
```

Then you can paste JSON requests line-by-line for debugging.

## Run self-play training

From this package directory:

```bash
uv sync
uv run python -m risk_ml.train
```

Useful flags:

```bash
uv run python -m risk_ml.train --iterations 10 --episodes-per-iteration 8 --eval-every 2
```

Checkpoints are written to `checkpoints/` by default.  
By default, `EngineClient` resolves `engine/subprocess.ts` from this package path and runs it with Bun. You can override script location with `RISK_ML_ENGINE_SCRIPT`.
