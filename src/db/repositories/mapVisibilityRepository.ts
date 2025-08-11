import { db } from "../connection";
import { error as logError } from "../../utils/logger";

export interface MapVisibility {
  id?: string;
  mapCellId: string;
  playerId: string;
  status: "seen" | "scouted" | "visited";
  firstSeenAt?: Date;
  lastSeenAt?: Date;
}

export async function createOrUpdate(params: {
  mapCellId: string;
  playerId: string;
  status: "seen" | "scouted" | "visited";
}): Promise<MapVisibility | null> {
  try {
    // Сначала пытаемся найти существующую запись
    const existing = await db
      .selectFrom("map_visibility")
      .select(["id", "status"])
      .where("map_cell_id", "=", params.mapCellId)
      .where("player_id", "=", params.playerId)
      .executeTakeFirst();

    if (existing) {
      // Обновляем существующую запись
      const result = await db
        .updateTable("map_visibility")
        .set({
          status: params.status,
          last_seen_at: new Date(),
        })
        .where("id", "=", existing.id)
        .returning([
          "id",
          "map_cell_id as mapCellId",
          "player_id as playerId",
          "status",
          "first_seen_at as firstSeenAt",
          "last_seen_at as lastSeenAt",
        ])
        .executeTakeFirst();

      return result as MapVisibility | null;
    } else {
      // Создаем новую запись
      const result = await db
        .insertInto("map_visibility")
        .values({
          map_cell_id: params.mapCellId,
          player_id: params.playerId,
          status: params.status,
        })
        .returning([
          "id",
          "map_cell_id as mapCellId",
          "player_id as playerId",
          "status",
          "first_seen_at as firstSeenAt",
          "last_seen_at as lastSeenAt",
        ])
        .executeTakeFirst();

      return result as MapVisibility | null;
    }
  } catch (err) {
    logError(`Ошибка создания/обновления видимости карты: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return null;
  }
}

export async function createOrUpdateBatch(
  cells: Array<{ mapCellId: string; playerId: string; status: "seen" | "scouted" | "visited" }>
): Promise<boolean> {
  try {
    // Используем транзакцию для пакетной обработки
    await db.transaction().execute(async (trx) => {
      for (const cell of cells) {
        // Проверяем существование записи
        const existing = await trx
          .selectFrom("map_visibility")
          .select(["id"])
          .where("map_cell_id", "=", cell.mapCellId)
          .where("player_id", "=", cell.playerId)
          .executeTakeFirst();

        if (existing) {
          // Обновляем
          await trx
            .updateTable("map_visibility")
            .set({
              status: cell.status,
              last_seen_at: new Date(),
            })
            .where("id", "=", existing.id)
            .execute();
        } else {
          // Создаем
          await trx
            .insertInto("map_visibility")
            .values({
              map_cell_id: cell.mapCellId,
              player_id: cell.playerId,
              status: cell.status,
            })
            .execute();
        }
      }
    });

    return true;
  } catch (err) {
    logError(`Ошибка пакетного создания/обновления видимости: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

export async function getByPlayerId(playerId: string): Promise<MapVisibility[]> {
  try {
    const results = await db
      .selectFrom("map_visibility")
      .select(["id", "map_cell_id as mapCellId", "player_id as playerId", "status", "first_seen_at as firstSeenAt", "last_seen_at as lastSeenAt"])
      .where("player_id", "=", playerId)
      .execute();

    return results as MapVisibility[];
  } catch (err) {
    logError(`Ошибка получения видимости карты для игрока: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

export async function getByMapCellId(mapCellId: string): Promise<MapVisibility[]> {
  try {
    const results = await db
      .selectFrom("map_visibility")
      .select(["id", "map_cell_id as mapCellId", "player_id as playerId", "status", "first_seen_at as firstSeenAt", "last_seen_at as lastSeenAt"])
      .where("map_cell_id", "=", mapCellId)
      .execute();

    return results as MapVisibility[];
  } catch (err) {
    logError(`Ошибка получения видимости карты для клетки: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}
