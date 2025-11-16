import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { broadcast } from "../../network/socketHandler";
import * as timeEventRepository from "../../db/repositories/timeEventRepository";
import { v4 as uuidv4 } from "uuid";
import gameSettings from "../../config/gameSettings";

// ВАЖНО: Функции для работы с временем с округлением до секунд
/**
 * Округляет timestamp до целых секунд (обнуляет миллисекунды)
 */
function roundToSeconds(timestamp: number): number {
  return Math.floor(timestamp / 1000) * 1000;
}

/**
 * Получает текущее время округленное до секунд
 */
function getNowRounded(): number {
  return roundToSeconds(Date.now());
}

/**
 * Вычисляет время выполнения с учетом интервала в секундах
 */
function calculateExecuteTime(delayInSeconds: number): number {
  const now = getNowRounded();
  return now + delayInSeconds * 1000;
}

// Типы событий
export type TimeEventType = "periodic" | "once" | "delayed";

export interface TimeEvent {
  id: string;
  type: TimeEventType;
  name: string;
  executeAt?: number; // timestamp для одноразовых (всегда округлен до секунд)
  interval?: number; // секунд для периодических
  lastExecution?: number; // всегда округлен до секунд
  action: () => void | Promise<void>;
  metadata?: any;
  playerId?: string;
  worldId?: string;
  status?: "active" | "paused" | "completed" | "cancelled";
  persistent?: boolean;
}

export interface PeriodicEvent extends TimeEvent {
  type: "periodic";
  interval: number;
}

// Хранилище событий в памяти
const events: Map<string, TimeEvent> = new Map();
const periodicEvents: Map<string, PeriodicEvent> = new Map();
const eventBuckets: Map<number, Set<string>> = new Map();

// Интервал проверки (1 секунда)
let tickInterval: NodeJS.Timeout | null = null;
const TICK_INTERVAL = gameSettings.timeEvents.TICK_INTERVAL; // ms - ровно 1 секунда
const BUCKET_SIZE = gameSettings.timeEvents.BUCKET_SIZE; // 5 секунд на bucket
const SAVE_INTERVAL = gameSettings.timeEvents.SAVE_INTERVAL; // сохранять состояние каждые 30 секунд

// Состояние игрового цикла
let gameCycle = {
  current: 0,
  lastUpdate: getNowRounded(),
  ...gameSettings.gameCycle,
};

/**
 * Инициализация TimeManager с восстановлением событий
 */
export async function initializeTimeManager(): Promise<void> {
  log("Инициализация TimeManager...");

  // Восстанавливаем события из БД
  await restoreEventsFromDB();

  // Восстанавливаем игровой цикл
  await restoreGameCycle();

  // Регистрируем игровой цикл как первое периодическое событие
  registerPeriodicEvent({
    name: "gameCycle",
    interval: gameCycle.interval,
    action: handleGameCycle,
    persistent: true,
  });

  // Запускаем основной таймер
  startTicking();

  // Запускаем периодическое сохранение
  startPeriodicSave();

  log("TimeManager инициализирован");
}

/**
 * Восстановление событий из БД после рестарта
 */
