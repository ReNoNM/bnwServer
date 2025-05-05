import { db } from "../connection";
import { Player } from "../models/player";
import { log, error as logError } from "../../utils/logger";
import { sql } from "kysely";

// Получение списка игроков
export async function getAll(): Promise<Player[]> {
  try {
    const results = await db
      .selectFrom("players")
      .select(["id", "username", "password", "created_at as createdAt", "last_login as lastLogin", "status", "settings"])
      .execute();

    return results.map(
      (row) =>
        ({
          ...row,
          createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : 0,
          lastLogin: row.lastLogin instanceof Date ? row.lastLogin.getTime() : undefined,
        } as unknown as Player)
    );
  } catch (err) {
    logError(`Ошибка получения списка игроков: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Получение игрока по ID
export async function getById(id: string): Promise<Player | undefined> {
  try {
    const result = await db
      .selectFrom("players")
      .select(["id", "username", "password", "created_at as createdAt", "last_login as lastLogin", "status", "settings"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      lastLogin: result.lastLogin instanceof Date ? result.lastLogin.getTime() : undefined,
    } as unknown as Player;
  } catch (err) {
    logError(`Ошибка получения игрока по ID: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Получение игрока по имени пользователя
export async function getByUsername(username: string): Promise<Player | undefined> {
  try {
    const result = await db
      .selectFrom("players")
      .select(["id", "username", "password", "created_at as createdAt", "last_login as lastLogin", "status", "settings"])
      .where(sql`LOWER(username)`, "=", username.toLowerCase())
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      lastLogin: result.lastLogin instanceof Date ? result.lastLogin.getTime() : undefined,
    } as unknown as Player;
  } catch (err) {
    logError(`Ошибка получения игрока по имени: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Добавление нового игрока
export async function add(player: Omit<Player, "id" | "createdAt">): Promise<Player | undefined> {
  try {
    const result = await db
      .insertInto("players")
      .values({
        username: player.username,
        password: player.password,
        status: player.status,
        settings: player.settings || {},
      })
      .returning(["id", "username", "password", "created_at as createdAt", "last_login as lastLogin", "status", "settings"])
      .executeTakeFirst();

    if (!result) return undefined;

    const newPlayer = {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      lastLogin: result.lastLogin instanceof Date ? result.lastLogin.getTime() : undefined,
    } as unknown as Player;

    log(`Игрок добавлен: ${newPlayer.username} (${newPlayer.id})`);
    return newPlayer;
  } catch (err) {
    logError(`Ошибка добавления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Обновление данных игрока
export async function update(id: string, updates: Partial<Player>): Promise<boolean> {
  try {
    // Создаем объект для обновления, преобразуя camelCase в snake_case
    const updateValues: Record<string, any> = {};

    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.settings !== undefined) updateValues.settings = updates.settings as Record<string, unknown>;
    if (updates.lastLogin !== undefined) updateValues.last_login = new Date(updates.lastLogin);

    if (Object.keys(updateValues).length === 0) return false;

    const result = await db.updateTable("players").set(updateValues).where("id", "=", id).returning(["id", "username"]).executeTakeFirst();

    const success = !!result;
    if (success) {
      log(`Игрок обновлен: ${result.username} (${result.id})`);
    }

    return success;
  } catch (err) {
    logError(`Ошибка обновления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Обновление статуса игрока
export async function updateStatus(id: string, status: "online" | "offline"): Promise<boolean> {
  try {
    const updateValues: Record<string, any> = {
      status: status,
    };

    if (status === "online") {
      updateValues.last_login = new Date();
    }

    const result = await db.updateTable("players").set(updateValues).where("id", "=", id).returning(["id", "username"]).executeTakeFirst();

    const success = !!result;
    if (success) {
      log(`Статус игрока обновлен: ${result.username} (${result.id}) - ${status}`);
    }

    return success;
  } catch (err) {
    logError(`Ошибка обновления статуса игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Удаление игрока
export async function remove(id: string): Promise<boolean> {
  try {
    return await db.transaction().execute(async (trx) => {
      // Сначала удаляем все сообщения игрока
      await trx
        .deleteFrom("chat_messages")
        .where((eb) => eb.or([eb("sender_id", "=", id), eb("receiver_id", "=", id)]))
        .execute();

      // Затем удаляем самого игрока
      const result = await trx.deleteFrom("players").where("id", "=", id).returning(["id", "username"]).executeTakeFirst();

      const success = !!result;
      if (success) {
        log(`Игрок удален: ${result.username} (${result.id})`);
      }

      return success;
    });
  } catch (err) {
    logError(`Ошибка удаления игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}
