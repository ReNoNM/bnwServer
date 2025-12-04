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

export let calendarSettings: CalendarSettings = {
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

      const now = Date.now();
      const durationMs = calendarSettings.secondsPerDay * 1000;
      const timeSinceLastUpdate = now - currentDate.lastUpdate;

      // Если с момента последнего обновления прошло больше времени, чем длится день
      if (timeSinceLastUpdate >= durationMs) {
        // Считаем, сколько полных циклов прошло
        const skippedCycles = Math.floor(timeSinceLastUpdate / durationMs);

        if (skippedCycles > 0) {
          log(`Обнаружен простой сервера (${skippedCycles} циклов). Синхронизация таймера без изменения даты...`);

          // Просто сдвигаем lastUpdate вперед на количество пропущенных циклов.
          // Это делает так, что текущий момент (now) оказывается внутри "текущего" цикла.
          currentDate.lastUpdate += skippedCycles * durationMs;

          // ВАЖНО: Мы НЕ меняем currentDate.day/month/year

          // Сохраняем обновленный timestamp в БД, чтобы клиент получил корректный startTime
          await gameSettingsRepository.updateCurrentDate(currentDate);
        }
      }

      log(`Загружены настройки календаря: ${JSON.stringify(calendarSettings)}`);
      log(`Текущая дата: Год ${currentDate.year}, Месяц ${currentDate.month}, День ${currentDate.day}`);
    }
    const gameCycleDayChange = await timeEventRepository.getById("gameCycleDayChange");
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
    // 1. Обновляем дату
    currentDate.day++;

    if (currentDate.day > calendarSettings.daysPerMonth) {
      currentDate.day = 1;
      currentDate.month++;

      if (currentDate.month > calendarSettings.monthsPerYear) {
        currentDate.month = 1;
        currentDate.year++;
      }
    }

    // 2. Фиксируем момент начала нового дня (startTime)
    const now = Date.now();
    currentDate.lastUpdate = now;

    // 3. Вычисляем длительность текущего дня в мс
    const durationMs = calendarSettings.secondsPerDay * 1000;

    // Сохраняем в БД
    await gameSettingsRepository.updateCurrentDate(currentDate);

    // 4. Отправляем в удобном формате (Start + Duration)
    broadcast({
      action: "system/dateUpdateSuccess",
      data: {
        year: currentDate.year,
        month: currentDate.month,
        day: currentDate.day,

        // Поля для прогресс-бара:
        startTime: now, // Когда этот день начался
        duration: durationMs, // Сколько он длится
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
