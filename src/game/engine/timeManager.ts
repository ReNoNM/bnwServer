import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import * as timeEventRepository from "../../db/repositories/timeEventRepository";
import { v4 as uuidv4 } from "uuid";
import gameSettings from "../../config/gameSettings";
import { sendToUser } from "../../network/socketHandler";

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

/**
 * Вычисляет следующее время выполнения для Cron события.
 * Если расчетное время в прошлом (сервер лежал), возвращает ближайшее будущее время согласно сетке интервалов.
 */
function calculateNextCronTime(startAt: number, intervalSeconds: number, fromTime: number): number {
  const intervalMs = intervalSeconds * 1000;
  let nextRun = startAt;

  // Если время старта еще не наступило, просто возвращаем его
  if (nextRun > fromTime) {
    return nextRun;
  }

  // Если время старта в прошлом, прыгаем вперед интервалами
  // Формула: fromTime + (interval - (fromTime - startAt) % interval)
  // Но нужно быть аккуратным, чтобы не попасть ровно в fromTime, если мы хотим строго следующее
  const diff = fromTime - startAt;
  const intervalsPassed = Math.floor(diff / intervalMs) + 1; // +1 чтобы гарантированно попасть в будущее
  nextRun = startAt + intervalsPassed * intervalMs;

  return nextRun;
}

// Типы событий
export type TimeEventType = "periodic" | "once" | "delayed" | "cron";

