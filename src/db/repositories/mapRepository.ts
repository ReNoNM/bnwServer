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
