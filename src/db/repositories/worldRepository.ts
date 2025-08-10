import { db } from "../connection";
import { World } from "../models/world";
import { log, error as logError } from "../../utils/logger";

export async function getAll(): Promise<World[]> {
  try {
    const results = await db
      .selectFrom("worlds")
      .select([
        "id",
        "name",
        "size_x as sizeX",
        "size_y as sizeY",
        "world_type as worldType",
        "created_at as createdAt",
        "updated_at as updatedAt",
        "settings",
        "players",
        "is_open as isOpen",
      ])
      .execute();

    return results.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : 0,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0,
      players: Array.isArray(row.players) ? row.players : [],
    })) as World[];
  } catch (err) {
    logError(`Ошибка получения списка миров: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getById(id: string): Promise<World | undefined> {
  try {
    const result = await db
      .selectFrom("worlds")
      .select([
        "id",
        "name",
        "size_x as sizeX",
        "size_y as sizeY",
        "world_type as worldType",
        "created_at as createdAt",
        "updated_at as updatedAt",
        "settings",
        "players",
        "is_open as isOpen",
      ])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      updatedAt: result.updatedAt instanceof Date ? result.updatedAt.getTime() : 0,
      players: Array.isArray(result.players) ? result.players : [],
    } as World;
  } catch (err) {
    logError(`Ошибка получения мира по ID: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

export async function add(world: Omit<World, "id" | "createdAt" | "updatedAt">): Promise<World | undefined> {
  try {
    const result = await db
      .insertInto("worlds")
      .values({
        name: world.name,
        size_x: world.sizeX,
        size_y: world.sizeY,
        world_type: world.worldType,
        settings: world.settings || {},
      })
      .returning([
        "id",
        "name",
        "size_x as sizeX",
        "size_y as sizeY",
        "world_type as worldType",
        "created_at as createdAt",
        "updated_at as updatedAt",
        "settings",
        "players",
        "is_open as isOpen",
      ])
      .executeTakeFirst();

    if (!result) return undefined;

    const newWorld = {
      ...result,
      createdAt: result.createdAt instanceof Date ? result.createdAt.getTime() : 0,
      updatedAt: result.updatedAt instanceof Date ? result.updatedAt.getTime() : 0,
      players: Array.isArray(result.players) ? result.players : [],
    } as World;

    log(`Мир создан: ${newWorld.name} (${newWorld.id})`);
    return newWorld;
  } catch (err) {
    logError(`Ошибка создания мира: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

export async function setPlayersAndOpen(worldId: string, players: string[], isOpen: boolean): Promise<void> {
  try {
    await db
      .updateTable("worlds")
      .set({
        players,
        is_open: isOpen,
        updated_at: new Date(),
      })
      .where("id", "=", worldId)
      .executeTakeFirst();
  } catch (err) {}
}
