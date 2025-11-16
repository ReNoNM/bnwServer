import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { handleError } from "../../utils/errorHandler";
import { log } from "../../utils/logger";
import { getCurrentCycle, setGameCycleInterval, getTimeManagerStats, registerOnceEvent, cancelEvent } from "../../game/engine/timeManager";

/**
 * Получение текущего игрового цикла
 */
async function handleGetCycle(ws: WebSocket): Promise<void> {
  try {
    const cycle = getCurrentCycle();

    sendSuccess(ws, "time/getCycle", {
      cycle,
      timestamp: Date.now(),
    });
  } catch (error) {
    handleError(error as Error, "TimeHandlers.getCycle");
    sendSystemError(ws, "Ошибка при получении игрового цикла");
  }
}

/**
 * Установка интервала цикла (только для админов)
 */
async function handleSetCycleInterval(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    // Проверяем права (временно - проверяем просто авторизацию)
    if (!playerData || !playerData.id) {
      sendError(ws, "time/setCycleInterval", "Требуется авторизация");
      return;
    }

    const { interval } = data;

    if (!interval || interval < 1 || interval > 3600) {
      sendError(ws, "time/setCycleInterval", "Некорректный интервал (1-3600 секунд)");
      return;
    }

    setGameCycleInterval(interval);

    sendSuccess(ws, "time/setCycleInterval", {
      message: `Интервал цикла установлен на ${interval} секунд`,
      interval,
    });

    log(`Интервал цикла изменен на ${interval} секунд пользователем ${playerData.username}`);
  } catch (error) {
    handleError(error as Error, "TimeHandlers.setCycleInterval");
    sendSystemError(ws, "Ошибка при установке интервала цикла");
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

    const { delay = 10, message = "Тестовая задача завершена" } = data;

    if (delay < 1 || delay > 300) {
      sendError(ws, "time/createTestTask", "Задержка должна быть от 1 до 300 секунд");
      return;
    }

    // Создаем отложенную задачу
    const taskId = registerOnceEvent({
      name: `testTask_${playerData.username}`,
      executeAt: Date.now() + delay * 1000,
      playerId: playerData.id,
      action: () => {
        // Отправляем сообщение конкретному игроку
        ws.send(
          JSON.stringify({
            action: "time/taskCompleted",
            data: {
              message,
              completedAt: Date.now(),
              playerId: playerData.id,
            },
          })
        );

        log(`Тестовая задача завершена для ${playerData.username}`);
      },
    });

    sendSuccess(ws, "time/createTestTask", {
      taskId,
      message: `Задача создана и выполнится через ${delay} секунд`,
      executeAt: Date.now() + delay * 1000,
    });
  } catch (error) {
    handleError(error as Error, "TimeHandlers.createTestTask");
    sendSystemError(ws, "Ошибка при создании тестовой задачи");
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

    const { taskId } = data;

    if (!taskId) {
      sendError(ws, "time/cancelTask", "Не указан ID задачи");
      return;
    }

    const cancelled = await cancelEvent(taskId);

    if (cancelled) {
      sendSuccess(ws, "time/cancelTask", {
        message: "Задача отменена",
        taskId,
      });
    } else {
      sendError(ws, "time/cancelTask", "Задача не найдена или уже выполнена");
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

    const { pauseEvent } = require("../../game/engine/timeManager");
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

    const { resumeEvent } = require("../../game/engine/timeManager");
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
 * Изменение времени выполнения события
 */
async function handleUpdateEventTime(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    if (!playerData || !playerData.id) {
      sendError(ws, "time/updateEventTime", "Требуется авторизация");
      return;
    }

    const { eventId, newDelay } = data;

    if (!eventId || !newDelay) {
      sendError(ws, "time/updateEventTime", "Не указаны параметры");
      return;
    }

    if (newDelay < 1 || newDelay > 86400) {
      sendError(ws, "time/updateEventTime", "Задержка должна быть от 1 до 86400 секунд");
      return;
    }

    const { updateEventTime } = require("../../game/engine/timeManager");
    const newExecuteAt = Date.now() + newDelay * 1000;
    const updated = await updateEventTime(eventId, newExecuteAt);

    if (updated) {
      sendSuccess(ws, "time/updateEventTime", {
        message: "Время события обновлено",
        eventId,
        newExecuteAt,
      });
    } else {
      sendError(ws, "time/updateEventTime", "Не удалось обновить время события");
    }
  } catch (error) {
    handleError(error as Error, "TimeHandlers.updateEventTime");
    sendSystemError(ws, "Ошибка при изменении времени события");
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

    const { getPlayerEvents } = require("../../game/engine/timeManager");
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
  registerHandler("time", "getCycle", handleGetCycle);
  registerHandler("time", "setCycleInterval", handleSetCycleInterval);
  registerHandler("time", "getStats", handleGetTimeStats);
  registerHandler("time", "createTestTask", handleCreateTestTask);
  registerHandler("time", "cancelTask", handleCancelTask);
  registerHandler("time", "pauseEvent", handlePauseEvent);
  registerHandler("time", "resumeEvent", handleResumeEvent);
  registerHandler("time", "updateEventTime", handleUpdateEventTime);
  registerHandler("time", "getPlayerEvents", handleGetPlayerEvents);
}
