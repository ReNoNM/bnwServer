import { db } from "../connection";
import { error as logError } from "../../utils/logger";
import { Building } from "../models/building";

export async function create(params: {
  mapCellId: string;
  ownerPlayerId: string;
  type: string;
  level?: number;
  data?: Record<string, any>;
  inventoryId?: string | null;
}): Promise<Building | null> {
  try {
    const result = await db
      .insertInto("buildings")
      .values({
        map_cell_id: params.mapCellId,
        owner_player_id: params.ownerPlayerId,
        type: params.type,
        level: params.level || 1,
        data: params.data || {},
        inventory_id: params.inventoryId || null,
      })
      .returning([
        "id",
        "map_cell_id as mapCellId",
        "owner_player_id as ownerPlayerId",
        "type",
        "level",
        "data",
        "created_at as createdAt",
        "updated_at as updatedAt",
        "inventory_id as inventoryId",
      ])
      .executeTakeFirst();

    if (!result) return null;

    return result as Building;
  } catch (err) {
    logError(`Ошибка создания здания: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return null;
  }
}

export async function getByMapCellId(mapCellId: string): Promise<Building | null> {
  try {
    const result = await db
      .selectFrom("buildings")
      .select([
        "id",
        "map_cell_id as mapCellId",
        "owner_player_id as ownerPlayerId",
        "type",
        "level",
        "data",
        "inventory_id as inventoryId",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("map_cell_id", "=", mapCellId)
      .executeTakeFirst();

    if (!result) return null;

    return result as Building;
  } catch (err) {
    logError(`Ошибка получения здания: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return null;
  }
}

export async function getByMapCellIds(mapCellIds: string[]): Promise<Building[]> {
  try {
    if (mapCellIds.length) {
      const results = await db
        .selectFrom("buildings")
        .select([
          "id",
          "map_cell_id as mapCellId",
          "owner_player_id as ownerPlayerId",
          "type",
          "level",
          "data",
          "inventory_id as inventoryId",
          "created_at as createdAt",
          "updated_at as updatedAt",
        ])
        .where("map_cell_id", "in", mapCellIds)
        .execute();

      return results as Building[];
    } else {
      return [];
    }
  } catch (err) {
    logError(`Ошибка получения зданий: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getByOwnerPlayerId(ownerPlayerId: string): Promise<Building[]> {
  try {
    const results = await db
      .selectFrom("buildings")
      .select([
        "id",
        "map_cell_id as mapCellId",
        "owner_player_id as ownerPlayerId",
        "type",
        "level",
        "data",
        "inventory_id as inventoryId",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("owner_player_id", "=", ownerPlayerId)
      .execute();

    return results as Building[];
  } catch (err) {
    logError(`Ошибка получения зданий игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getByBuildId(buildId: string): Promise<Building[]> {
  try {
    const results = await db
      .selectFrom("buildings")
      .select([
        "id",
        "map_cell_id as mapCellId",
        "owner_player_id as ownerPlayerId",
        "type",
        "level",
        "data",
        "inventory_id as inventoryId",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("id", "=", buildId)
      .execute();

    return results as Building[];
  } catch (err) {
    logError(`Ошибка получения здания по id: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getByInventoryIdAndOwner(inventoryId: string, ownerPlayerId: string): Promise<Building | null> {
  try {
    const result = await db
      .selectFrom("buildings")
      .select([
        "id",
        "map_cell_id as mapCellId",
        "owner_player_id as ownerPlayerId",
        "type",
        "level",
        "data",
        "inventory_id as inventoryId",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("inventory_id", "=", inventoryId)
      .where("owner_player_id", "=", ownerPlayerId)
      .executeTakeFirst();

    return (result as Building) || null;
  } catch (err) {
    logError(`buildingRepository.getByInventoryIdAndOwner error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export async function updateData(id: string, data: Record<string, any>): Promise<boolean> {
  try {
    const result = await db
      .updateTable("buildings")
      .set({
        data: JSON.stringify(data),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  } catch (err) {
    logError(`Ошибка обновления данных здания: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

export async function countByPlayerAndType(playerId: string, type: string): Promise<number> {
  try {
    const result = await db
      .selectFrom("buildings")
      .select(({ fn }) => [fn.count("id").as("count")])
      .where("owner_player_id", "=", playerId)
      .where("type", "=", type)
      .executeTakeFirst();

    return Number(result?.count || 0);
  } catch (err) {
    logError(`buildingRepository.countByPlayerAndType error: ${err}`);
    return 0;
  }
}
