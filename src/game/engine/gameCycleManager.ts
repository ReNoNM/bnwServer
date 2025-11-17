import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { broadcast } from "../../network/socketHandler";
import * as gameSettingsRepository from "../../db/repositories/gameSettingsRepository";
import { CalendarState, CalendarSettings } from "../../db/models/gameSettings";
import { registerPeriodicEvent, unregisterEvent } from "./timeManager";

// Состояние игрового календаря
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
let saveInterval: NodeJS.Timeout | null = null;

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

    // Регистрируем периодическое событие смены дня
    cycleEventId = registerPeriodicEvent({
      name: "gameCycleDayChange",
      interval: calendarSettings.secondsPerDay,
      action: handleDayChange,
      persistent: true,
      metadata: {
        type: "gameCalendar",
      },
    });

    // Запускаем периодическое сохранение (каждые 30 секунд)
    startPeriodicSave();

    log("Игровой цикл инициализирован");
  } catch (err) {
    handleError(err as Error, "GameCycleManager.initialize");
  }
}

/**
 * Обработчик смены дня
 */
async function handleDayChange(): Promise<void> {
  try {
    // Увеличиваем день
    currentDate.day++;

    // Проверяем переход на следующий месяц
    if (currentDate.day > calendarSettings.daysPerMonth) {
      currentDate.day = 1;
      currentDate.month++;

      // Проверяем переход на следующий год
      if (currentDate.month > calendarSettings.monthsPerYear) {
        currentDate.month = 1;
        currentDate.year++;
      }
    }

    currentDate.lastUpdate = Date.now();

    // Отправляем обновление всем клиентам
    broadcast({
      action: "game/dateUpdate",
      data: {
        year: currentDate.year,
        month: currentDate.month,
        day: currentDate.day,
        timestamp: currentDate.lastUpdate,
        nextDayIn: calendarSettings.secondsPerDay,
      },
    });

    log(`Новая дата: Год ${currentDate.year}, Месяц ${currentDate.month}, День ${currentDate.day}`);
  } catch (err) {
    handleError(err as Error, "GameCycleManager.handleDayChange");
  }
}

/**
 * Периодическое сохранение состояния в БД
 */
function startPeriodicSave(): void {
  saveInterval = setInterval(async () => {
    try {
      await gameSettingsRepository.updateCurrentDate(currentDate);
    } catch (err) {
      handleError(err as Error, "GameCycleManager.periodicSave");
    }
  }, 30000); // каждые 30 секунд
}

/**
 * Остановка игрового цикла
 */
export async function stopGameCycle(): Promise<void> {
  try {
    // Останавливаем периодическое событие
    if (cycleEventId) {
      unregisterEvent(cycleEventId);
      cycleEventId = null;
    }

    // Останавливаем сохранение
    if (saveInterval) {
      clearInterval(saveInterval);
      saveInterval = null;
    }

    // Финальное сохранение
    await gameSettingsRepository.updateCurrentDate(currentDate);

    log("Игровой цикл остановлен");
  } catch (err) {
    handleError(err as Error, "GameCycleManager.stop");
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

/**
 * Обновить настройки календаря (требует перезапуска цикла)
 */
export async function updateCalendarSettings(newSettings: CalendarSettings): Promise<boolean> {
  try {
    // Сохраняем в БД
    const success = await gameSettingsRepository.updateCalendarSettings(newSettings);
    if (!success) return false;

    // Обновляем локальные настройки
    calendarSettings = { ...newSettings };

    // Перезапускаем цикл с новым интервалом
    if (cycleEventId) {
      unregisterEvent(cycleEventId);
      cycleEventId = registerPeriodicEvent({
        name: "gameCycleDayChange",
        interval: calendarSettings.secondsPerDay,
        action: handleDayChange,
        persistent: true,
        metadata: {
          type: "gameCalendar",
        },
      });
    }

    log(`Настройки календаря обновлены: ${JSON.stringify(newSettings)}`);
    return true;
  } catch (err) {
    handleError(err as Error, "GameCycleManager.updateSettings");
    return false;
  }
}

/**
 * Установить дату вручную (для админов/тестирования)
 */
export async function setDate(year: number, month: number, day: number): Promise<boolean> {
  try {
    // Валидация
    if (year < 1 || month < 1 || month > calendarSettings.monthsPerYear || day < 1 || day > calendarSettings.daysPerMonth) {
      logError("Некорректная дата");
      return false;
    }

    currentDate = {
      year,
      month,
      day,
      lastUpdate: Date.now(),
    };

    await gameSettingsRepository.updateCurrentDate(currentDate);

    log(`Дата установлена вручную: Год ${year}, Месяц ${month}, День ${day}`);
    return true;
  } catch (err) {
    handleError(err as Error, "GameCycleManager.setDate");
    return false;
  }
}

/**
 * Получить статистику игрового цикла
 */
export function getGameCycleStats(): any {
  return {
    currentDate: { ...currentDate },
    calendarSettings: { ...calendarSettings },
    isRunning: cycleEventId !== null,
    totalDays:
      (currentDate.year - 1) * calendarSettings.monthsPerYear * calendarSettings.daysPerMonth +
      (currentDate.month - 1) * calendarSettings.daysPerMonth +
      currentDate.day,
  };
}
