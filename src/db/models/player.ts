// src/db/models/player.ts
export interface Player {
  id: string;
  username: string;
  email: string;
  password: string;
  tag?: string; // Добавлено новое поле tag
  tagPosition?: string; // Добавлено новое поле tagPosition
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
  tag?: string; // Добавлено новое поле tag
  tagPosition?: string; // Добавлено новое поле tagPosition
  status: "online" | "offline";
  createdAt: number;
  lastLogin?: number;
  settings?: PlayerSettings;
}

export function playerToDTO(player: Player): PlayerDTO {
  const { password, ...playerDTO } = player;
  return playerDTO;
}
