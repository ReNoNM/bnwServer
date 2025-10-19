import { db } from "../connection";
import { MapTile, MapTileWithVisibility } from "../models/mapTile";
import { log, error as logError } from "../../utils/logger";

export async function getByWorldId(worldId: string): Promise<MapTile[]> {
  try {
    const results = await db
      .selectFrom("map")
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
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
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
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

export async function getTileById(tileId: string): Promise<MapTile | undefined> {
  try {
    const result = await db
      .selectFrom("map")
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
      .where("id", "=", tileId)
      .executeTakeFirst();

    return result as MapTile | undefined;
  } catch (err) {
    logError(`Ошибка получения тайла: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

export async function searchCapitalByPlayerId(worldId: string, playerId: string): Promise<MapTile | undefined> {
  try {
    const result = await db
      .selectFrom("map")
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
      .where("world_id", "=", worldId)
      .where("is_capital", "=", true)
      .where("owner_player_id", "=", playerId)
      .executeTakeFirst();
    console.log(result);
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
export async function getRegionForPlayer(
  worldId: string,
  playerId: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Promise<MapTileWithVisibility[]> {
  try {
    const rows = await db
      .selectFrom("map as m")
      .leftJoin("map_visibility as mv", (join) => join.onRef("mv.map_cell_id", "=", "m.id").on("mv.player_id", "=", playerId))
      .select((eb) => [
        "m.id as id",
        "m.world_id as worldId",
        "m.x as x",
        "m.y as y",
        eb.fn.coalesce(eb.ref("mv.status"), eb.val("notVisible")).as("status"),
        "m.type as type",
        "m.type_id as typeId",
        "m.label as label",
        "m.metadata as metadata",
        "m.is_capital as isCapital",
        "m.owner_player_id as ownerPlayerId",
        "m.building_id as buildingId",
      ])
      .where("m.world_id", "=", worldId)
      .where("m.x", ">=", startX)
      .where("m.x", "<=", endX)
      .where("m.y", ">=", startY)
      .where("m.y", "<=", endY)
      .orderBy("m.y")
      .orderBy("m.x")
      .execute();

    // Приводим строки к дискриминированному union
    const tiles: MapTileWithVisibility[] = rows.map((r: any) => {
      if (r.status === "notVisible") {
        const { id, worldId, x, y, status } = r;
        return { id, worldId, x, y, status };
      }
      const { id, worldId, x, y, status, type, typeId, label, metadata, isCapital, ownerPlayerId, buildingId } = r;
      return {
        id,
        worldId,
        x,
        y,
        status,
        type,
        typeId,
        label,
        metadata,
        isCapital,
        ownerPlayerId,
        buildingId,
      };
    });

    return tiles;
  } catch (err) {
    logError(`Ошибка получения области карты (с видимостью): ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}
export async function getRegion(worldId: string, startX: number, startY: number, endX: number, endY: number): Promise<MapTile[]> {
  try {
    const results = await db
      .selectFrom("map")
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
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
      .select([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
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

export async function updateTile(
  worldId: string,
  x: number,
  y: number,
  updates: {
    ownerPlayerId?: string | null;
    isCapital?: boolean;
    buildingId?: string | null;
  }
): Promise<MapTile | null> {
  try {
    const updateValues: Record<string, any> = {};

    if (updates.ownerPlayerId !== undefined) {
      updateValues.owner_player_id = updates.ownerPlayerId;
    }
    if (updates.isCapital !== undefined) {
      updateValues.is_capital = updates.isCapital;
    }
    if (updates.buildingId !== undefined) {
      updateValues.building_id = updates.buildingId;
    }

    const result = await db
      .updateTable("map")
      .set(updateValues)
      .where("world_id", "=", worldId)
      .where("x", "=", x)
      .where("y", "=", y)
      .returning([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
      .executeTakeFirst();

    return result as MapTile | null;
  } catch (err) {
    logError(`Ошибка обновления тайла: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return null;
  }
}

export async function updateTileById(
  cellId: string,
  updates: {
    ownerPlayerId?: string | null;
    isCapital?: boolean;
    buildingId?: string | null;
  }
): Promise<MapTile | null> {
  try {
    const updateValues: Record<string, any> = {};

    if (updates.ownerPlayerId !== undefined) {
      updateValues.owner_player_id = updates.ownerPlayerId;
    }
    if (updates.isCapital !== undefined) {
      updateValues.is_capital = updates.isCapital;
    }
    if (updates.buildingId !== undefined) {
      updateValues.building_id = updates.buildingId;
    }

    const result = await db
      .updateTable("map")
      .set(updateValues)
      .where("id", "=", cellId)
      .returning([
        "id",
        "world_id as worldId",
        "x",
        "y",
        "type",
        "type_id as typeId",
        "label",
        "metadata",
        "is_capital as isCapital",
        "owner_player_id as ownerPlayerId",
        "building_id as buildingId",
      ])
      .executeTakeFirst();

    return result as MapTile | null;
  } catch (err) {
    logError(`Ошибка обновления тайла: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return null;
  }
}

export async function updateTilesBatch(
  updates: Array<{
    worldId: string;
    x: number;
    y: number;
    ownerPlayerId?: string | null;
    isCapital?: boolean;
    buildingId?: string | null;
  }>
): Promise<boolean> {
  try {
    await db.transaction().execute(async (trx) => {
      for (const update of updates) {
        const updateValues: Record<string, any> = {};

        if (update.ownerPlayerId !== undefined) {
          updateValues.owner_player_id = update.ownerPlayerId;
        }
        if (update.isCapital !== undefined) {
          updateValues.is_capital = update.isCapital;
        }
        if (update.buildingId !== undefined) {
          updateValues.building_id = update.buildingId;
        }

        await trx
          .updateTable("map")
          .set(updateValues)
          .where("world_id", "=", update.worldId)
          .where("x", "=", update.x)
          .where("y", "=", update.y)
          .execute();
      }
    });

    return true;
  } catch (err) {
    logError(`Ошибка пакетного обновления тайлов: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}
