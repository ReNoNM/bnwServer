// src/db/repositories/gameSettingsRepository.ts
import { db } from "../connection";
import { log, error as logError } from "../../utils/logger";
import { GameSettings, DEFAULT_CALENDAR_SETTINGS, INITIAL_CALENDAR_STATE, CalendarSettings, CalendarState } from "../models/gameSettings";

const SETTINGS_ID = "global";

/**
 * Получить настройки игры
 */
export async function getSettings(): Promise<GameSettings | null> {
  try {
    const result = await db.selectFrom("game_settings").selectAll().where("id", "=", SETTINGS_ID).executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      calendar: typeof result.calendar === "string" ? JSON.parse(result.calendar) : result.calendar,
      currentDate: typeof result.date_state === "string" ? JSON.parse(result.date_state) : result.date_state,
      createdAt: new Date(result.created_at || ""),
      updatedAt: new Date(result.updated_at || ""),
    } as GameSettings;
  } catch (err) {
    logError(`Ошибка получения настроек игры: ${err}`);
    return null;
  }
}

/**
 * Создать начальные настройки игры
 */
export async function createDefault(): Promise<GameSettings | null> {
  try {
    const result = await db
      .insertInto("game_settings")
      .values({
        id: SETTINGS_ID,
        calendar: JSON.stringify(DEFAULT_CALENDAR_SETTINGS),
        date_state: JSON.stringify(INITIAL_CALENDAR_STATE),
      })
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    log("Созданы начальные настройки игры");

    return {
      ...result,
      calendar: typeof result.calendar === "string" ? JSON.parse(result.calendar) : result.calendar,
      currentDate: typeof result.date_state === "string" ? JSON.parse(result.date_state) : result.date_state,
      createdAt: new Date(result.created_at || ""),
      updatedAt: new Date(result.updated_at || ""),
    } as GameSettings;
  } catch (err) {
    logError(`Ошибка создания настроек игры: ${err}`);
    return null;
  }
}

/**
 * Обновить настройки календаря
 */
export async function updateCalendarSettings(settings: CalendarSettings): Promise<boolean> {
  try {
    const result = await db
      .updateTable("game_settings")
      .set({
        calendar: JSON.stringify(settings),
        updated_at: new Date(),
      })
      .where("id", "=", SETTINGS_ID)
      .executeTakeFirst();

    log(`Настройки календаря обновлены: ${JSON.stringify(settings)}`);
    return !!result;
  } catch (err) {
    logError(`Ошибка обновления настроек календаря: ${err}`);
    return false;
  }
}

/**
 * Обновить текущую дату
 */
export async function updateCurrentDate(date: CalendarState): Promise<boolean> {
  try {
    const result = await db
      .updateTable("game_settings")
      .set({
        date_state: JSON.stringify(date),
        updated_at: new Date(),
      })
      .where("id", "=", SETTINGS_ID)
      .executeTakeFirst();

    return !!result;
  } catch (err) {
    logError(`Ошибка обновления текущей даты: ${err}`);
    return false;
  }
}

/**
 * Получить или создать настройки
 */
export async function getOrCreate(): Promise<GameSettings | null> {
  let settings = await getSettings();
  if (!settings) {
    settings = await createDefault();
  }
  return settings;
}
