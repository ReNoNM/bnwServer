export interface Player {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: number;
  lastLogin?: number;
  status: "online" | "offline";
  settings?: Partial<PlayerSettings>;
}

export interface PlayerSettings {
  language?: string;
  notifications?: boolean;
  theme?: "light" | "dark";
}

export interface PlayerDTO {
  id: string;
  username: string;
  email: string;
  status: "online" | "offline";
  createdAt: number;
  lastLogin?: number;
  settings?: PlayerSettings;
}

export function playerToDTO(player: Player): PlayerDTO {
  const { password, ...playerDTO } = player;
  return playerDTO;
}
