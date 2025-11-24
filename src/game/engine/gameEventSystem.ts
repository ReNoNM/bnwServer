import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { broadcast } from "../../network/socketHandler";
import * as gameSettingsRepository from "../../db/repositories/gameSettingsRepository";
import { CalendarState, CalendarSettings } from "../../db/models/gameSettings";
import { events, registerCronEvent, registerPeriodicEvent, unregisterEvent } from "./timeManager";
import { timeEventRepository } from "../../db/repositories";

let currentDate: CalendarState = {
  year: 1,
  month: 1,
  day: 1,
  lastUpdate: Date.now(),
};

let calendarSettings: CalendarSettings = {
  monthsPerYear: 12,
  daysPerMonth: 30,
  secondsPerDay: 30,
};

let cycleEventId: string | null = null;

/**
 * Инициализация игрового цикла
 */
export async function initializeGameCycle(): Promise<void> {
  try {
    log("Инициализация игрового цикла...");

    // Загружаем настройки из БД
    const settings = await gameSettingsRepository.getOrCreate();
    if (settings) {
      calendarSettings = settings.calendar;
      currentDate = settings.currentDate;
      log(`Загружены настройки календаря: ${JSON.stringify(calendarSettings)}`);
      log(`Текущая дата: Год ${currentDate.year}, Месяц ${currentDate.month}, День ${currentDate.day}`);
    }
    const gameCycleDayChange = await timeEventRepository.getById("gameCycleDayChange");
    console.log("🚀 ~ initializeGameCycle ~ gameCycleDayChange:", gameCycleDayChange);
    if (gameCycleDayChange) {
      cycleEventId = gameCycleDayChange.id;
    } else {
      cycleEventId = registerCronEvent({
        id: "gameCycleDayChange",
        name: "gameCycleDayChange",
        startAt: new Date("2025-11-24T09:00:00Z"),
        interval: calendarSettings.secondsPerDay,
        action: handleDayChange,
        persistent: true,
        metadata: {
          actionType: "gameCycleDayChange",
        },
      });
    }

    log("Игровой цикл инициализирован");
  } catch (err) {
    handleError(err as Error, "GameCycleManager.initialize");
  }
}

/**
 * Обработчик смены дня
 */
export async function handleDayChange(): Promise<void> {
  try {
    currentDate.day++;

    if (currentDate.day > calendarSettings.daysPerMonth) {
      currentDate.day = 1;
      currentDate.month++;

      if (currentDate.month > calendarSettings.monthsPerYear) {
        currentDate.month = 1;
        currentDate.year++;
      }
    }

    currentDate.lastUpdate = Date.now();
    await gameSettingsRepository.updateCurrentDate(currentDate);
    broadcast({
      action: "system/dateUpdateSuccess",
      data: {
        year: currentDate.year,
        month: currentDate.month,
        day: currentDate.day,
        timestamp: currentDate.lastUpdate,
        nextDayIn: calendarSettings.secondsPerDay,
        executeAt: events.get("gameCycleDayChange")?.executeAt,
      },
    });

    log(`Новая дата: Год ${currentDate.year}, Месяц ${currentDate.month}, День ${currentDate.day}`);
  } catch (err) {
    handleError(err as Error, "GameCycleManager.handleDayChange");
  }
}

/**
 * Получить текущую дату
 */
export function getCurrentDate(): CalendarState {
  return { ...currentDate };
}

/**
 * Получить настройки календаря
 */
export function getCalendarSettings(): CalendarSettings {
  return { ...calendarSettings };
}
