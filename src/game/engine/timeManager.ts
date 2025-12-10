import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import * as timeEventRepository from "../../db/repositories/timeEventRepository";
import { v4 as uuidv4 } from "uuid";
import gameSettings from "../../config/gameSettings";
import { sendToUser } from "../../network/socketHandler";
import { handleDayChange } from "./gameEventSystem";
import { processMiningCycle } from "./miningEngine";
import { refreshRecruitmentOptions } from "./recruitmentEngine";
// ==========================================
// ХЕЛПЕРЫ ВРЕМЕНИ
// ==========================================

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
  const diff = fromTime - startAt;
  const intervalsPassed = Math.floor(diff / intervalMs) + 1; // +1 чтобы гарантированно попасть в будущее
  nextRun = startAt + intervalsPassed * intervalMs;

  return nextRun;
}

// ==========================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ==========================================

export type TimeEventType = "periodic" | "once" | "delayed" | "cron";

export interface TimeEvent {
  id: string;
  type: TimeEventType;
  name: string;
  executeAt?: number; // timestamp следующего выполнения
  startAt?: number; // timestamp начала (для cron)
  interval?: number; // интервал в секундах
  lastExecution?: number;
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

// ==========================================
// ХРАНИЛИЩЕ ДАННЫХ (IN-MEMORY)
// ==========================================

export const events: Map<string, TimeEvent> = new Map();
const periodicEvents: Map<string, PeriodicEvent> = new Map(); // Legacy поддержка
const eventBuckets: Map<number, Set<string>> = new Map();

// БУФЕРЫ ОПТИМИЗАЦИИ БД
// 1. Cron: ID -> Новое время выполнения (для пакетного UPDATE времени)
const pendingPersistence: Map<string, number> = new Map();
// 2. Once: Список ID, которые выполнились (для пакетного UPDATE status='completed')
const pendingCompletions: Set<string> = new Set();

// ==========================================
// НАСТРОЙКИ И ТАЙМЕРЫ
// ==========================================

let tickInterval: NodeJS.Timeout | null = null;
let flushInterval: NodeJS.Timeout | null = null;

const TICK_INTERVAL = gameSettings.timeEvents.TICK_INTERVAL || 1000; // 1000 ms (1 сек)
const BUCKET_SIZE = gameSettings.timeEvents.BUCKET_SIZE || 5; // 5 sec
const FLUSH_INTERVAL = 5000; // 5000 ms (частота сброса буферов в БД)

// ==========================================
// ОСНОВНАЯ ЛОГИКА
// ==========================================

/**
 * Инициализация TimeManager с восстановлением событий
 */
export async function initializeTimeManager(): Promise<void> {
  log("Инициализация TimeManager...");

  // Восстанавливаем события из БД
  await restoreEventsFromDB();

  // Запускаем таймеры
  startTicking();
  startFlushLoop(); // Запуск сброса буферов

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

    // 1. Восстанавливаем активные события
    for (const dbEvent of activeEvents) {
      // --- CRON ---
      if (dbEvent.type === "cron" && dbEvent.start_at && dbEvent.interval) {
        const startAt = roundToSeconds(new Date(dbEvent.start_at).getTime());
        // Вычисляем следующее время, пропуская старые (Crash Recovery)
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

        events.set(event.id, event);
        addToBucket(nextExecuteAt, event.id);

        // Если мы пропустили выполнения (время в БД отличается от расчетного),
        // сразу добавляем в буфер на обновление в БД
        if (dbEvent.execute_at && new Date(dbEvent.execute_at).getTime() !== nextExecuteAt) {
          pendingPersistence.set(event.id, nextExecuteAt);
        }
        restoredCount++;

        // --- ONCE ---
      } else if (dbEvent.type === "once" && dbEvent.execute_at) {
        const executeAt = roundToSeconds(new Date(dbEvent.execute_at).getTime());

        if (executeAt <= nowRounded) {
          // Время прошло -> выполняем немедленно
          log(`Выполняем пропущенное событие: ${dbEvent.name}`);
          await executeRestoredEvent(dbEvent);
          // Сразу в буфер завершения
          pendingCompletions.add(dbEvent.id);
        } else {
          // Время в будущем -> планируем
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

        // --- PERIODIC (Legacy) ---
      } else if (dbEvent.type === "periodic") {
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

    // 2. Восстанавливаем приостановленные события
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
 * Хелпер для добавления события в нужный временной бакет
 */
function addToBucket(timestamp: number, eventId: string) {
  const bucket = Math.floor(timestamp / BUCKET_SIZE);
  if (!eventBuckets.has(bucket)) {
    eventBuckets.set(bucket, new Set());
  }
  eventBuckets.get(bucket)!.add(eventId);
}

/**
 * Выполнение восстановленного события (восстанавливает логику по метаданным)
 */
async function executeRestoredEvent(dbEvent: any): Promise<void> {
  try {
    const metadata = dbEvent.metadata || {};

    // Здесь можно мапить actionType на реальные функции
    switch (metadata.actionType) {
      case "gameCycleDayChange":
        handleDayChange();
        break;
      case "recruitment":
        if (metadata.buildingId) {
          // Запускаем обновление (это сгенерит новых и перезапустит таймер)
          // false означает автоматическое обновление, не ручное
          await refreshRecruitmentOptions(metadata.buildingId, false);

          if (process.env.NODE_ENV === "development") {
            log(`[TimeManager] Восстановлен цикл вербовки: ${metadata.buildingId}`);
          }
        }
        break;
      case "mining":
        if (metadata.buildingId && metadata.resourceKey) {
          // Запускаем обработку цикла (это запустит выдачу ресурсов и создаст следующий таймер)
          await processMiningCycle(metadata.buildingId, metadata.resourceKey);

          // Для дебага (можно убрать в продакшене)
          if (process.env.NODE_ENV === "development") {
            log(`[TimeManager] Восстановлен цикл добычи: ${metadata.buildingId} (${metadata.resourceKey})`);
          }
        } else {
          logError(`[TimeManager] Ошибка восстановления mining события ${dbEvent.id}: нет данных`);
        }
        break;
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
        // Для отладки
        if (process.env.NODE_ENV === "development") {
          log(`[DEBUG] Сработало восстановленное событие: ${dbEvent.name} (Type: ${dbEvent.type})`);
        }
    }
  } catch (err) {
    handleError(err as Error, `TimeManager.executeRestored.${dbEvent.name}`);
  }
}

// ==========================================
// ЦИКЛЫ СОХРАНЕНИЯ И ОБНОВЛЕНИЯ
// ==========================================

/**
 * Запуск цикла сброса буферов в БД (Batch Update)
 */
function startFlushLoop(): void {
  if (flushInterval) return;

  flushInterval = setInterval(async () => {
    await flushPersistence();
  }, FLUSH_INTERVAL);
}

/**
 * Сброс накопившихся обновлений в БД
 */
async function flushPersistence(): Promise<void> {
  // 1. Сохраняем изменения времени (Cron)
  if (pendingPersistence.size > 0) {
    const updatesArray = [];
    for (const [id, executeAtTs] of pendingPersistence) {
      updatesArray.push({
        id: id,
        executeAt: new Date(executeAtTs),
      });
    }

    // Очищаем буфер
    pendingPersistence.clear();

    // Отправляем в БД
    await timeEventRepository.batchUpdateExecuteTime(updatesArray);
  }

  // 2. Сохраняем завершенные события (Once)
  if (pendingCompletions.size > 0) {
    const idsToComplete = Array.from(pendingCompletions);

    // Очищаем буфер
    pendingCompletions.clear();

    // Отправляем в БД
    await timeEventRepository.batchUpdateStatus(idsToComplete, "completed");
  }
}

/**
 * Останавливает TimeManager и сохраняет данные
 */
export async function stopTimeManager(): Promise<void> {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }

  // Принудительно сбрасываем буферы перед выходом
  await flushPersistence();

  log("TimeManager остановлен");
}

// ==========================================
// ТИКЕР (Main Loop)
// ==========================================

/**
 * Запуск основного цикла проверки событий (тик)
 */
function startTicking(): void {
  if (tickInterval) return;

  // Синхронизируемся с началом следующей секунды
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
    // 1. Обработка периодических событий (Legacy)
    for (const [id, event] of periodicEvents) {
      const lastExec = event.lastExecution || 0;
      const secondsSinceLastExec = (nowRounded - lastExec) / 1000;

      if (secondsSinceLastExec >= event.interval) {
        event.lastExecution = nowRounded;
        executeEventAction(event);
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

        // Валидация
        if (!event || !event.executeAt || event.status === "paused") continue;

        // Проверяем время выполнения
        if (nowRounded >= event.executeAt) {
          // Группировка
          if (event.playerId) {
            if (!playerEvents.has(event.playerId)) {
              playerEvents.set(event.playerId, []);
            }
            playerEvents.get(event.playerId)!.push(event);
          } else {
            globalEvents.push(event);
          }

          // --- ЛОГИКА ОБНОВЛЕНИЯ (CRON vs ONCE) ---
          if (event.type === "cron" && event.interval) {
            // CRON: Планируем следующее выполнение
            // Важно: используем executeAt как базу, чтобы не накапливать погрешность (drift)
            const nextTime = event.executeAt + event.interval * 1000;
            event.executeAt = nextTime;

            // Переносим в новый бакет в памяти
            addToBucket(nextTime, eventId);

            // В буфер обновления времени для БД
            if (event.persistent) {
              pendingPersistence.set(eventId, nextTime);
            }
          } else {
            // ONCE: Удаляем событие
            if (event.persistent) {
              // Добавляем в буфер завершения для БД
              pendingCompletions.add(event.id);
            }
            // Удаляем из памяти
            events.delete(eventId);
          }

          // Удаляем из ТЕКУЩЕГО бакета
          eventIds.delete(eventId);
        }
      }

      // Выполняем глобальные события
      for (const event of globalEvents) {
        executeEventAction(event);
      }

      // Выполняем события игроков батчами
      for (const [playerId, playerEventList] of playerEvents) {
        processPlayerEvents(playerId, playerEventList);
      }

      // Очищаем пустой bucket для экономии памяти
      if (eventIds.size === 0) {
        eventBuckets.delete(currentBucket);
      }
    }
  } catch (err) {
    handleError(err as Error, "TimeManager.tick");
  }
}

/**
 * Безопасное выполнение действия события
 */
async function executeEventAction(event: TimeEvent): Promise<void> {
  try {
    const result = event.action();
    if (result instanceof Promise) {
      result.catch((err) => handleError(err as Error, `TimeManager.exec.${event.name}`));
    }
  } catch (err) {
    handleError(err as Error, `TimeManager.exec.${event.name}`);
  }
}

/**
 * Обработка событий конкретного игрока
 */
async function processPlayerEvents(playerId: string, events: TimeEvent[]): Promise<void> {
  for (const event of events) {
    await executeEventAction(event);
  }
}

// ==========================================
// API МЕТОДЫ (РЕГИСТРАЦИЯ И УПРАВЛЕНИЕ)
// ==========================================

/**
 * Регистрация периодического события (Legacy)
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
  id?: string;
  name: string;
  startAt: Date;
  interval: number; // в секундах
  action: () => void | Promise<void>;
  playerId?: string;
  worldId?: string;
  metadata?: any;
  persistent?: boolean;
}): string {
  const eventId = params.persistent ? params.id || `${params.name}_cron_${params.playerId || "global"}` : uuidv4();
  const startAtSeconds = roundToSeconds(params.startAt.getTime());
  const now = getNowRounded();

  // Вычисляем ПЕРВОЕ выполнение
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

  log(`Зарегистрировано Cron событие: ${params.name}. След. запуск: ${new Date(executeAt).toISOString()}`);
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
  // Очистка из буферов, если событие удаляется до сброса в БД
  if (pendingPersistence.has(eventId)) pendingPersistence.delete(eventId);
  if (pendingCompletions.has(eventId)) pendingCompletions.delete(eventId);

  // Проверяем периодические
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

    log(`Удалено событие: ${eventId}`);
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

  // Убираем из буфера тиков, если оно там было (чтобы не перетереть статус "paused" старым "active")
  if (pendingPersistence.has(eventId)) pendingPersistence.delete(eventId);

  if (event.persistent) {
    const nowRounded = getNowRounded();
    const remaining = event.executeAt ? event.executeAt - nowRounded : 0;

    // ПИШЕМ В БД СРАЗУ (Ручное действие - надежность важнее буфера)
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
    // Для Cron пересчитываем следующее время выполнения по сетке (пропускаем прошедшее)
    event.executeAt = calculateNextCronTime(event.startAt, event.interval, nowRounded);
  } else {
    // Для Once восстанавливаем по remaining_time из БД
    if (event.persistent) {
      const dbEvent = await timeEventRepository.getById(eventId);
      if (dbEvent && dbEvent.remaining_time) {
        event.executeAt = nowRounded + Number(dbEvent.remaining_time);
      }
    }
  }

  event.status = "active";

  // Обновляем bucket
  if (event.executeAt) {
    addToBucket(event.executeAt, eventId);

    // Если крон пересчитался, обновляем время в базе через буфер (чтобы не дергать БД лишний раз, если это крон)
    if (event.type === "cron" && event.persistent) {
      pendingPersistence.set(eventId, event.executeAt);
    }
  }

  if (event.persistent) {
    // Статус обновляем сразу (Ручное действие)
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
    pendingDbUpdates: pendingPersistence.size,
    pendingDbCompletions: pendingCompletions.size,
  };
}

/**
 * Получить события игрока (объединяет память и БД)
 */
export async function getPlayerEvents(playerId: string): Promise<any[]> {
  const playerEvents = [];
  const nowRounded = getNowRounded();

  // 1. Берем из памяти
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

  // 2. Берем из БД и мержим (для тех, которых нет в памяти, например, удаленных paused или old)
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
