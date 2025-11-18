import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { handleError } from "../../utils/errorHandler";
import { log } from "../../utils/logger";
import {
  getTimeManagerStats,
  registerOnceEvent,
  registerCronEvent,
  getPlayerEvents,
  pauseEvent,
  resumeEvent,
  unregisterEvent,
} from "../../game/engine/timeManager";
import { getCurrentDate, getCalendarSettings, updateCalendarSettings, setDate, getGameCycleStats } from "../../game/engine/gameCycleManager";

/**
 * Получение текущей даты игрового календаря
 */
async function handleGetDate(ws: WebSocket): Promise<void> {
  try {
    const date = getCurrentDate();
    const settings = getCalendarSettings();

    sendSuccess(ws, "time/getDate", {
      year: date.year,
      month: date.month,
      day: date.day,
      lastUpdate: date.lastUpdate,
      settings: {
        monthsPerYear: settings.monthsPerYear,
        daysPerMonth: settings.daysPerMonth,
        secondsPerDay: settings.secondsPerDay,
      },
    });
  } catch (error) {
    handleError(error as Error, "TimeHandlers.getDate");
    sendSystemError(ws, "Ошибка при получении даты");
  }
}

/**
 * Получение статистики игрового цикла
 */
async function handleGetCycleStats(ws: WebSocket): Promise<void> {
  try {
    const stats = getGameCycleStats();

    sendSuccess(ws, "time/getCycleStats", stats);
  } catch (error) {
    handleError(error as Error, "TimeHandlers.getCycleStats");
    sendSystemError(ws, "Ошибка при получении статистики цикла");
  }
}

/**
 * Установка настроек календаря (только для админов)
 */
async function handleSetCalendarSettings(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    // Проверяем права (временно - проверяем просто авторизацию)
    if (!playerData || !playerData.id) {
      sendError(ws, "time/setCalendarSettings", "Требуется авторизация");
      return;
    }

    const { monthsPerYear, daysPerMonth, secondsPerDay } = data;

    if (!monthsPerYear || !daysPerMonth || !secondsPerDay) {
      sendError(ws, "time/setCalendarSettings", "Не указаны все параметры");
      return;
    }

    if (monthsPerYear < 1 || monthsPerYear > 24) {
      sendError(ws, "time/setCalendarSettings", "Месяцев в году должно быть от 1 до 24");
      return;
    }

    if (daysPerMonth < 1 || daysPerMonth > 60) {
      sendError(ws, "time/setCalendarSettings", "Дней в месяце должно быть от 1 до 60");
      return;
    }

    if (secondsPerDay < 1 || secondsPerDay > 3600) {
      sendError(ws, "time/setCalendarSettings", "Секунд в дне должно быть от 1 до 3600");
      return;
    }

    const success = await updateCalendarSettings({
      monthsPerYear,
      daysPerMonth,
      secondsPerDay,
    });

    if (success) {
      sendSuccess(ws, "time/setCalendarSettings", {
        message: "Настройки календаря обновлены",
        settings: { monthsPerYear, daysPerMonth, secondsPerDay },
      });

      log(`Настройки календаря изменены пользователем ${playerData.username}`);
    } else {
      sendError(ws, "time/setCalendarSettings", "Не удалось обновить настройки");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.setCalendarSettings");
    sendSystemError(ws, "Ошибка при установке настроек календаря");
  }
}

/**
 * Установка даты вручную (только для админов)
 */
async function handleSetDate(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/setDate", "Требуется авторизация");
      return;
    }

    const { year, month, day } = data;

    if (!year || !month || !day) {
      sendError(ws, "time/setDate", "Не указаны все параметры даты");
      return;
    }

    const success = await setDate(year, month, day);

    if (success) {
      sendSuccess(ws, "time/setDate", {
        message: "Дата установлена",
        year,
        month,
        day,
      });

      log(`Дата установлена вручную пользователем ${playerData.username}: Год ${year}, Месяц ${month}, День ${day}`);
    } else {
      sendError(ws, "time/setDate", "Не удалось установить дату (возможно некорректные значения)");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.setDate");
    sendSystemError(ws, "Ошибка при установке даты");
  }
}

/**
 * Получение статистики TimeManager
 */
async function handleGetTimeStats(ws: WebSocket): Promise<void> {
  try {
    const stats = getTimeManagerStats();

    sendSuccess(ws, "time/getStats", stats);
  } catch (error) {
    handleError(error as Error, "TimeHandlers.getStats");
    sendSystemError(ws, "Ошибка при получении статистики");
  }
}

/**
 * Тестовое создание отложенной задачи
 */
async function handleCreateTestTask(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/createTestTask", "Требуется авторизация");
      return;
    }

    const { delay, message } = data;

    if (!delay || !message) {
      sendError(ws, "time/createTestTask", "Не указаны параметры задачи");
      return;
    }

    if (delay < 1 || delay > 300) {
      sendError(ws, "time/createTestTask", "Задержка должна быть от 1 до 300 секунд");
      return;
    }

    const { sendToUser } = require("../../network/socketHandler");

    // const eventId = registerOnceEvent({
    //   name: "testTask",
    //   delayInSeconds: delay,
    //   playerId: playerData.id,
    //   action: () => {
    //     sendToUser(playerData.id, {
    //       action: "time/testTaskComplete",
    //       data: { message },
    //     });
    //   },
    //   persistent: true,
    //   metadata: {
    //     actionType: "testTask",
    //     message,
    //   },
    // });
    const startAt = new Date();
    startAt.setMinutes(startAt.getMinutes() + 1);
    const eventId = registerCronEvent({
      name: "testCronTask",
      startAt: startAt,
      interval: 5, // секунды
      playerId: playerData.id,
      action: () => {
        sendToUser(playerData.id, {
          action: "time/testCronTaskComplete",
          data: { message, timestamp: new Date() },
        });
        log(`Cron задача сработала для ${playerData.username}`);
      },
      persistent: true,
      metadata: {
        actionType: "testTask",
        message,
      },
    });

    sendSuccess(ws, "time/createTestTask", {
      message: `Задача создана, выполнится через ${delay} секунд`,
      eventId,
      delay,
    });

    log(`Создана тестовая задача для ${playerData.username} (${delay}с)`);
  } catch (error) {
    handleError(error as Error, "TimeHandlers.createTestTask");
    sendSystemError(ws, "Ошибка при создании задачи");
  }
}

