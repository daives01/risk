from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from torch import nn
from torch.distributions import Categorical

from .engine_client import EngineClient

ACTION_TYPES = [
    "TradeCards",
    "PlaceReinforcements",
    "Attack",
    "Occupy",
    "Fortify",
    "EndAttackPhase",
    "EndTurn",
]
ACTION_TYPE_TO_IDX = {name: idx for idx, name in enumerate(ACTION_TYPES)}
PHASES = ["Setup", "Reinforcement", "Attack", "Occupy", "Fortify", "GameOver"]


@dataclass
class MapInfo:
    territory_ids: list[str]
    territory_to_idx: dict[str, int]
    territory_continents: dict[str, str]
    continent_to_idx: dict[str, int]
    adjacency: dict[str, list[str]]
    adjacency_tensor: torch.Tensor


@dataclass
class Transition:
    node_features: torch.Tensor
    global_features: torch.Tensor
    action_features: torch.Tensor
    from_idx: torch.Tensor
    to_idx: torch.Tensor
    action_index: int
    old_log_prob: float
    old_value: float
    actor_id: str
    target_return: float = 0.0
    advantage: float = 0.0


class RiskPolicyValueNet(nn.Module):
    def __init__(
        self,
        node_feature_dim: int,
        global_feature_dim: int,
        action_feature_dim: int,
        hidden_dim: int = 128,
        message_passing_layers: int = 2,
    ) -> None:
        super().__init__()
        self.node_projection = nn.Linear(node_feature_dim, hidden_dim)
        self.self_layers = nn.ModuleList(
            nn.Linear(hidden_dim, hidden_dim)
            for _ in range(message_passing_layers)
        )
        self.neighbor_layers = nn.ModuleList(
            nn.Linear(hidden_dim, hidden_dim)
            for _ in range(message_passing_layers)
        )
        self.context_head = nn.Sequential(
            nn.Linear(hidden_dim + global_feature_dim, hidden_dim),
            nn.ReLU(),
        )
        self.action_head = nn.Sequential(
            nn.Linear((hidden_dim * 3) + action_feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )
        self.value_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(
        self,
        node_features: torch.Tensor,
        adjacency: torch.Tensor,
        global_features: torch.Tensor,
        action_features: torch.Tensor,
        from_idx: torch.Tensor,
        to_idx: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        h = torch.relu(self.node_projection(node_features))
        for self_layer, neighbor_layer in zip(self.self_layers, self.neighbor_layers):
            neighbor_messages = adjacency @ h
            h = torch.relu(self_layer(h) + neighbor_layer(neighbor_messages))

        graph_embedding = h.mean(dim=0)
        context = self.context_head(torch.cat([graph_embedding, global_features], dim=0))

        zero_emb = torch.zeros_like(context)
        from_embeddings = torch.stack(
            [h[idx] if idx >= 0 else zero_emb for idx in from_idx.tolist()],
            dim=0,
        )
        to_embeddings = torch.stack(
            [h[idx] if idx >= 0 else zero_emb for idx in to_idx.tolist()],
            dim=0,
        )
        context_batch = context.unsqueeze(0).expand(action_features.shape[0], -1)
        action_input = torch.cat(
            [context_batch, from_embeddings, to_embeddings, action_features],
            dim=1,
        )
        logits = self.action_head(action_input).squeeze(1)
        value = self.value_head(context).squeeze(0)
        return logits, value


def _winner_from_events(events: list[dict[str, Any]]) -> str | None:
    for event in events:
        if event.get("type") == "GameEnded":
            winning_player_id = event.get("winningPlayerId")
            if isinstance(winning_player_id, str):
                return winning_player_id
    return None


def _resolve_map_info(client: EngineClient, device: torch.device) -> MapInfo:
    raw = client.get_static_info()
    territory_ids = sorted(raw["territoryIds"])
    territory_to_idx = {territory_id: idx for idx, territory_id in enumerate(territory_ids)}
    territory_continents = dict(raw["territoryContinents"])
    continent_ids = sorted(set(territory_continents.values()))
    continent_to_idx = {continent_id: idx for idx, continent_id in enumerate(continent_ids)}
    adjacency = {k: list(v) for k, v in raw["adjacency"].items()}

    n = len(territory_ids)
    matrix = torch.zeros((n, n), dtype=torch.float32, device=device)
    for from_id, to_ids in adjacency.items():
        from_index = territory_to_idx[from_id]
        for to_id in to_ids:
            matrix[from_index, territory_to_idx[to_id]] = 1.0
    matrix = matrix + torch.eye(n, dtype=torch.float32, device=device)
    matrix = matrix / matrix.sum(dim=1, keepdim=True).clamp(min=1.0)

    return MapInfo(
        territory_ids=territory_ids,
        territory_to_idx=territory_to_idx,
        territory_continents=territory_continents,
        continent_to_idx=continent_to_idx,
        adjacency=adjacency,
        adjacency_tensor=matrix,
    )


def _owner_bucket(
    owner_id: str,
    current_player_id: str,
    players: dict[str, Any],
) -> int:
    if owner_id == current_player_id:
        return 0
    if owner_id == "neutral":
        return 1
    current_team = players.get(current_player_id, {}).get("teamId")
    owner_team = players.get(owner_id, {}).get("teamId")
    if current_team is not None and owner_team == current_team:
        return 2
    return 3


def encode_state(
    state: dict[str, Any],
    map_info: MapInfo,
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor]:
    current_player_id = state["turn"]["currentPlayerId"]
    players = state["players"]
    turn_order = state["turnOrder"]
    reinforcements_remaining = float(state.get("reinforcements", {}).get("remaining", 0))
    current_hand_size = float(len(state["hands"].get(current_player_id, [])))

    node_rows: list[list[float]] = []
    for territory_id in map_info.territory_ids:
        territory = state["territories"][territory_id]
        owner_id = territory["ownerId"]
        armies = float(territory["armies"])
        owner_bucket = _owner_bucket(owner_id, current_player_id, players)

        owner_one_hot = [0.0, 0.0, 0.0, 0.0]
        owner_one_hot[owner_bucket] = 1.0

        continent_one_hot = [0.0] * len(map_info.continent_to_idx)
        continent_id = map_info.territory_continents[territory_id]
        continent_one_hot[map_info.continent_to_idx[continent_id]] = 1.0

        border_flag = 0.0
        for neighbor_id in map_info.adjacency[territory_id]:
            if state["territories"][neighbor_id]["ownerId"] != owner_id:
                border_flag = 1.0
                break

        node_rows.append(owner_one_hot + [armies / 20.0, border_flag] + continent_one_hot)

    node_features = torch.tensor(node_rows, dtype=torch.float32, device=device)

    phase_one_hot = [0.0] * len(PHASES)
    phase_name = state["turn"]["phase"]
    if phase_name in PHASES:
        phase_one_hot[PHASES.index(phase_name)] = 1.0

    current_player_idx = turn_order.index(current_player_id)
    global_features = torch.tensor(
        phase_one_hot
        + [
            float(state["turn"]["round"]) / 100.0,
            reinforcements_remaining / 20.0,
            current_hand_size / 8.0,
            float(state["tradesCompleted"]) / 20.0,
            1.0 if state["capturedThisTurn"] else 0.0,
            float(current_player_idx) / max(1.0, float(len(turn_order) - 1)),
        ],
        dtype=torch.float32,
        device=device,
    )
    return node_features, global_features


def encode_actions(
    legal_actions: list[dict[str, Any]],
    map_info: MapInfo,
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    action_rows: list[list[float]] = []
    from_indices: list[int] = []
    to_indices: list[int] = []

    for action in legal_actions:
        action_type = action["type"]
        type_one_hot = [0.0] * len(ACTION_TYPES)
        type_one_hot[ACTION_TYPE_TO_IDX[action_type]] = 1.0

        from_id = action.get("from")
        to_id = action.get("to")
        from_idx = map_info.territory_to_idx[from_id] if isinstance(from_id, str) else -1
        to_idx = map_info.territory_to_idx[to_id] if isinstance(to_id, str) else -1
        from_indices.append(from_idx)
        to_indices.append(to_idx)

        count = float(action.get("count", action.get("moveArmies", 0)))
        attacker_dice = float(action.get("attackerDice", 0))
        card_count = float(len(action.get("cardIds", [])))
        territory_id = action.get("territoryId")
        territory_idx = (
            float(map_info.territory_to_idx[territory_id])
            / max(1.0, float(len(map_info.territory_to_idx) - 1))
            if isinstance(territory_id, str)
            else 0.0
        )

        action_rows.append(
            type_one_hot
            + [
                1.0 if from_idx >= 0 else 0.0,
                1.0 if to_idx >= 0 else 0.0,
                count / 20.0,
                attacker_dice / 3.0,
                card_count / 5.0,
                territory_idx,
            ]
        )

    return (
        torch.tensor(action_rows, dtype=torch.float32, device=device),
        torch.tensor(from_indices, dtype=torch.long, device=device),
        torch.tensor(to_indices, dtype=torch.long, device=device),
    )


def collect_episode(
    model: RiskPolicyValueNet,
    client: EngineClient,
    map_info: MapInfo,
    seed: int,
    num_players: int,
    device: torch.device,
    max_steps: int = 5_000,
) -> tuple[list[Transition], str | None]:
    state = client.create_game(num_players=num_players, seed=seed)
    transitions: list[Transition] = []
    winner: str | None = None

    for _ in range(max_steps):
        if state["turn"]["phase"] == "GameOver":
            break
        legal_actions = client.get_legal_actions(state)
        if not legal_actions:
            break

        node_features, global_features = encode_state(state, map_info, device)
        action_features, from_idx, to_idx = encode_actions(legal_actions, map_info, device)

        with torch.no_grad():
            logits, value = model(
                node_features,
                map_info.adjacency_tensor,
                global_features,
                action_features,
                from_idx,
                to_idx,
            )
            dist = Categorical(logits=logits)
            action_index = int(dist.sample().item())
            selected = torch.tensor(action_index, dtype=torch.long, device=device)
            log_prob = float(dist.log_prob(selected).item())
            value_scalar = float(value.item())

        current_player_id = state["turn"]["currentPlayerId"]
        chosen_action = legal_actions[action_index]
        state, events = client.apply_action(state, current_player_id, chosen_action)

        transitions.append(
            Transition(
                node_features=node_features.detach().cpu(),
                global_features=global_features.detach().cpu(),
                action_features=action_features.detach().cpu(),
                from_idx=from_idx.detach().cpu(),
                to_idx=to_idx.detach().cpu(),
                action_index=action_index,
                old_log_prob=log_prob,
                old_value=value_scalar,
                actor_id=current_player_id,
            )
        )
        winner = _winner_from_events(events) or winner
        if winner is not None:
            break

    for transition in transitions:
        transition.target_return = 0.0 if winner is None else (1.0 if transition.actor_id == winner else -1.0)
        transition.advantage = transition.target_return - transition.old_value

    return transitions, winner


def ppo_update(
    model: RiskPolicyValueNet,
    optimizer: torch.optim.Optimizer,
    transitions: list[Transition],
    map_info: MapInfo,
    device: torch.device,
    ppo_epochs: int,
    batch_size: int,
    clip_epsilon: float,
    value_coef: float,
    entropy_coef: float,
    max_grad_norm: float,
) -> dict[str, float]:
    if not transitions:
        return {"loss": 0.0, "policy_loss": 0.0, "value_loss": 0.0, "entropy": 0.0}

    advantages = torch.tensor([t.advantage for t in transitions], dtype=torch.float32)
    advantages = (advantages - advantages.mean()) / (advantages.std(unbiased=False) + 1e-8)
    for idx, transition in enumerate(transitions):
        transition.advantage = float(advantages[idx].item())

    policy_total = 0.0
    value_total = 0.0
    entropy_total = 0.0
    updates = 0

    indices = list(range(len(transitions)))
    for _ in range(ppo_epochs):
        random.shuffle(indices)
        for start in range(0, len(indices), batch_size):
            batch_indices = indices[start:start + batch_size]
            if not batch_indices:
                continue

            policy_losses: list[torch.Tensor] = []
            value_losses: list[torch.Tensor] = []
            entropies: list[torch.Tensor] = []

            for idx in batch_indices:
                transition = transitions[idx]
                logits, value = model(
                    transition.node_features.to(device),
                    map_info.adjacency_tensor,
                    transition.global_features.to(device),
                    transition.action_features.to(device),
                    transition.from_idx.to(device),
                    transition.to_idx.to(device),
                )
                dist = Categorical(logits=logits)
                action_tensor = torch.tensor(transition.action_index, dtype=torch.long, device=device)
                new_log_prob = dist.log_prob(action_tensor)
                old_log_prob = torch.tensor(transition.old_log_prob, dtype=torch.float32, device=device)
                ratio = torch.exp(new_log_prob - old_log_prob)
                advantage = torch.tensor(transition.advantage, dtype=torch.float32, device=device)

                surrogate_1 = ratio * advantage
                surrogate_2 = torch.clamp(ratio, 1.0 - clip_epsilon, 1.0 + clip_epsilon) * advantage
                policy_losses.append(-torch.min(surrogate_1, surrogate_2))

                target_return = torch.tensor(transition.target_return, dtype=torch.float32, device=device)
                value_losses.append((value - target_return).pow(2))
                entropies.append(dist.entropy())

            policy_loss = torch.stack(policy_losses).mean()
            value_loss = torch.stack(value_losses).mean()
            entropy = torch.stack(entropies).mean()
            loss = policy_loss + (value_coef * value_loss) - (entropy_coef * entropy)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()

            policy_total += float(policy_loss.item())
            value_total += float(value_loss.item())
            entropy_total += float(entropy.item())
            updates += 1

    avg_policy = policy_total / max(1, updates)
    avg_value = value_total / max(1, updates)
    avg_entropy = entropy_total / max(1, updates)
    return {
        "loss": avg_policy + (value_coef * avg_value) - (entropy_coef * avg_entropy),
        "policy_loss": avg_policy,
        "value_loss": avg_value,
        "entropy": avg_entropy,
    }


@torch.no_grad()
def evaluate_vs_random(
    model: RiskPolicyValueNet,
    client: EngineClient,
    map_info: MapInfo,
    start_seed: int,
    episodes: int,
    device: torch.device,
) -> float:
    wins = 0
    for episode in range(episodes):
        state = client.create_game(num_players=2, seed=start_seed + episode)
        winner: str | None = None

        for _ in range(5_000):
            if state["turn"]["phase"] == "GameOver":
                break
            legal_actions = client.get_legal_actions(state)
            if not legal_actions:
                break

            current_player_id = state["turn"]["currentPlayerId"]
            if current_player_id == "p0":
                node_features, global_features = encode_state(state, map_info, device)
                action_features, from_idx, to_idx = encode_actions(legal_actions, map_info, device)
                logits, _ = model(
                    node_features,
                    map_info.adjacency_tensor,
                    global_features,
                    action_features,
                    from_idx,
                    to_idx,
                )
                action_index = int(torch.argmax(logits).item())
            else:
                action_index = random.randrange(len(legal_actions))

            state, events = client.apply_action(state, current_player_id, legal_actions[action_index])
            winner = _winner_from_events(events) or winner
            if winner is not None:
                break

        if winner == "p0":
            wins += 1

    return wins / max(1, episodes)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PPO self-play policy for Risk.")
    parser.add_argument("--iterations", type=int, default=30)
    parser.add_argument("--episodes-per-iteration", type=int, default=8)
    parser.add_argument("--num-players", type=int, default=2)
    parser.add_argument("--ppo-epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--clip-epsilon", type=float, default=0.2)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--max-grad-norm", type=float, default=0.5)
    parser.add_argument("--hidden-dim", type=int, default=128)
    parser.add_argument("--message-passing-layers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--eval-episodes", type=int, default=10)
    parser.add_argument("--eval-every", type=int, default=5)
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints"))
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda", "mps"])
    return parser.parse_args()


def _resolve_device(name: str) -> torch.device:
    if name == "cpu":
        return torch.device("cpu")
    if name == "cuda":
        return torch.device("cuda")
    if name == "mps":
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _save_checkpoint(
    model: RiskPolicyValueNet,
    optimizer: torch.optim.Optimizer,
    checkpoint_dir: Path,
    iteration: int,
) -> None:
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    path = checkpoint_dir / f"policy_iter_{iteration:04d}.pt"
    torch.save(
        {
            "iteration": iteration,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
        },
        path,
    )


def main() -> None:
    args = _parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = _resolve_device(args.device)

    with EngineClient() as client:
        map_info = _resolve_map_info(client, device)
        node_feature_dim = 4 + 2 + len(map_info.continent_to_idx)
        global_feature_dim = len(PHASES) + 6
        action_feature_dim = len(ACTION_TYPES) + 6

        model = RiskPolicyValueNet(
            node_feature_dim=node_feature_dim,
            global_feature_dim=global_feature_dim,
            action_feature_dim=action_feature_dim,
            hidden_dim=args.hidden_dim,
            message_passing_layers=args.message_passing_layers,
        ).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)

        for iteration in range(1, args.iterations + 1):
            all_transitions: list[Transition] = []
            winners: dict[str, int] = {}

            for episode_idx in range(args.episodes_per_iteration):
                seed = args.seed + (iteration * 10_000) + episode_idx
                transitions, winner = collect_episode(
                    model=model,
                    client=client,
                    map_info=map_info,
                    seed=seed,
                    num_players=args.num_players,
                    device=device,
                )
                all_transitions.extend(transitions)
                if winner is not None:
                    winners[winner] = winners.get(winner, 0) + 1

            metrics = ppo_update(
                model=model,
                optimizer=optimizer,
                transitions=all_transitions,
                map_info=map_info,
                device=device,
                ppo_epochs=args.ppo_epochs,
                batch_size=args.batch_size,
                clip_epsilon=args.clip_epsilon,
                value_coef=args.value_coef,
                entropy_coef=args.entropy_coef,
                max_grad_norm=args.max_grad_norm,
            )

            print(
                f"iter={iteration} steps={len(all_transitions)} "
                f"loss={metrics['loss']:.4f} policy={metrics['policy_loss']:.4f} "
                f"value={metrics['value_loss']:.4f} entropy={metrics['entropy']:.4f} "
                f"winners={winners}"
            )
            _save_checkpoint(model, optimizer, args.checkpoint_dir, iteration)

            if iteration % args.eval_every == 0:
                win_rate = evaluate_vs_random(
                    model=model,
                    client=client,
                    map_info=map_info,
                    start_seed=args.seed + (iteration * 100_000),
                    episodes=args.eval_episodes,
                    device=device,
                )
                print(f"eval_vs_random_win_rate={win_rate:.3f}")


if __name__ == "__main__":
    main()
