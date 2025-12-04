import { miningConfig } from "../../config/mining";
import { buildingRepository, timeEventRepository } from "../../db/repositories";
import { addItem, getInventory } from "./inventoryEngine";
import { registerOnceEvent, unregisterEvent } from "./timeManager";
import { log, error as logError } from "../../utils/logger";
import { getCalendarSettings } from "./gameEventSystem";
import { sendToUser } from "../../network/socketHandler";

/**
 * Обработка завершения цикла добычи
 */
export async function processMiningCycle(buildingId: string, resourceKey: string) {
  try {
    const buildings = await buildingRepository.getByBuildId(buildingId);
    const building = buildings[0];

    // Проверки валидности
    if (!building || !building.data || !building.data.mining || !building.data.mining[resourceKey]) {
      return;
    }

    const miningState = building.data.mining[resourceKey];
    const workers = miningState.workers;

    // Если рабочих 0, цикл не перезапускаем
    if (workers <= 0) return;

    const resConfig = miningConfig.resources[resourceKey as keyof typeof miningConfig.resources];
    if (!resConfig) {
      logError(`Mining: Resource config not found for ${resourceKey}`);
      return;
    }

    // 1. Выдача ресурсов
    const amount = workers * resConfig.baseYield;

    if (building.inventoryId) {
      const result = await addItem(building.inventoryId, resConfig.itemId, amount);
      if (result.success) {
        log(`Mining: Здание ${buildingId} добыло ${amount} ${resConfig.name}`);
      } else {
        log(`Mining: Здание ${buildingId} - инвентарь полон или ошибка, ресурсы сгорели`);
      }
    } else {
      log(`Mining: У здания ${buildingId} нет инвентаря, ресурсы сгорели`);
    }

    // 2. Запуск следующего цикла
    const calendar = getCalendarSettings();
    const durationSeconds = resConfig.durationInDays * calendar.secondsPerDay;

    const eventName = `mining_${buildingId}_${resourceKey}`;

    const eventId = registerOnceEvent({
      name: eventName,
      delayInSeconds: durationSeconds,
      action: () => processMiningCycle(buildingId, resourceKey),
      persistent: true,
      metadata: {
        actionType: "mining",
        buildingId,
        resourceKey,
      },
    });

    // Обновляем состояние в БД
    // ВАЖНО: Очищаем поля паузы (savedProgressMs, workersBeforePause), так как новый цикл чист
    building.data.mining[resourceKey] = {
      workers: workers,
      eventId: eventId,
      startTime: Date.now(),
      baseDuration: durationSeconds * 1000,
      savedProgressMs: 0,
      workersBeforePause: 0,
    };

    await buildingRepository.updateData(building.id, building.data);

    if (building.inventoryId) {
      const result = await getInventory(building.inventoryId);
      if (result?.info) {
        sendToUser(building.ownerPlayerId, {
          action: "inventory/getBuildingSuccess",
          data: {
            buildingId,
            containerId: building.inventoryId,
            capacity: result.info.capacity,
            type: result.info.type,
            items: result.items,
          },
        });
      }
    }
  } catch (err) {
    logError(`Mining Error (process): ${err instanceof Error ? err.message : "Unknown"}`);
  }
}

/**
 * Изменение количества рабочих и сдвиг времени (Anti-Abuse + Pause/Resume)
 */
