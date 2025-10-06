import { db } from "../connection";
import { error as logError } from "../../utils/logger";
import { Building } from "../models/building";

export async function create(params: {
  mapCellId: string;
  ownerPlayerId: string;
  type: string;
  level?: number;
  data?: Record<string, any>;
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