async function restoreEventsFromDB(): Promise<void> {
  try {
    const activeEvents = await timeEventRepository.getActive();
    const pausedEvents = await timeEventRepository.getPaused();

    let restoredCount = 0;
    const nowRounded = getNowRounded();

    // Восстанавливаем активные события
    for (const dbEvent of activeEvents) {
      if (dbEvent.type === "once" && dbEvent.execute_at) {
        // Округляем время из БД до секунд
        const executeAt = roundToSeconds(new Date(dbEvent.execute_at).getTime());

        // Проверяем, не пропустили ли мы событие
        if (executeAt <= nowRounded) {
          // Событие должно было выполниться пока сервер был выключен
          log(`Выполняем пропущенное событие: ${dbEvent.name}`);
          await executeRestoredEvent(dbEvent);
          await timeEventRepository.updateStatus(dbEvent.id, "completed");
        } else {
          // Восстанавливаем событие
          const event: TimeEvent = {
            id: dbEvent.id,
            type: dbEvent.type,
            name: dbEvent.name,
            executeAt: executeAt, // уже округлено
            playerId: dbEvent.player_id || undefined,
            worldId: dbEvent.world_id || undefined,
            metadata: dbEvent.metadata,
            status: "active",
            persistent: true,
            action: () => executeRestoredEvent(dbEvent),
          };

          events.set(event.id, event);

          // Добавляем в bucket
          const bucket = Math.floor(executeAt / BUCKET_SIZE);
          if (!eventBuckets.has(bucket)) {
            eventBuckets.set(bucket, new Set());
          }
          eventBuckets.get(bucket)!.add(event.id);

          restoredCount++;
        }
      } else if (dbEvent.type === "periodic") {
        // Восстанавливаем периодическое событие
        const event: PeriodicEvent = {
          id: dbEvent.id,
          type: "periodic",
          name: dbEvent.name,
          interval: dbEvent.interval || 30,
          lastExecution: dbEvent.last_execution ? roundToSeconds(new Date(dbEvent.last_execution).getTime()) : nowRounded,
          metadata: dbEvent.metadata,
          persistent: true,
          action: () => executeRestoredEvent(dbEvent),
        };

        periodicEvents.set(event.id, event);
        restoredCount++;
      }
    }

    // Восстанавливаем приостановленные события
    for (const dbEvent of pausedEvents) {
      const event: TimeEvent = {
        id: dbEvent.id,
        type: dbEvent.type,
        name: dbEvent.name,
        executeAt: dbEvent.execute_at ? roundToSeconds(new Date(dbEvent.execute_at).getTime()) : undefined,
        playerId: dbEvent.player_id || undefined,
        worldId: dbEvent.world_id || undefined,
        metadata: dbEvent.metadata,
        status: "paused",
        persistent: true,
        action: () => executeRestoredEvent(dbEvent),
      };

      events.set(event.id, event);
    }

    if (restoredCount > 0) {
      log(`Восстановлено ${restoredCount} событий из БД`);
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.restoreEvents");
  }
}

/**
 * Выполнение восстановленного события
 */
async function executeRestoredEvent(dbEvent: any): Promise<void> {
  try {
    const metadata = dbEvent.metadata || {};

    switch (metadata.actionType) {
      case "buildingComplete":
        const { buildingRepository } = require("../../db/repositories");
        await buildingRepository.update(metadata.buildingId, { status: "completed" });

        const { sendToUser } = require("../../network/socketHandler");
        sendToUser(dbEvent.player_id, {
          action: "building/completed",
          data: metadata,
        });
        break;

      case "researchComplete":
        // TODO: Реализовать когда будет система исследований
        break;

      case "troopsArrival":
        // TODO: Реализовать когда будет боевая система
        break;

      default:
        log(`Неизвестный тип восстановленного события: ${metadata.actionType}`);
    }
  } catch (err) {
    handleError(err as Error, `TimeManager.executeRestored.${dbEvent.name}`);
  }
}

/**
 * Восстановление игрового цикла
 */
async function restoreGameCycle(): Promise<void> {
  try {
    const savedCycle = await timeEventRepository.getById("gameCycle");
    if (savedCycle && savedCycle.metadata) {
      gameCycle.current = savedCycle.metadata.current || 0;
      gameCycle.interval = savedCycle.metadata.interval || gameSettings.gameCycle.interval;
      gameCycle.lastUpdate = getNowRounded();
      log(`Игровой цикл восстановлен: ${gameCycle.current}`);
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.restoreGameCycle");
  }
}

/**
 * Периодическое сохранение состояния
 */
function startPeriodicSave(): void {
  setInterval(async () => {
    try {
      await timeEventRepository.updateStatus("gameCycle", "active", {
        metadata: JSON.stringify({
          current: gameCycle.current,
          interval: gameCycle.interval,
          lastUpdate: gameCycle.lastUpdate,
        }) as any,
      });
    } catch (err) {
      handleError(err as Error, "TimeManager.periodicSave");
    }
  }, SAVE_INTERVAL);
}

/**
 * Останавливает TimeManager
 */
export async function stopTimeManager(): Promise<void> {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;

    await saveAllEvents();

    log("TimeManager остановлен");
  }
}

/**
 * Сохранение всех событий в БД
 */
async function saveAllEvents(): Promise<void> {
  try {
    const eventsToSave = [];

    for (const [id, event] of events) {
      if (event.persistent && event.status === "active") {
        eventsToSave.push(event);
      }
    }

    for (const [id, event] of periodicEvents) {
      if (event.persistent) {
        eventsToSave.push(event);
      }
    }

    log(`Сохранение ${eventsToSave.length} событий в БД`);

    for (const event of eventsToSave) {
      await timeEventRepository.updateStatus(event.id, event.status || "active", {
        execute_at: event.executeAt ? new Date(event.executeAt) : undefined,
        last_execution: event.lastExecution ? new Date(event.lastExecution) : undefined,
        metadata: JSON.stringify(event.metadata || {}) as any,
      });
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.saveAllEvents");
  }
}

/**
 * Запуск основного цикла проверки
 * ВАЖНО: Синхронизируем с системным временем для точности
 */
function startTicking(): void {
  if (tickInterval) return;

  // Синхронизируемся с началом следующей секунды
  const now = Date.now();
  const msUntilNextSecond = 1000 - (now % 1000);

  setTimeout(() => {
    // Запускаем tick сразу
    tick();

    // И затем каждую секунду
    tickInterval = setInterval(() => {
      tick();
    }, TICK_INTERVAL);

    log(`TimeManager синхронизирован и запущен (интервал ${TICK_INTERVAL}ms)`);
  }, msUntilNextSecond);
}

/**
 * Основная функция проверки событий
 */
async function tick(): Promise<void> {
  const nowRounded = getNowRounded();

  try {
    // Обработка периодических событий
    for (const [id, event] of periodicEvents) {
      const lastExec = event.lastExecution || 0;
      const secondsSinceLastExec = (nowRounded - lastExec) / 1000;

      if (secondsSinceLastExec >= event.interval) {
        event.lastExecution = nowRounded;

        try {
          const result = event.action();
          if (result instanceof Promise) {
            result.catch((err) => {
              handleError(err as Error, `TimeManager.periodic.${event.name}`);
            });
          }
        } catch (err) {
          handleError(err as Error, `TimeManager.periodic.${event.name}`);
        }
      }
    }

    // Обработка одноразовых событий через buckets
    const currentBucket = Math.floor(nowRounded / BUCKET_SIZE);
    const eventIds = eventBuckets.get(currentBucket);

    if (eventIds && eventIds.size > 0) {
      const playerEvents: Map<string, TimeEvent[]> = new Map();
      const globalEvents: TimeEvent[] = [];

      for (const eventId of eventIds) {
        const event = events.get(eventId);
        if (!event || !event.executeAt || event.status === "paused") continue;

        // Проверяем с точностью до секунды
        if (nowRounded >= event.executeAt) {
          if (event.playerId) {
            if (!playerEvents.has(event.playerId)) {
              playerEvents.set(event.playerId, []);
            }
            playerEvents.get(event.playerId)!.push(event);
          } else {
            globalEvents.push(event);
          }

          if (event.persistent) {
            await timeEventRepository.updateStatus(event.id, "completed");
          }

          events.delete(eventId);
          eventIds.delete(eventId);
        }
      }

      // Выполняем глобальные события
      for (const event of globalEvents) {
        try {
          const result = event.action();
          if (result instanceof Promise) {
            result.catch((err) => {
              handleError(err as Error, `TimeManager.once.${event.name}`);
            });
          }
        } catch (err) {
          handleError(err as Error, `TimeManager.once.${event.name}`);
        }
      }

      // Выполняем события игроков батчами
      for (const [playerId, playerEventList] of playerEvents) {
        processPlayerEvents(playerId, playerEventList);
      }

      // Очищаем пустой bucket
      if (eventIds.size === 0) {
        eventBuckets.delete(currentBucket);
      }
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.tick");
  }
}

/**
 * Обработка событий конкретного игрока
 */
async function processPlayerEvents(playerId: string, events: TimeEvent[]): Promise<void> {
  for (const event of events) {
    try {
      const result = event.action();
      if (result instanceof Promise) {
        await result;
      }
    } catch (err) {
      handleError(err as Error, `TimeManager.player.${playerId}.${event.name}`);
    }
  }
}

/**
 * Регистрация периодического события
 */
export function registerPeriodicEvent(params: {
  name: string;
  interval: number; // в секундах
  action: () => void | Promise<void>;
  metadata?: any;
  persistent?: boolean;
}): string {
  const eventId = params.persistent ? params.name : `periodic_${params.name}_${Date.now()}`;

  const event: PeriodicEvent = {
    id: eventId,
    type: "periodic",
    name: params.name,
    interval: params.interval,
    action: params.action,
    metadata: params.metadata,
    lastExecution: getNowRounded(), // округляем до секунд
    persistent: params.persistent,
  };

  periodicEvents.set(eventId, event);

  if (params.persistent) {
    timeEventRepository.create({
      id: eventId,
      type: "periodic",
      name: params.name,
      interval: params.interval,
      status: "active",
      metadata: params.metadata,
    });
  }

  log(`Зарегистрировано периодическое событие: ${params.name} (каждые ${params.interval}с)`);

  return eventId;
}

/**
 * Регистрация одноразового события
 */
export function registerOnceEvent(params: {
  name: string;
  delayInSeconds?: number; // задержка в секундах
  executeAt?: number; // или точное время (будет округлено)
  action: () => void | Promise<void>;
  playerId?: string;
  worldId?: string;
  metadata?: any;
  persistent?: boolean;
}): string {
  const eventId = params.persistent ? uuidv4() : `once_${params.name}_${Date.now()}_${Math.random()}`;

  // Вычисляем время выполнения с округлением
  let executeAt: number;
  if (params.delayInSeconds !== undefined) {
    executeAt = calculateExecuteTime(params.delayInSeconds);
  } else if (params.executeAt !== undefined) {
    executeAt = roundToSeconds(params.executeAt);
  } else {
    throw new Error("Необходимо указать delayInSeconds или executeAt");
  }

  const event: TimeEvent = {
    id: eventId,
    type: "once",
    name: params.name,
    executeAt: executeAt,
    action: params.action,
    playerId: params.playerId,
    worldId: params.worldId,
    metadata: params.metadata,
    status: "active",
    persistent: params.persistent,
  };

  events.set(eventId, event);

  // Добавляем в bucket для быстрого поиска
  const bucket = Math.floor(executeAt / BUCKET_SIZE);
  if (!eventBuckets.has(bucket)) {
    eventBuckets.set(bucket, new Set());
  }
  eventBuckets.get(bucket)!.add(eventId);

  if (params.persistent) {
    timeEventRepository.create({
      id: eventId,
      type: "once",
      name: params.name,
      execute_at: new Date(executeAt),
      player_id: params.playerId,
      world_id: params.worldId,
      status: "active",
      metadata: {
        ...params.metadata,
        actionType: params.metadata?.actionType || "generic",
      },
    });
  }

  const executeIn = Math.round((executeAt - getNowRounded()) / 1000);
  log(`Зарегистрировано одноразовое событие: ${params.name} (через ${executeIn}с)`);

  return eventId;
}

/**
 * Отмена события
 */
export async function cancelEvent(eventId: string): Promise<boolean> {
  if (periodicEvents.has(eventId)) {
    periodicEvents.delete(eventId);
    await timeEventRepository.updateStatus(eventId, "cancelled");
    log(`Отменено периодическое событие: ${eventId}`);
    return true;
  }

  const event = events.get(eventId);
  if (event) {
    events.delete(eventId);

    if (event.executeAt) {
      const bucket = Math.floor(event.executeAt / BUCKET_SIZE);
      const bucketEvents = eventBuckets.get(bucket);
      if (bucketEvents) {
        bucketEvents.delete(eventId);
        if (bucketEvents.size === 0) {
          eventBuckets.delete(bucket);
        }
      }
    }

    if (event.persistent) {
      await timeEventRepository.updateStatus(eventId, "cancelled");
    }

    log(`Отменено событие: ${eventId}`);
    return true;
  }

  return false;
}

/**
 * Приостановить событие
 */
export async function pauseEvent(eventId: string): Promise<boolean> {
  const event = events.get(eventId);

  if (!event || event.status === "paused" || !event.executeAt) {
    return false;
  }

  const nowRounded = getNowRounded();
  const remainingTime = event.executeAt - nowRounded;

  if (remainingTime <= 0) {
    return false; // Событие уже должно было выполниться
  }

  event.status = "paused";

  // Удаляем из bucket чтобы не выполнялось
  const bucket = Math.floor(event.executeAt / BUCKET_SIZE);
  const bucketEvents = eventBuckets.get(bucket);
  if (bucketEvents) {
    bucketEvents.delete(eventId);
    if (bucketEvents.size === 0) {
      eventBuckets.delete(bucket);
    }
  }

  if (event.persistent) {
    await timeEventRepository.pauseEvent(eventId);
  }

  log(`Событие приостановлено: ${eventId} (осталось ${remainingTime / 1000}с)`);

  return true;
}

/**
 * Возобновить событие
 */
export async function resumeEvent(eventId: string): Promise<boolean> {
  const event = events.get(eventId);

  if (!event || event.status !== "paused") {
    return false;
  }

  let newExecuteAt: number;

  if (event.persistent) {
    const dbEvent = await timeEventRepository.getById(eventId);
    if (!dbEvent || !dbEvent.remaining_time) {
      return false;
    }
    // Вычисляем новое время с округлением
    const remainingSeconds = Math.ceil(Number(dbEvent.remaining_time) / 1000);
    newExecuteAt = calculateExecuteTime(remainingSeconds);

    await timeEventRepository.resumeEvent(eventId);
  } else {
    newExecuteAt = event.executeAt || getNowRounded();
  }

  event.status = "active";
  event.executeAt = newExecuteAt;

  // Добавляем обратно в bucket
  const bucket = Math.floor(newExecuteAt / BUCKET_SIZE);
  if (!eventBuckets.has(bucket)) {
    eventBuckets.set(bucket, new Set());
  }
  eventBuckets.get(bucket)!.add(eventId);

  log(`Событие возобновлено: ${eventId}`);

  return true;
}

/**
 * Изменить время выполнения события
 */
export async function updateEventTime(eventId: string, delayInSeconds: number): Promise<boolean> {
  const event = events.get(eventId);

  if (!event || event.status !== "active" || !event.executeAt) {
    return false;
  }

  const oldBucket = Math.floor(event.executeAt / BUCKET_SIZE);
  const newExecuteAt = calculateExecuteTime(delayInSeconds);
  const newBucket = Math.floor(newExecuteAt / BUCKET_SIZE);

  // Удаляем из старого bucket
  const oldBucketEvents = eventBuckets.get(oldBucket);
  if (oldBucketEvents) {
    oldBucketEvents.delete(eventId);
    if (oldBucketEvents.size === 0) {
      eventBuckets.delete(oldBucket);
    }
  }

  // Обновляем время
  event.executeAt = newExecuteAt;

  // Добавляем в новый bucket
  if (!eventBuckets.has(newBucket)) {
    eventBuckets.set(newBucket, new Set());
  }
  eventBuckets.get(newBucket)!.add(eventId);

  if (event.persistent) {
    await timeEventRepository.updateExecuteTime(eventId, new Date(newExecuteAt));
  }

  log(`Время события изменено: ${eventId} (выполнится через ${delayInSeconds}с)`);

  return true;
}

/**
 * Обработчик игрового цикла
 */
function handleGameCycle(): void {
  gameCycle.current++;
  gameCycle.lastUpdate = getNowRounded();

  // Отправляем обновление всем подключенным клиентам
  broadcast({
    action: "game/cycleUpdate",
    data: {
      cycle: gameCycle.current,
      timestamp: gameCycle.lastUpdate,
      nextCycleIn: gameCycle.interval,
    },
  });

  log(`Игровой цикл обновлен: ${gameCycle.current}`);
}

/**
 * Получить текущий игровой цикл
 */
export function getCurrentCycle(): number {
  return gameCycle.current;
}

/**
 * Установить интервал игрового цикла
 */
export function setGameCycleInterval(seconds: number): void {
  gameCycle.interval = seconds;

  // Обновляем периодическое событие
  for (const [id, event] of periodicEvents) {
    if (event.name === "gameCycle") {
      event.interval = seconds;
      break;
    }
  }

  log(`Интервал игрового цикла изменен на ${seconds} секунд`);
}

/**
 * Получить статистику TimeManager
 */
export function getTimeManagerStats(): any {
  const pausedCount = Array.from(events.values()).filter((e) => e.status === "paused").length;

  return {
    periodicEvents: periodicEvents.size,
    onceEvents: events.size,
    pausedEvents: pausedCount,
    buckets: eventBuckets.size,
    gameCycle: {
      current: gameCycle.current,
      interval: gameCycle.interval,
      lastUpdate: new Date(gameCycle.lastUpdate).toISOString(),
    },
  };
}

/**
 * Получить события игрока
 */
export async function getPlayerEvents(playerId: string): Promise<any[]> {
  const playerEvents = [];
  const nowRounded = getNowRounded();

  for (const [id, event] of events) {
    if (event.playerId === playerId) {
      playerEvents.push({
        id: event.id,
        name: event.name,
        status: event.status,
        executeAt: event.executeAt,
        remainingTime: event.executeAt ? Math.max(0, event.executeAt - nowRounded) : null,
        metadata: event.metadata,
      });
    }
  }

  const dbEvents = await timeEventRepository.getByPlayerId(playerId);
  for (const dbEvent of dbEvents) {
    if (!playerEvents.find((e) => e.id === dbEvent.id)) {
      playerEvents.push({
        id: dbEvent.id,
        name: dbEvent.name,
        status: dbEvent.status,
        executeAt: dbEvent.execute_at,
        remainingTime: dbEvent.remaining_time,
        metadata: dbEvent.metadata,
      });
    }
  }

  return playerEvents;
}
