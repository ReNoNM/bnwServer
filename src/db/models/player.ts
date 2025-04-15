export interface Player {
  id: string;
  username: string;
  password: string; // В улучшенной версии будет содержать хешированный пароль
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

// DTO для передачи данных клиенту (без пароля)
export interface PlayerDTO {
  id: string;
  username: string;
  status: "online" | "offline";
  createdAt: number;
  lastLogin?: number;
  settings?: PlayerSettings;
}

// Функция для преобразования Player в PlayerDTO (без пароля)
export function playerToDTO(player: Player): PlayerDTO {
  const { password, ...playerDTO } = player;
  return playerDTO;
}
