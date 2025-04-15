interface GameState {
  onlinePlayers: string[];
}

let state: GameState = {
  onlinePlayers: [],
};

export function getState(): GameState {
  return state;
}

export function addOnlinePlayer(playerId: string): void {
  if (!state.onlinePlayers.includes(playerId)) {
    state.onlinePlayers.push(playerId);
  }
}

export function removeOnlinePlayer(playerId: string): void {
  state.onlinePlayers = state.onlinePlayers.filter((id) => id !== playerId);
}
