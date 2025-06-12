import { db } from "../connection";
import { MapTile } from "../models/mapTile";
import { log, error as logError } from "../../utils/logger";

export async function getByWorldId(worldId: string): Promise<MapTile[]> {
  try {
    const results = await db
      .selectFrom("map")
      .select(["id", "world_id as worldId", "x", "y", "type", "type_id as typeId", "label", "metadata"])
      .where("world_id", "=", worldId)
      .orderBy("y")
      .orderBy("x")
      .execute();

    return results as MapTile[];
  } catch (err) {
    logError(`Ошибка получения карты мира: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getTile(worldId: string, x: number, y: number): Promise<MapTile | undefined> {
  try {
    const result = await db
      .selectFrom("map")
      .select(["id", "world_id as worldId", "x", "y", "type", "type_id as typeId", "label", "metadata"])
      .where("world_id", "=", worldId)
      .where("x", "=", x)
      .where("y", "=", y)
      .executeTakeFirst();

    return result as MapTile | undefined;
  } catch (err) {
    logError(`Ошибка получения тайла: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

export async function addTiles(tiles: Omit<MapTile, "id">[]): Promise<boolean> {
  try {
    await db
      .insertInto("map")
      .values(
        tiles.map((tile) => ({
          world_id: tile.worldId,
          x: tile.x,
          y: tile.y,
          type: tile.type,
          type_id: tile.typeId,
          label: tile.label,
          metadata: tile.metadata || {},
        }))
      )
      .execute();

    log(`Добавлено ${tiles.length} тайлов на карту`);
    return true;
  } catch (err) {
    logError(`Ошибка добавления тайлов: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}
export async function getRegion(worldId: string, startX: number, startY: number, endX: number, endY: number): Promise<MapTile[]> {
  try {
    const results = await db
      .selectFrom("map")
      .select(["id", "world_id as worldId", "x", "y", "type", "type_id as typeId", "label", "metadata"])
      .where("world_id", "=", worldId)
      .where("x", ">=", startX)
      .where("x", "<=", endX)
      .where("y", ">=", startY)
      .where("y", "<=", endY)
      .orderBy("y")
      .orderBy("x")
      .execute();

    return results as MapTile[];
  } catch (err) {
    logError(`Ошибка получения области карты: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Получение конкретных тайлов по координатам
export async function getTilesByCoordinates(worldId: string, coordinates: { x: number; y: number }[]): Promise<MapTile[]> {
  try {
    if (coordinates.length === 0) {
      return [];
    }

    // Строим запрос с множественными условиями OR
    let query = db
      .selectFrom("map")
      .select(["id", "world_id as worldId", "x", "y", "type", "type_id as typeId", "label", "metadata"])
      .where("world_id", "=", worldId);

    // Добавляем условия для каждой координаты
    query = query.where((eb) => {
      const conditions = coordinates.map((coord) => eb.and([eb("x", "=", coord.x), eb("y", "=", coord.y)]));
      return eb.or(conditions);
    });

    const results = await query.orderBy("y").orderBy("x").execute();

    return results as MapTile[];
  } catch (err) {
    logError(`Ошибка получения тайлов по координатам: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}
