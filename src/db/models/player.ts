import { Generated } from "kysely";
// Импортируем тип Players из сгенерированного файла
import { Players } from "./database";

export interface Player {
  id: string;
  username: string;
  password: string;
  createdAt: number;
  lastLogin?: number;
  status: "online" | "offline";
  settings?: PlayerSettings;
}

export interface PlayerSettings {
  language?: string;
  notifications?: boolean;
  theme?: "light" | "dark";
}

export interface PlayerDTO {
  id: string;
  username: string;
  status: "online" | "offline";
  createdAt: number;
  lastLogin?: number;
  settings?: PlayerSettings;
}

export function playerToDTO(player: Player): PlayerDTO {
  const { password, ...playerDTO } = player;
  return playerDTO;
}
