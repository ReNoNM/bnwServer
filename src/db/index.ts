import { initDatabase } from "./migrations/init";
import { Player, PlayerDTO, playerToDTO } from "./models/player";
import { ChatMessage, ChatMessageType } from "./models/chatMessage";
import { log, error as logError } from "../utils/logger";
import * as playerRepository from "./repositories/playerRepository";
import * as chatRepository from "./repositories/chatRepository";

// Инициализация базы данных при запуске
export async function initializeDatabase(): Promise<void> {
  try {
    await initDatabase();
  } catch (err) {
    logError(`Ошибка инициализации БД: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    process.exit(1);
  }
}

// Экспортируем типы и репозитории
export { Player, PlayerDTO, playerToDTO, ChatMessage, ChatMessageType, playerRepository, chatRepository };

// Для обратной совместимости с существующим кодом
export const getPlayers = playerRepository.getAll;
export const getPlayerById = playerRepository.getById;
export const getPlayerByUsername = playerRepository.getByUsername;
export const addPlayer = playerRepository.add;
export const updatePlayer = playerRepository.update;
export const updatePlayerStatus = playerRepository.updateStatus;
export const removePlayer = playerRepository.remove;

export const getChatMessages = chatRepository.getAll;
export const addChatMessage = chatRepository.add;
export const getRecentChatMessages = chatRepository.getRecent;
export const getPrivateMessages = chatRepository.getPrivate;
