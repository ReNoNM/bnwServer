import { db } from "../connection";
import { error as logError } from "../../utils/logger";
import { Unit } from "../models/unit";

export async function create(params: {
  ownerPlayerId: string;
  worldId: string;
  x: number;
  y: number;
  name: string;
  inventoryId?: string;
  data?: Record<string, any>;
}): Promise<Unit | null> {
  try {
    const result = await db
      .insertInto("units")
      .values({
        owner_player_id: params.ownerPlayerId,
        world_id: params.worldId,
        x: params.x,
        y: params.y,
        name: params.name,
        inventory_id: params.inventoryId || null,
        data: params.data || {},
      })
      .returning([
        "id",
        "owner_player_id as ownerPlayerId",
        "world_id as worldId",
        "x",
        "y",
        "name",
        "inventory_id as inventoryId",
        "data",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      createdAt: Number(result.createdAt),
      updatedAt: Number(result.updatedAt),
    } as Unit;
  } catch (err) {
    logError(`unitRepository.create error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export async function getById(id: string): Promise<Unit | null> {
  try {
    const result = await db
      .selectFrom("units")
      .select([
        "id",
        "owner_player_id as ownerPlayerId",
        "world_id as worldId",
        "x",
        "y",
        "name",
        "inventory_id as inventoryId",
        "data",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("id", "=", id)
      .executeTakeFirst();

    return result
      ? ({
          ...result,
          createdAt: Number(result.createdAt),
          updatedAt: Number(result.updatedAt),
        } as Unit)
      : null;
  } catch (err) {
    logError(`unitRepository.getById error: ${err}`);
    return null;
  }
}

/**
 * Получить юнитов в заданной области (для отрисовки на карте)
 */
export async function getByRegion(worldId: string, startX: number, startY: number, endX: number, endY: number): Promise<Unit[]> {
  try {
    const results = await db
      .selectFrom("units")
      .select([
        "id",
        "owner_player_id as ownerPlayerId",
        "world_id as worldId",
        "x",
        "y",
        "name",
        "inventory_id as inventoryId",
        "data",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("world_id", "=", worldId)
      .where("x", ">=", startX)
      .where("x", "<=", endX)
      .where("y", ">=", startY)
      .where("y", "<=", endY)
      .execute();

    return results.map((r) => ({
      ...r,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    })) as Unit[];
  } catch (err) {
    logError(`unitRepository.getByRegion error: ${err}`);
    return [];
  }
}

export async function getByOwner(ownerId: string, worldId: string): Promise<Unit[]> {
  try {
    const results = await db
      .selectFrom("units")
      .select([
        "id",
        "owner_player_id as ownerPlayerId",
        "world_id as worldId",
        "x",
        "y",
        "name",
        "inventory_id as inventoryId",
        "data",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("owner_player_id", "=", ownerId)
      .where("world_id", "=", worldId)
      .execute();

    return results.map((r) => ({
      ...r,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    })) as Unit[];
  } catch (err) {
    logError(`unitRepository.getByOwner error: ${err}`);
    return [];
  }
}
