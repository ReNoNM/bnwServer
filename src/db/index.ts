import { Player, playerToDTO, PlayerDTO } from "./models/player";
import { ChatMessage, ChatMessageType } from "./models/chatMessage";
import { log } from "../utils/logger";

// In-memory хранилище данных
const players: Player[] = [];
const chatMessages: ChatMessage[] = [];

// Получение списка игроков
export function getPlayers(): Player[] {
  return [...players];
}

// Получение игрока по ID
export function getPlayerById(id: string): Player | undefined {
  return players.find((player) => player.id === id);
}

// Получение игрока по имени пользователя
export function getPlayerByUsername(username: string): Player | undefined {
  return players.find((player) => player.username.toLowerCase() === username.toLowerCase());
}

// Добавление нового игрока
export function addPlayer(player: Player): void {
  players.push({
    ...player,
    createdAt: Date.now(),
    status: "offline",
  });
  log(`Игрок добавлен: ${player.username} (${player.id})`);
}

// Обновление данных игрока
export function updatePlayer(id: string, updates: Partial<Player>): boolean {
  const index = players.findIndex((p) => p.id === id);
  if (index === -1) return false;

  // Запрещаем прямое обновление пароля через эту функцию
  const { password, ...safeUpdates } = updates;

  players[index] = {
    ...players[index],
    ...safeUpdates,
  };

  log(`Игрок обновлен: ${players[index].username} (${players[index].id})`);
  return true;
}

// Обновление статуса игрока
export function updatePlayerStatus(id: string, status: "online" | "offline"): boolean {
  const player = getPlayerById(id);
  if (!player) return false;

  player.status = status;

  if (status === "online") {
    player.lastLogin = Date.now();
  }

  return true;
}

// Удаление игрока
export function removePlayer(id: string): boolean {
  const initialLength = players.length;
  const newPlayers = players.filter((p) => p.id !== id);
  players.length = 0;
  players.push(...newPlayers);

  const removed = newPlayers.length < initialLength;
  if (removed) {
    log(`Игрок удален: ${id}`);
  }

  return removed;
}

// Получение списка игроков в формате DTO (без паролей)
export function getPlayerDTOs(): PlayerDTO[] {
  return players.map(playerToDTO);
}

// Получение всех сообщений чата
export function getChatMessages(): ChatMessage[] {
  return [...chatMessages];
}

// Добавление сообщения в чат
export function addChatMessage(message: ChatMessage): void {
  chatMessages.push(message);

  // Ограничение размера истории чата (сохраняем последние 1000 сообщений)
  if (chatMessages.length > 1000) {
    chatMessages.shift();
  }
}

// Получение последних N сообщений чата
export function getRecentChatMessages(limit: number = 50): ChatMessage[] {
  return chatMessages.slice(-limit);
}

// Получение приватных сообщений между двумя пользователями
export function getPrivateMessages(user1Id: string, user2Id: string, limit: number = 50): ChatMessage[] {
  return chatMessages
    .filter(
      (msg) =>
        msg.type === ChatMessageType.PRIVATE &&
        ((msg.senderId === user1Id && msg.receiverId === user2Id) || (msg.senderId === user2Id && msg.receiverId === user1Id))
    )
    .slice(-limit);
}

// Очистка базы данных (для тестирования)
export function clearDatabase(): void {
  players.length = 0;
  chatMessages.length = 0;
  log("База данных очищена");
}

// Экспортируем объекты для прямого доступа (если необходимо)
export const db = {
  players,
  chatMessages,
};