/**
 * Создание тестовой Cron задачи
 */
async function handleCreateCronTask(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/createCronTask", "Требуется авторизация");
      return;
    }

    const { interval, startAt, message } = data;

    if (!interval || !startAt || !message) {
      sendError(ws, "time/createCronTask", "Не указаны параметры (interval, startAt, message)");
      return;
    }

    const { sendToUser } = require("../../network/socketHandler");
    const startDate = new Date(startAt);

    if (isNaN(startDate.getTime())) {
      sendError(ws, "time/createCronTask", "Некорректная дата startAt");
      return;
    }

    const eventId = registerCronEvent({
      name: "testCronTask",
      startAt: startDate,
      interval: interval, // секунды
      playerId: playerData.id,
      action: () => {
        sendToUser(playerData.id, {
          action: "time/testCronTaskComplete",
          data: { message, timestamp: new Date() },
        });
        log(`Cron задача сработала для ${playerData.username}`);
      },
      persistent: true,
      metadata: {
        actionType: "testTask",
        message,
      },
    });

    sendSuccess(ws, "time/createCronTask", {
      message: `Cron задача создана. Старт: ${startDate.toISOString()}, Интервал: ${interval}с`,
      eventId,
    });

    log(`Создана Cron задача для ${playerData.username}`);
  } catch (error) {
    handleError(error as Error, "TimeHandlers.createCronTask");
    sendSystemError(ws, "Ошибка при создании Cron задачи");
  }
}

/**
 * Отмена задачи
 */
async function handleCancelTask(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/cancelTask", "Требуется авторизация");
      return;
    }

    const { eventId } = data;

    if (!eventId) {
      sendError(ws, "time/cancelTask", "Не указан ID задачи");
      return;
    }

    const cancelled = unregisterEvent(eventId);

    if (cancelled) {
      sendSuccess(ws, "time/cancelTask", {
        message: "Задача отменена",
        eventId,
      });
    } else {
      sendError(ws, "time/cancelTask", "Не удалось отменить задачу");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.cancelTask");
    sendSystemError(ws, "Ошибка при отмене задачи");
  }
}

/**
 * Приостановка события
 */
async function handlePauseEvent(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/pauseEvent", "Требуется авторизация");
      return;
    }

    const { eventId } = data;

    if (!eventId) {
      sendError(ws, "time/pauseEvent", "Не указан ID события");
      return;
    }

    const paused = await pauseEvent(eventId);

    if (paused) {
      sendSuccess(ws, "time/pauseEvent", {
        message: "Событие приостановлено",
        eventId,
      });
    } else {
      sendError(ws, "time/pauseEvent", "Не удалось приостановить событие");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.pauseEvent");
    sendSystemError(ws, "Ошибка при приостановке события");
  }
}

/**
 * Возобновление события
 */
async function handleResumeEvent(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/resumeEvent", "Требуется авторизация");
      return;
    }

    const { eventId } = data;

    if (!eventId) {
      sendError(ws, "time/resumeEvent", "Не указан ID события");
      return;
    }

    const resumed = await resumeEvent(eventId);

    if (resumed) {
      sendSuccess(ws, "time/resumeEvent", {
        message: "Событие возобновлено",
        eventId,
      });
    } else {
      sendError(ws, "time/resumeEvent", "Не удалось возобновить событие");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.resumeEvent");
    sendSystemError(ws, "Ошибка при возобновлении события");
  }
}

/**
 * Получение событий игрока
 */
async function handleGetPlayerEvents(ws: WebSocket): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/getPlayerEvents", "Требуется авторизация");
      return;
    }

    const events = await getPlayerEvents(playerData.id);

    sendSuccess(ws, "time/getPlayerEvents", {
      events,
      count: events.length,
    });
  } catch (error) {
    handleError(error as Error, "TimeHandlers.getPlayerEvents");
    sendSystemError(ws, "Ошибка при получении событий");
  }
}

// Регистрация обработчиков
export function registerTimeHandlers(): void {
  // Игровой календарь
  registerHandler("time", "getDate", handleGetDate);
  registerHandler("time", "getCycleStats", handleGetCycleStats);
  registerHandler("time", "setCalendarSettings", handleSetCalendarSettings);
  registerHandler("time", "setDate", handleSetDate);

  // TimeManager события
  registerHandler("time", "getStats", handleGetTimeStats);
  registerHandler("time", "createTestTask", handleCreateTestTask);
  registerHandler("time", "createCronTask", handleCreateCronTask); // Новый обработчик
  registerHandler("time", "cancelTask", handleCancelTask);
  registerHandler("time", "pauseEvent", handlePauseEvent);
  registerHandler("time", "resumeEvent", handleResumeEvent);
  registerHandler("time", "getPlayerEvents", handleGetPlayerEvents);
}
