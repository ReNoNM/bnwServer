// Существующий интерфейс для объекта в приложении
export interface Player {
  id: string;
  username: string;
  password: string;
  createdAt: number;
  lastLogin?: number;
  status: "online" | "offline";
  settings?: PlayerSettings;
}

// Определяем настройки игрока
export interface PlayerSettings {
  language?: string;
  notifications?: boolean;
  theme?: "light" | "dark";
  [key: string]: unknown; // Добавляем индексную сигнатуру
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

// Определяем интерфейс для таблицы players в БД (для Kysely)
export interface PlayerTable {
  id: string;
  username: string;
  password: string;
  created_at: Date;
  last_login: Date | null;
  status: "online" | "offline";
  settings: Record<string, unknown>;
}
