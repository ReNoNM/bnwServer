import pool from "./connection";
import { initDatabase } from "./migrations/init";
import { Player, PlayerDTO, playerToDTO } from "./models/player";
import { ChatMessage, ChatMessageType } from "./models/chatMessage";
import { log, error as logError } from "../utils/logger";

// Инициализация базы данных при запуске
export async function initializeDatabase(): Promise<void> {
  try {
    await initDatabase();
  } catch (err) {
    logError(`Ошибка инициализации БД: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    process.exit(1);
  }
}

// Получение списка игроков
export async function getPlayers(): Promise<Player[]> {
  try {
    const result = await pool.query(`
      SELECT id, username, password, created_at as "createdAt", 
             last_login as "lastLogin", status, settings
      FROM players
    `);
    return result.rows;
  } catch (err) {
    logError(`Ошибка получения списка игроков: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Получение игрока по ID
export async function getPlayerById(id: string): Promise<Player | undefined> {
  try {
    const result = await pool.query(
      `
      SELECT id, username, password, created_at as "createdAt", 
             last_login as "lastLogin", status, settings
      FROM players
      WHERE id = $1
    `,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : undefined;
  } catch (err) {
    logError(`Ошибка получения игрока по ID: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Получение игрока по имени пользователя
export async function getPlayerByUsername(username: string): Promise<Player | undefined> {
  try {
    const result = await pool.query(
      `
      SELECT id, username, password, created_at as "createdAt", 
             last_login as "lastLogin", status, settings
      FROM players
      WHERE LOWER(username) = LOWER($1)
    `,
      [username]
    );

    return result.rows.length > 0 ? result.rows[0] : undefined;
  } catch (err) {
    logError(`Ошибка получения игрока по имени: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Добавление нового игрока
export async function addPlayer(player: Omit<Player, "id" | "createdAt">): Promise<Player | undefined> {
  try {
    const result = await pool.query(
      `
      INSERT INTO players (username, password, status, settings)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, password, created_at as "createdAt", 
                last_login as "lastLogin", status, settings
    `,
      [player.username, player.password, player.status, player.settings || {}]
    );

    const newPlayer = result.rows[0];
    log(`Игрок добавлен: ${newPlayer.username} (${newPlayer.id})`);
    return newPlayer;
  } catch (err) {
    logError(`Ошибка добавления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Обновление данных игрока
export async function updatePlayer(id: string, updates: Partial<Player>): Promise<boolean> {
  try {
    // Генерируем динамический SQL для обновления только переданных полей
    const fields = Object.keys(updates).filter((key) => key !== "password" && key !== "id");

    if (fields.length === 0) return false;

    const setClause = fields
      .map((field, index) => {
        // Преобразуем camelCase в snake_case для SQL
        const sqlField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
        return `${sqlField} = $${index + 2}`;
      })
      .join(", ");

    const values = fields.map((field) => updates[field as keyof Partial<Player>]);

    const query = `
      UPDATE players
      SET ${setClause}
      WHERE id = $1
      RETURNING id, username
    `;

    const result = await pool.query(query, [id, ...values]);

    const success = result.rowCount > 0;
    if (success) {
      log(`Игрок обновлен: ${result.rows[0].username} (${result.rows[0].id})`);
    }

    return success;
  } catch (err) {
    logError(`Ошибка обновления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Обновление статуса игрока
export async function updatePlayerStatus(id: string, status: "online" | "offline"): Promise<boolean> {
  try {
    const updateFields = {
      status,
      lastLogin: status === "online" ? new Date() : undefined,
    };

    // Удаляем undefined поля
    Object.keys(updateFields).forEach((key) => {
      if (updateFields[key as keyof typeof updateFields] === undefined) {
        delete updateFields[key as keyof typeof updateFields];
      }
    });

    return await updatePlayer(id, updateFields);
  } catch (err) {
    logError(`Ошибка обновления статуса игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Удаление игрока
export async function removePlayer(id: string): Promise<boolean> {
  try {
    // Сначала удаляем все сообщения игрока (чтобы избежать нарушения внешних ключей)
    await pool.query(
      `
      DELETE FROM chat_messages
      WHERE sender_id = $1 OR receiver_id = $1
    `,
      [id]
    );

    // Затем удаляем самого игрока
    const result = await pool.query(
      `
      DELETE FROM players
      WHERE id = $1
      RETURNING id, username
    `,
      [id]
    );

    const success = result.rowCount > 0;
    if (success) {
      log(`Игрок удален: ${result.rows[0].username} (${result.rows[0].id})`);
    }

    return success;
  } catch (err) {
    logError(`Ошибка удаления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Получение всех сообщений чата
export async function getChatMessages(): Promise<ChatMessage[]> {
  try {
    const result = await pool.query(`
      SELECT cm.id, cm.sender_id as "senderId", cm.message, cm.timestamp, 
             cm.type, cm.receiver_id as "receiverId", cm.metadata,
             p.username as "senderUsername"
      FROM chat_messages cm
      JOIN players p ON cm.sender_id = p.id
      ORDER BY cm.timestamp ASC
    `);

    return result.rows.map((row) => {
      // Добавляем имя пользователя в метаданные
      const metadata = row.metadata || {};
      metadata.username = row.senderUsername;

      const message: ChatMessage = {
        senderId: row.senderId,
        message: row.message,
        timestamp: row.timestamp,
        type: row.type as ChatMessageType,
        receiverId: row.receiverId,
        metadata,
      };

      return message;
    });
  } catch (err) {
    logError(`Ошибка получения сообщений чата: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Добавление сообщения в чат
export async function addChatMessage(message: ChatMessage): Promise<ChatMessage | undefined> {
  try {
    const result = await pool.query(
      `
      INSERT INTO chat_messages (sender_id, message, timestamp, type, receiver_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, sender_id as "senderId", message, timestamp, type, receiver_id as "receiverId", metadata
    `,
      [message.senderId, message.message, message.timestamp, message.type, message.receiverId || null, message.metadata || {}]
    );

    return result.rows[0];
  } catch (err) {
    logError(`Ошибка добавления сообщения чата: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Получение последних N сообщений чата
export async function getRecentChatMessages(limit: number = 50): Promise<ChatMessage[]> {
  try {
    const result = await pool.query(
      `
      SELECT cm.id, cm.sender_id as "senderId", cm.message, cm.timestamp, 
             cm.type, cm.receiver_id as "receiverId", cm.metadata,
             p.username as "senderUsername"
      FROM chat_messages cm
      JOIN players p ON cm.sender_id = p.id
      ORDER BY cm.timestamp DESC
      LIMIT $1
    `,
      [limit]
    );

    // Конвертируем результаты и добавляем имя отправителя в метаданные
    return result.rows
      .map((row) => {
        const metadata = row.metadata || {};
        metadata.username = row.senderUsername;

        const message: ChatMessage = {
          senderId: row.senderId,
          message: row.message,
          timestamp: row.timestamp,
          type: row.type as ChatMessageType,
          receiverId: row.receiverId,
          metadata,
        };

        return message;
      })
      .reverse(); // Возвращаем в хронологическом порядке
  } catch (err) {
    logError(`Ошибка получения последних сообщений: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Получение приватных сообщений между двумя пользователями
export async function getPrivateMessages(user1Id: string, user2Id: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const result = await pool.query(
      `
      SELECT cm.id, cm.sender_id as "senderId", cm.message, cm.timestamp, 
             cm.type, cm.receiver_id as "receiverId", cm.metadata,
             p.username as "senderUsername"
      FROM chat_messages cm
      JOIN players p ON cm.sender_id = p.id
      WHERE cm.type = 'PRIVATE' AND (
        (cm.sender_id = $1 AND cm.receiver_id = $2) OR
        (cm.sender_id = $2 AND cm.receiver_id = $1)
      )
      ORDER BY cm.timestamp DESC
      LIMIT $3
    `,
      [user1Id, user2Id, limit]
    );

    // Конвертируем результаты и добавляем имя отправителя в метаданные
    return result.rows
      .map((row) => {
        const metadata = row.metadata || {};
        metadata.username = row.senderUsername;

        const message: ChatMessage = {
          senderId: row.senderId,
          message: row.message,
          timestamp: row.timestamp,
          type: row.type as ChatMessageType,
          receiverId: row.receiverId,
          metadata,
        };

        return message;
      })
      .reverse(); // Возвращаем в хронологическом порядке
  } catch (err) {
    logError(`Ошибка получения приватных сообщений: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Теперь нам нужно также обновить модели и методы, которые зависят от нового слоя данных

// Экспортируем функции для использования в других модулях
export { Player, PlayerDTO, playerToDTO, ChatMessage, ChatMessageType };
