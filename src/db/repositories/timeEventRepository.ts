import { db } from "../connection";
import { TimeEvent, TimeEventDTO } from "../models/timeEvent";
import { log, error as logError } from "../../utils/logger";

/**
 * Создать новое событие
 */
export async function create(event: TimeEventDTO): Promise<TimeEvent | null> {
  try {
    const result = await db
      .insertInto("time_events")
      .values({
        ...event,
        metadata: JSON.stringify(event.metadata || {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

    if (result) {
      result.metadata = JSON.parse((result.metadata as any) || "{}");
    }

    return result as TimeEvent | null;
  } catch (err) {
    logError(`Ошибка создания события: ${err}`);
    return null;
  }
}

/**
 * Получить все активные события
 */
export async function getActive(): Promise<TimeEvent[]> {
  try {
    const results = await db.selectFrom("time_events").selectAll().where("status", "=", "active").execute();

    return results.map((r) => ({
      ...r,
      metadata: JSON.parse((r.metadata as any) || "{}"),
    })) as TimeEvent[];
  } catch (err) {
    logError(`Ошибка получения активных событий: ${err}`);
    return [];
  }
}

/**
 * Получить все приостановленные события
 */
export async function getPaused(): Promise<TimeEvent[]> {
  try {
    const results = await db.selectFrom("time_events").selectAll().where("status", "=", "paused").execute();

    return results.map((r) => ({
      ...r,
      metadata: JSON.parse((r.metadata as any) || "{}"),
    })) as TimeEvent[];
  } catch (err) {
    logError(`Ошибка получения приостановленных событий: ${err}`);
    return [];
  }
}

/**
 * Обновить статус события
 */
export async function updateStatus(
  eventId: string,
  status: "active" | "paused" | "completed" | "cancelled",
  additionalData?: Partial<TimeEvent>
): Promise<boolean> {
  try {
    const result = await db
      .updateTable("time_events")
      .set({
        status,
        ...additionalData,
        updated_at: new Date(),
      })
      .where("id", "=", eventId)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (err) {
    logError(`Ошибка обновления статуса события: ${err}`);
    return false;
  }
}

/**
 * Поставить событие на паузу
 */
export async function pauseEvent(eventId: string): Promise<boolean> {
  try {
    const event = await db.selectFrom("time_events").selectAll().where("id", "=", eventId).where("status", "=", "active").executeTakeFirst();

    if (!event || !event.execute_at) {
      return false;
    }

    const now = new Date();
    const executeAt = new Date(event.execute_at);
    const remainingTime = executeAt.getTime() - now.getTime();

    if (remainingTime <= 0) {
      return false; // Событие уже должно было выполниться
    }

    const result = await db
      .updateTable("time_events")
      .set({
        status: "paused",
        paused_at: now,
        remaining_time: remainingTime,
        updated_at: now,
      })
      .where("id", "=", eventId)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (err) {
    logError(`Ошибка приостановки события: ${err}`);
    return false;
  }
}

/**
 * Возобновить событие
 */
export async function resumeEvent(eventId: string): Promise<boolean> {
  try {
    const event = await db.selectFrom("time_events").selectAll().where("id", "=", eventId).where("status", "=", "paused").executeTakeFirst();

    if (!event || !event.remaining_time) {
      return false;
    }

    const now = new Date();
    const newExecuteAt = new Date(now.getTime() + Number(event.remaining_time));

    const result = await db
      .updateTable("time_events")
      .set({
        status: "active",
        execute_at: newExecuteAt,
        paused_at: null,
        remaining_time: null,
        updated_at: now,
      })
      .where("id", "=", eventId)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (err) {
    logError(`Ошибка возобновления события: ${err}`);
    return false;
  }
}

/**
 * Изменить время выполнения события
 */
export async function updateExecuteTime(eventId: string, newExecuteAt: Date): Promise<boolean> {
  try {
    const result = await db
      .updateTable("time_events")
      .set({
        execute_at: newExecuteAt,
        updated_at: new Date(),
      })
      .where("id", "=", eventId)
      .where("status", "=", "active")
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (err) {
    logError(`Ошибка изменения времени события: ${err}`);
    return false;
  }
}

/**
 * Получить событие по ID
 */
export async function getById(eventId: string): Promise<TimeEvent | null> {
  try {
    const result = await db.selectFrom("time_events").selectAll().where("id", "=", eventId).executeTakeFirst();

    if (result) {
      result.metadata = JSON.parse((result.metadata as any) || "{}");
    }

    return result as TimeEvent | null;
  } catch (err) {
    logError(`Ошибка получения события: ${err}`);
    return null;
  }
}

/**
 * Получить события игрока
 */
export async function getByPlayerId(playerId: string): Promise<TimeEvent[]> {
  try {
    const results = await db
      .selectFrom("time_events")
      .selectAll()
      .where("player_id", "=", playerId)
      .where("status", "in", ["active", "paused"])
      .execute();

    return results.map((r) => ({
      ...r,
      metadata: JSON.parse((r.metadata as any) || "{}"),
    })) as TimeEvent[];
  } catch (err) {
    logError(`Ошибка получения событий игрока: ${err}`);
    return [];
  }
}

/**
 * Удалить завершенные события старше N дней
 */
export async function cleanupOldEvents(daysOld: number = 7): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .deleteFrom("time_events")
      .where("status", "in", ["completed", "cancelled"])
      .where("updated_at", "<", cutoffDate)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  } catch (err) {
    logError(`Ошибка очистки старых событий: ${err}`);
    return 0;
  }
}

/**
 * Пакетное обновление статуса событий
 */
export async function batchUpdateStatus(eventIds: string[], status: "completed" | "cancelled"): Promise<boolean> {
  try {
    const result = await db
      .updateTable("time_events")
      .set({
        status,
        updated_at: new Date(),
      })
      .where("id", "in", eventIds)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (err) {
    logError(`Ошибка пакетного обновления событий: ${err}`);
    return false;
  }
}