export async function updateWorkers(buildingId: string, resourceKey: string, newWorkerCount: number) {
  const buildings = await buildingRepository.getByBuildId(buildingId);
  const building = buildings[0];

  if (!building) throw new Error("Building not found");

  if (!building.data) building.data = {};
  if (!building.data.mining) building.data.mining = {};

  const currentState = building.data.mining[resourceKey] || {
    workers: 0,
    eventId: null,
    startTime: 0,
    baseDuration: 0,
    savedProgressMs: 0,
    workersBeforePause: 0,
  };

  const oldWorkers = currentState.workers;
  const oldEventId = currentState.eventId;

  if (oldWorkers === newWorkerCount) return building;

  const resConfig = miningConfig.resources[resourceKey as keyof typeof miningConfig.resources];
  if (!resConfig) throw new Error("Invalid resource key");

  const calendar = getCalendarSettings();
  const currentBaseDurationMs = resConfig.durationInDays * calendar.secondsPerDay * 1000;
  const now = Date.now();

  // 1. Удаляем старый таймер (в любом случае, так как будем создавать новый или ставить на паузу)
  if (oldEventId) {
    unregisterEvent(oldEventId);
    await timeEventRepository.deleteById(oldEventId);
  }

  // ============================
  // СЦЕНАРИЙ 1: ПАУЗА (Стало 0 рабочих)
  // ============================
  if (newWorkerCount <= 0) {
    let progressToSave = currentState.savedProgressMs || 0;

    // Если мы работали, нужно добавить текущий прогресс к сохраненному
    if (oldWorkers > 0 && currentState.startTime > 0) {
      const timePassed = now - currentState.startTime;
      const safeTimePassed = Math.min(timePassed, currentState.baseDuration || currentBaseDurationMs);
      progressToSave = safeTimePassed;
    }

    building.data.mining[resourceKey] = {
      workers: 0,
      eventId: null,
      startTime: 0,
      baseDuration: currentState.baseDuration || currentBaseDurationMs,
      // Сохраняем прогресс и кол-во рабочих для будущего расчета
      savedProgressMs: progressToSave,
      workersBeforePause: oldWorkers > 0 ? oldWorkers : currentState.workersBeforePause || 0,
    };

    await buildingRepository.updateData(buildingId, building.data);
    return building;
  }

  // ============================
  // СЦЕНАРИЙ 2: ВОЗОБНОВЛЕНИЕ ИЛИ ИЗМЕНЕНИЕ (Стало > 0 рабочих)
  // ============================

  let effectivePassedTime = 0;
  let workersForCalc = oldWorkers;

  // А. Возобновление из паузы
  if (oldWorkers === 0) {
    effectivePassedTime = currentState.savedProgressMs || 0;
    // Используем запомненное кол-во рабочих для формулы сдвига.
    // Если его нет (старая версия), считаем, что рабочих было столько же, сколько стало (без штрафа).
    workersForCalc = currentState.workersBeforePause || newWorkerCount;
  }
  // Б. Изменение на лету (было > 0)
  else if (currentState.startTime > 0) {
    const timePassed = now - currentState.startTime;
    effectivePassedTime = Math.min(timePassed, currentState.baseDuration || currentBaseDurationMs);
    workersForCalc = oldWorkers;
  }

  // Расчет сдвига (Anti-Abuse)
  let adjustedPassed = effectivePassedTime;

  // Применяем штраф только при УВЕЛИЧЕНИИ рабочих
  if (newWorkerCount > workersForCalc) {
    adjustedPassed = effectivePassedTime * (workersForCalc / newWorkerCount);
  }
  // При уменьшении adjustedPassed остается равным effectivePassedTime (прогресс сохраняется)

  const remainingTimeMs = Math.max(0, currentBaseDurationMs - adjustedPassed);

  // 3. Запускаем новый таймер
  const delaySeconds = Math.max(1, Math.ceil(remainingTimeMs / 1000));

  const eventName = `mining_${buildingId}_${resourceKey}`;
  const newEventId = registerOnceEvent({
    name: eventName,
    delayInSeconds: delaySeconds,
    action: () => processMiningCycle(buildingId, resourceKey),
    persistent: true,
    metadata: {
      actionType: "mining",
      buildingId,
      resourceKey,
    },
  });

  // 4. Сохраняем состояние
  // "Подкручиваем" startTime, чтобы математика сходилась с remainingTimeMs
  const adjustedStartTime = now - (currentBaseDurationMs - remainingTimeMs);

  building.data.mining[resourceKey] = {
    workers: newWorkerCount,
    eventId: newEventId,
    startTime: adjustedStartTime,
    baseDuration: currentBaseDurationMs,
    // Сбрасываем поля паузы, так как процесс пошел
    savedProgressMs: 0,
    workersBeforePause: 0,
  };

  await buildingRepository.updateData(buildingId, building.data);
  return building;
}
