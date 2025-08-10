import { db } from "../connection";
import { error as logError } from "../../utils/logger";

export interface SpawnPointsOffer {
  id: string;
  playerId: string;
  worldId: string;
  points: Array<{ x: number; y: number }>;
  createdAt: string | Date;
  consumed: boolean;
}

export async function create(params: {
  playerId: string;
  worldId: string;
  points: Array<{ x: number; y: number }>;
}): Promise<SpawnPointsOffer | null> {
  try {
    // держим один активный оффер на игрока
    await db.deleteFrom("spawn_points_offers").where("player_id", "=", params.playerId).where("consumed", "=", false).execute();

    const row = await db
      .insertInto("spawn_points_offers")
      .values({
        player_id: params.playerId,
        world_id: params.worldId,
        points: JSON.stringify(params.points),
      })
      .returning(["id", "player_id as playerId", "world_id as worldId", "points", "created_at as createdAt", "consumed"])
      .executeTakeFirst();

    if (!row) return null;

    return {
      ...row,
      points: Array.isArray(row.points) ? (row.points as any) : JSON.parse(row.points as unknown as string),
    } as SpawnPointsOffer;
  } catch (err) {
    logError(`spawnPointsOffer.create error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export async function getActiveById(id: string, playerId: string): Promise<SpawnPointsOffer | null> {
  try {
    const row = await db
      .selectFrom("spawn_points_offers")
      .select(["id", "player_id as playerId", "world_id as worldId", "points", "created_at as createdAt", "consumed"])
      .where("id", "=", id)
      .where("player_id", "=", playerId)
      .where("consumed", "=", false)
      .executeTakeFirst();

    if (!row) return null;

    return {
      ...row,
      points: Array.isArray(row.points) ? (row.points as any) : JSON.parse(row.points as unknown as string),
    } as SpawnPointsOffer;
  } catch (err) {
    logError(`spawnPointsOffer.getActiveById error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export async function consume(id: string): Promise<boolean> {
  try {
    const res = await db
      .updateTable("spawn_points_offers")
      .set({ consumed: true })
      .where("id", "=", id)
      .where("consumed", "=", false)
      .executeTakeFirst();
    return !!res;
  } catch (err) {
    logError(`spawnPointsOffer.consume error: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}
export async function getActiveForPlayer(playerId: string, worldId?: string) {
  try {
    let q = db
      .selectFrom("spawn_points_offers")
      .select(["id", "player_id as playerId", "world_id as worldId", "points", "created_at as createdAt", "consumed"])
      .where("player_id", "=", playerId)
      .where("consumed", "=", false);

    if (worldId) q = q.where("world_id", "=", worldId);

    const row = await q.orderBy("created_at", "desc").limit(1).executeTakeFirst();

    if (!row) return null;

    return {
      ...row,
      points: Array.isArray(row.points) ? (row.points as any) : JSON.parse(row.points as unknown as string),
    };
  } catch {
    return null;
  }
}

export async function getActivePointsByWorld(worldId: string): Promise<Array<{ x: number; y: number }>> {
  try {
    const rows = await db
      .selectFrom("spawn_points_offers")
      .select(["points"])
      .where("world_id", "=", worldId)
      .where("consumed", "=", false)
      .execute();

    const all: Array<{ x: number; y: number }> = [];
    for (const r of rows) {
      const pts = Array.isArray(r.points) ? (r.points as any) : JSON.parse(r.points as unknown as string);
      if (Array.isArray(pts)) all.push(...pts);
    }
    return all;
  } catch {
    return [];
  }
}