export interface TimeEvent {
  id: string;
  type: TimeEventType;
  name: string;
  executeAt?: number; // timestamp для одноразовых и cron (следующее выполнение)
  startAt?: number; // timestamp начала для cron
  interval?: number; // секунд для периодических и cron
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

// Интервал проверки
let tickInterval: NodeJS.Timeout | null = null;
const TICK_INTERVAL = gameSettings.timeEvents.TICK_INTERVAL; // ms - 1 секунда
const BUCKET_SIZE = gameSettings.timeEvents.BUCKET_SIZE; // 5 секунд на bucket
const SAVE_INTERVAL = gameSettings.timeEvents.SAVE_INTERVAL; // сохранять состояние каждые 30 секунд

/**
 * Инициализация TimeManager с восстановлением событий
 */
export async function initializeTimeManager(): Promise<void> {
  log("Инициализация TimeManager...");

  // Восстанавливаем события из БД
  await restoreEventsFromDB();

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
      if (dbEvent.type === "cron" && dbEvent.start_at && dbEvent.interval) {
        // Восстановление CRON события
        const startAt = roundToSeconds(new Date(dbEvent.start_at).getTime());
        // Вычисляем СЛЕДУЮЩЕЕ выполнение относительно текущего времени, пропуская старые
        const nextExecuteAt = calculateNextCronTime(startAt, dbEvent.interval, nowRounded);

        const event: TimeEvent = {
          id: dbEvent.id,
          type: "cron",
          name: dbEvent.name,
          startAt: startAt,
          interval: dbEvent.interval,
          executeAt: nextExecuteAt,
          playerId: dbEvent.player_id || undefined,
          worldId: dbEvent.world_id || undefined,
          metadata: dbEvent.metadata,
          status: "active",
          persistent: true,
          action: () => executeRestoredEvent(dbEvent),
        };

        // Добавляем в память
        events.set(event.id, event);

        // Добавляем в bucket
        addToBucket(nextExecuteAt, event.id);

        // Если расчетное время изменилось относительно БД (из-за пропуска), обновим БД при сохранении или сразу
        if (dbEvent.execute_at && new Date(dbEvent.execute_at).getTime() !== nextExecuteAt) {
          await timeEventRepository.updateExecuteTime(dbEvent.id, new Date(nextExecuteAt));
          log(`Cron событие ${dbEvent.name} перепланировано на ${new Date(nextExecuteAt).toISOString()} (пропуск старых)`);
        }

        restoredCount++;
      } else if (dbEvent.type === "once" && dbEvent.execute_at) {
        // Восстановление ONCE
        const executeAt = roundToSeconds(new Date(dbEvent.execute_at).getTime());

        if (executeAt <= nowRounded) {
          // Событие уже должно было выполниться пока сервер лежал -> выполняем
          log(`Выполняем пропущенное событие: ${dbEvent.name}`);
          await executeRestoredEvent(dbEvent);
          await timeEventRepository.updateStatus(dbEvent.id, "completed");
        } else {
          // Восстанавливаем событие
          const event: TimeEvent = {
            id: dbEvent.id,
            type: "once",
            name: dbEvent.name,
            executeAt: executeAt,
            playerId: dbEvent.player_id || undefined,
            worldId: dbEvent.world_id || undefined,
            metadata: dbEvent.metadata,
            status: "active",
            persistent: true,
            action: () => executeRestoredEvent(dbEvent),
          };

          events.set(event.id, event);
          addToBucket(executeAt, event.id);
          restoredCount++;
        }
      } else if (dbEvent.type === "periodic") {
        // Восстановление PERIODIC
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
        type: dbEvent.type as TimeEventType,
        name: dbEvent.name,
        executeAt: dbEvent.execute_at ? roundToSeconds(new Date(dbEvent.execute_at).getTime()) : undefined,
        startAt: dbEvent.start_at ? roundToSeconds(new Date(dbEvent.start_at).getTime()) : undefined,
        interval: dbEvent.interval,
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
 * Хелпер для добавления в bucket
 */
function addToBucket(timestamp: number, eventId: string) {
  const bucket = Math.floor(timestamp / BUCKET_SIZE);
  if (!eventBuckets.has(bucket)) {
    eventBuckets.set(bucket, new Set());
  }
  eventBuckets.get(bucket)!.add(eventId);
}

/**
 * Выполнение восстановленного события
 */
async function executeRestoredEvent(dbEvent: any): Promise<void> {
  try {
    const metadata = dbEvent.metadata || {};

    switch (metadata.actionType) {
      case "testTask":
        sendToUser(dbEvent.player_id, {
          action: "time/testTaskComplete",
          data: {
            message: metadata.message || "Тестовая задача завершена!",
          },
        });
        log(`Тестовая задача завершена для игрока ${dbEvent.player_id}`);
        break;
      default:
        log(`Неизвестный тип восстановленного события: ${metadata.actionType}`, true);
    }
  } catch (err) {
    handleError(err as Error, `TimeManager.executeRestored.${dbEvent.name}`);
  }
}

/**
 * Периодическое сохранение состояния
 */
function startPeriodicSave(): void {
  setInterval(async () => {
    try {
      await saveAllEvents();
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

    // Сохраняем только те, которые active.
    // Приостановленные и так сохранены в момент паузы.
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

    if (eventsToSave.length === 0) return;

    log(`Сохранение ${eventsToSave.length} событий в БД`);

    for (const event of eventsToSave) {
      await timeEventRepository.updateStatus(event.id, event.status || "active", {
        execute_at: event.executeAt ? new Date(event.executeAt) : undefined,
        last_execution: event.lastExecution ? new Date(event.lastExecution) : undefined,
        start_at: event.startAt ? new Date(event.startAt) : undefined,
        interval: event.interval,
        metadata: JSON.stringify(event.metadata || {}) as any,
      });
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.saveAllEvents");
  }
}

/**
 * Запуск основного цикла проверки
 */
function startTicking(): void {
  if (tickInterval) return;

  const now = Date.now();
  const msUntilNextSecond = 1000 - (now % 1000);

  setTimeout(() => {
    tick();
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
    // 1. Обработка периодических событий (простой интервал от последнего исполнения)
    for (const [id, event] of periodicEvents) {
      const lastExec = event.lastExecution || 0;
      const secondsSinceLastExec = (nowRounded - lastExec) / 1000;

      if (secondsSinceLastExec >= event.interval) {
        event.lastExecution = nowRounded;
        try {
          const result = event.action();
          if (result instanceof Promise) {
            result.catch((err) => handleError(err as Error, `TimeManager.periodic.${event.name}`));
          }
        } catch (err) {
          handleError(err as Error, `TimeManager.periodic.${event.name}`);
        }
      }
    }

    // 2. Обработка событий из Bucket (Once и Cron)
    const currentBucket = Math.floor(nowRounded / BUCKET_SIZE);
    const eventIds = eventBuckets.get(currentBucket);

    if (eventIds && eventIds.size > 0) {
      const playerEvents: Map<string, TimeEvent[]> = new Map();
      const globalEvents: TimeEvent[] = [];

      for (const eventId of eventIds) {
        const event = events.get(eventId);
        // Если событие удалено или на паузе - пропускаем
        if (!event || !event.executeAt || event.status === "paused") continue;

        // Проверяем время выполнения
        if (nowRounded >= event.executeAt) {
          // Добавляем в списки на выполнение
          if (event.playerId) {
            if (!playerEvents.has(event.playerId)) {
              playerEvents.set(event.playerId, []);
            }
            playerEvents.get(event.playerId)!.push(event);
          } else {
            globalEvents.push(event);
          }

          // ЛОГИКА ОБНОВЛЕНИЯ: CRON vs ONCE
          if (event.type === "cron" && event.interval) {
            // CRON: Планируем следующее выполнение
            // Следующее время = Текущее время выполнения + Интервал
            // ВАЖНО: Используем executeAt (плановое), а не nowRounded (фактическое), чтобы не накапливать сдвиг
            const nextTime = event.executeAt + event.interval * 1000;
            event.executeAt = nextTime;

            // Переносим в новый bucket
            addToBucket(nextTime, eventId);

            // Обновляем БД (для persistent)
            if (event.persistent) {
              // Асинхронно, чтобы не блокировать тик
              timeEventRepository.updateExecuteTime(eventId, new Date(nextTime)).catch((e) => logError(`Ошибка обновления cron времени: ${e}`));
            }
          } else {
            // ONCE: Помечаем как выполненное и удаляем
            if (event.persistent) {
              timeEventRepository.updateStatus(event.id, "completed");
            }
            events.delete(eventId);
          }

          // Удаляем из ТЕКУЩЕГО бакета (для cron он уже добавлен в будущий бакет, но из этого его надо убрать)
          eventIds.delete(eventId);
        }
      }

      // Выполняем глобальные события
      for (const event of globalEvents) {
        try {
          const result = event.action();
          if (result instanceof Promise) {
            result.catch((err) => handleError(err as Error, `TimeManager.${event.type}.${event.name}`));
          }
        } catch (err) {
          handleError(err as Error, `TimeManager.${event.type}.${event.name}`);
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
 * Регистрация периодического события (простая проверка каждый тик)
 */
export function registerPeriodicEvent(params: {
  name: string;
  interval: number; // в секундах
  playerId?: string;
  worldId?: string;
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
    playerId: params.playerId,
    worldId: params.worldId,
    action: params.action,
    metadata: params.metadata,
    lastExecution: getNowRounded(),
    persistent: params.persistent,
  };

  periodicEvents.set(eventId, event);

  if (params.persistent) {
    timeEventRepository.create({
      id: eventId,
      type: "periodic",
      name: params.name,
      player_id: params.playerId,
      world_id: params.worldId,
      interval: params.interval,
      status: "active",
      metadata: params.metadata,
    });
  }

  log(`Зарегистрировано периодическое событие: ${params.name} (каждые ${params.interval}с)`);

  return eventId;
}

/**
 * Регистрация Cron события (фиксированный старт + интервал)
 */
export function registerCronEvent(params: {
  name: string;
  startAt: Date;
  interval: number; // в секундах
  action: () => void | Promise<void>;
  playerId?: string;
  worldId?: string;
  metadata?: any;
  persistent?: boolean;
}): string {
  const eventId = params.persistent ? `${params.name}_cron_${params.playerId || "global"}` : uuidv4();
  const startAtSeconds = roundToSeconds(params.startAt.getTime());
  const now = getNowRounded();

  // Вычисляем ПЕРВОЕ выполнение
  // Если startAt в будущем - это и есть первое выполнение
  // Если startAt в прошлом - вычисляем следующее по сетке
  const executeAt = calculateNextCronTime(startAtSeconds, params.interval, now);

  const event: TimeEvent = {
    id: eventId,
    type: "cron",
    name: params.name,
    startAt: startAtSeconds,
    interval: params.interval,
    executeAt: executeAt,
    action: params.action,
    playerId: params.playerId,
    worldId: params.worldId,
    metadata: params.metadata,
    status: "active",
    persistent: params.persistent,
  };

  events.set(eventId, event);
  addToBucket(executeAt, eventId);

  if (params.persistent) {
    timeEventRepository.create({
      id: eventId,
      type: "cron",
      name: params.name,
      player_id: params.playerId,
      world_id: params.worldId,
      execute_at: new Date(executeAt),
      start_at: new Date(startAtSeconds),
      interval: params.interval,
      status: "active",
      metadata: params.metadata,
    });
  }

  log(
    `Зарегистрировано Cron событие: ${params.name}. Старт: ${params.startAt.toISOString()}, Интервал: ${
      params.interval
    }с. Следующий запуск: ${new Date(executeAt).toISOString()}`
  );

  return eventId;
}

/**
 * Регистрация одноразового события
 */
export function registerOnceEvent(params: {
  name: string;
  delayInSeconds?: number;
  executeAt?: number;
  action: () => void | Promise<void>;
  playerId?: string;
  worldId?: string;
  metadata?: any;
  persistent?: boolean;
}): string {
  const eventId = params.persistent ? `${params.name}_${params.playerId || "global"}_${Date.now()}` : uuidv4();

  const executeAt = params.executeAt
    ? roundToSeconds(params.executeAt)
    : params.delayInSeconds
    ? calculateExecuteTime(params.delayInSeconds)
    : getNowRounded();

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
  addToBucket(executeAt, eventId);

  if (params.persistent) {
    timeEventRepository.create({
      id: eventId,
      type: "once",
      name: params.name,
      player_id: params.playerId,
      world_id: params.worldId,
      execute_at: new Date(executeAt),
      status: "active",
      metadata: params.metadata,
    });
  }

  log(`Зарегистрировано одноразовое событие: ${params.name} (через ${params.delayInSeconds || 0}с)`);

  return eventId;
}

/**
 * Удаление события
 */
export function unregisterEvent(eventId: string): boolean {
  // Проверяем периодические события
  if (periodicEvents.has(eventId)) {
    const event = periodicEvents.get(eventId);
    periodicEvents.delete(eventId);

    if (event?.persistent) {
      timeEventRepository.updateStatus(eventId, "cancelled");
    }

    log(`Удалено периодическое событие: ${eventId}`);
    return true;
  }

  // Проверяем Bucket события (Once и Cron)
  if (events.has(eventId)) {
    const event = events.get(eventId);
    events.delete(eventId);

    // Удаляем из bucket
    if (event?.executeAt) {
      const bucket = Math.floor(event.executeAt / BUCKET_SIZE);
      eventBuckets.get(bucket)?.delete(eventId);
    }

    if (event?.persistent) {
      timeEventRepository.updateStatus(eventId, "cancelled");
    }

    log(`Удалено событие (Once/Cron): ${eventId}`);
    return true;
  }

  return false;
}

/**
 * Приостановить событие
 */
export async function pauseEvent(eventId: string): Promise<boolean> {
  const event = events.get(eventId);
  if (!event || (event.type !== "once" && event.type !== "cron")) return false;

  event.status = "paused";

  if (event.persistent) {
    const nowRounded = getNowRounded();
    const remaining = event.executeAt ? event.executeAt - nowRounded : 0;

    await timeEventRepository.updateStatus(eventId, "paused", {
      paused_at: new Date(nowRounded),
      remaining_time: remaining,
    });
  }

  log(`Событие приостановлено: ${eventId}`);
  return true;
}

/**
 * Возобновить событие
 */
export async function resumeEvent(eventId: string): Promise<boolean> {
  const event = events.get(eventId);
  if (!event || event.status !== "paused" || (event.type !== "once" && event.type !== "cron")) return false;

  const nowRounded = getNowRounded();

  // Логика возобновления
  if (event.type === "cron" && event.startAt && event.interval) {
    // Для Cron пересчитываем следующее время выполнения по сетке
    event.executeAt = calculateNextCronTime(event.startAt, event.interval, nowRounded);
  } else {
    // Для Once восстанавливаем по remaining_time из БД или памяти
    if (event.persistent) {
      const dbEvent = await timeEventRepository.getById(eventId);
      if (dbEvent && dbEvent.remaining_time) {
        event.executeAt = nowRounded + dbEvent.remaining_time;
      }
    } else if (event.executeAt) {
      // Если in-memory пауза (маловероятно, но для полноты)
      // Тут сложнее, так как remaining не храним в памяти явно, считаем, что восстанавливаем "как есть" или по DB
      // Упрощение: для in-memory просто сдвигаем на прошедшее время (не реализовано детально без поля pausedAt в памяти)
    }
  }

  event.status = "active";

  // Обновляем bucket
  if (event.executeAt) {
    addToBucket(event.executeAt, eventId);
  }

  if (event.persistent) {
    await timeEventRepository.updateStatus(eventId, "active", {
      execute_at: event.executeAt ? new Date(event.executeAt) : undefined,
      paused_at: null,
      remaining_time: null,
    });
  }

  log(`Событие возобновлено: ${eventId}`);
  return true;
}

/**
 * Получить статистику TimeManager
 */
export function getTimeManagerStats(): any {
  const pausedCount = Array.from(events.values()).filter((e) => e.status === "paused").length;
  const cronCount = Array.from(events.values()).filter((e) => e.type === "cron").length;

  return {
    periodicEvents: periodicEvents.size,
    bucketEvents: events.size,
    cronEvents: cronCount,
    pausedEvents: pausedCount,
    buckets: eventBuckets.size,
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
        type: event.type,
        status: event.status,
        executeAt: event.executeAt,
        interval: event.interval,
        remainingTime: event.executeAt ? Math.max(0, event.executeAt - nowRounded) : null,
        metadata: event.metadata,
      });
    }
  }

  // Догружаем из БД, если вдруг чего-то нет в памяти (например, paused events, которые могли быть выгружены)
  // В текущей реализации все загружено, но оставим для надежности
  const dbEvents = await timeEventRepository.getByPlayerId(playerId);
  for (const dbEvent of dbEvents) {
    if (!playerEvents.find((e) => e.id === dbEvent.id)) {
      playerEvents.push({
        id: dbEvent.id,
        name: dbEvent.name,
        type: dbEvent.type,
        status: dbEvent.status,
        executeAt: dbEvent.execute_at,
        interval: dbEvent.interval,
        remainingTime: dbEvent.remaining_time,
        metadata: dbEvent.metadata,
      });
    }
  }

  return playerEvents;
}
