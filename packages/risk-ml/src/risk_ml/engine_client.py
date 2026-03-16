from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any


class EngineClientError(RuntimeError):
    """Raised when the Bun engine subprocess returns an error."""


def _default_subprocess_script() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "engine"
        / "subprocess.ts"
    )


class EngineClient:
    def __init__(self, script_path: Path | None = None):
        self._script_path = Path(
            os.environ.get("RISK_ML_ENGINE_SCRIPT", "")
        ) if os.environ.get("RISK_ML_ENGINE_SCRIPT") else (script_path or _default_subprocess_script())

        self._proc = subprocess.Popen(
            ["bun", "run", str(self._script_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            text=True,
            bufsize=1,
        )

        if self._proc.stdin is None or self._proc.stdout is None:
            raise EngineClientError("Failed to open subprocess pipes")

    def close(self) -> None:
        if self._proc.poll() is not None:
            return

        self._proc.terminate()
        try:
            self._proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self._proc.kill()

    def __enter__(self) -> "EngineClient":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None

        if self._proc.poll() is not None:
            raise EngineClientError("Engine subprocess is not running")

        self._proc.stdin.write(json.dumps(payload) + "\n")
        self._proc.stdin.flush()

        line = self._proc.stdout.readline()
        if line == "":
            raise EngineClientError("Engine subprocess closed without response")

        try:
            response = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EngineClientError(f"Invalid JSON response from engine: {line!r}") from exc

        if "error" in response:
            raise EngineClientError(str(response["error"]))

        if not isinstance(response, dict):
            raise EngineClientError("Engine response must be a JSON object")

        return response

    def create_game(self, num_players: int, seed: str | int) -> dict[str, Any]:
        response = self._request(
            {"cmd": "createGame", "numPlayers": num_players, "seed": seed}
        )
        return response["state"]

    def get_static_info(self) -> dict[str, Any]:
        response = self._request({"cmd": "getStaticInfo"})
        return response["map"]

    def get_legal_actions(self, state: dict[str, Any]) -> list[dict[str, Any]]:
        response = self._request({"cmd": "getLegalActions", "state": state})
        return response["legalActions"]

    def apply_action(
        self,
        state: dict[str, Any],
        player_id: str,
        action: dict[str, Any],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        response = self._request(
            {
                "cmd": "applyAction",
                "state": state,
                "playerId": player_id,
                "action": action,
            }
        )
        return response["state"], response["events"]
