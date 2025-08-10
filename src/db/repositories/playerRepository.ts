import { db } from "../connection";
import { Player } from "../models/player";
import { log, error as logError } from "../../utils/logger";
import { sql } from "kysely";

export async function getAll(): Promise<Player[]> {
  try {
    const results = await db
      .selectFrom("players")
      .select([
        "id",
        "username",
        "email",
        "password",
        "tag",
        "tag_position as tagPosition",
        "created_at as createdAt",
        "last_login as lastLogin",
        "status",
        "settings",
        "main_world_id as mainWorldId",
      ])
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

// Обновление метода getById для включения новых полей
export async function getById(id: string): Promise<Player | undefined> {
  try {
    const result = await db
      .selectFrom("players")
      .select([
        "id",
        "username",
        "email",
        "password",
        "tag",
        "tag_position as tagPosition",
        "created_at as createdAt",
        "last_login as lastLogin",
        "status",
        "settings",
        "main_world_id as mainWorldId",
      ])
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

// Обновление метода getByUsername для включения новых полей
export async function getByUsername(username: string): Promise<Player | undefined> {
  try {
    const result = await db
      .selectFrom("players")
      .select([
        "id",
        "username",
        "email",
        "password",
        "tag",
        "tag_position as tagPosition",
        "created_at as createdAt",
        "last_login as lastLogin",
        "status",
        "settings",
        "main_world_id as mainWorldId",
      ])
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

// Обновление метода add для включения новых полей
export async function add(player: Omit<Player, "id" | "createdAt">): Promise<Player | undefined> {
  try {
    const result = await db
      .insertInto("players")
      .values({
        username: player.username,
        email: player.email,
        password: player.password,
        tag: player.tag,
        tag_position: player.tagPosition,
        status: player.status,
        settings: player.settings || {},
      })
      .returning([
        "id",
        "username",
        "email",
        "password",
        "tag",
        "tag_position as tagPosition",
        "created_at as createdAt",
        "last_login as lastLogin",
        "status",
        "settings",
      ])
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

// Обновление метода update для работы с новыми полями
export async function update(id: string, updates: Partial<Player>): Promise<boolean> {
  try {
    // Создаем объект для обновления, преобразуя camelCase в snake_case
    const updateValues: Record<string, any> = {};

    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.settings !== undefined) updateValues.settings = updates.settings as Record<string, unknown>;
    if (updates.lastLogin !== undefined) updateValues.last_login = new Date(updates.lastLogin);
    if (updates.tag !== undefined) updateValues.tag = updates.tag;
    if (updates.tagPosition !== undefined) updateValues.tag_position = updates.tagPosition;
    if (updates.password !== undefined) updateValues.password = updates.password;
    if (updates.mainWorldId !== undefined) updateValues.main_world_id = updates.mainWorldId;

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

// Обновление метода getByEmail для включения новых полей
export async function getByEmail(email: string): Promise<Player | undefined> {
  try {
    const result = await db
      .selectFrom("players")
      .select([
        "id",
        "username",
        "email",
        "password",
        "tag",
        "tag_position as tagPosition",
        "created_at as createdAt",
        "last_login as lastLogin",
        "status",
        "settings",
        "main_world_id as mainWorldId",
      ])
      .where("email", "=", email.toLowerCase())
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      lastLogin: result.lastLogin instanceof Date ? result.lastLogin.getTime() : undefined,
    } as unknown as Player;
  } catch (err) {
    logError(`Ошибка получения игрока по email: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}
