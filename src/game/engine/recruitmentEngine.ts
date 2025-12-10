import { v4 as uuidv4 } from "uuid";
import { recruitmentConfig, getRandomName } from "../../config/recruitment";
import { buildingRepository, unitRepository, inventoryRepository, timeEventRepository, mapRepository } from "../../db/repositories";
import { registerOnceEvent, unregisterEvent } from "./timeManager";
import { getCalendarSettings } from "./gameEventSystem";
import { log, error as logError } from "../../utils/logger";

interface RecruitmentOption {
  id: string;
  name: string;
  // В будущем тут будут трейты, статы, цена и т.д.
}

/**
 * Генерация списка предложений
 */
function generateOptions(count: number = 5): RecruitmentOption[] {
  const options: RecruitmentOption[] = [];
  for (let i = 0; i < count; i++) {
    options.push({
      id: uuidv4(),
      name: getRandomName(),
    });
  }
  return options;
}

/**
 * Инициализация или обновление цикла вербовки
 * forced = true - для ручного обновления (кнопка)
 */
export async function refreshRecruitmentOptions(buildingId: string, forced: boolean = false) {
  const buildings = await buildingRepository.getByBuildId(buildingId);
  const building = buildings[0];
  if (!building) return null;

  // Инициализация структуры
  if (!building.data) building.data = {};
  if (!building.data.recruitment) building.data.recruitment = {};

  const state = building.data.recruitment;

  // 1. Удаляем старый таймер, если есть
  if (state.eventId) {
    unregisterEvent(state.eventId);
    await timeEventRepository.deleteById(state.eventId);
  }

  // 2. Генерируем новые опции
  const newOptions = generateOptions(5);

  // 3. Рассчитываем время
  const calendar = getCalendarSettings();
  const durationSeconds = recruitmentConfig.refreshIntervalDays * calendar.secondsPerDay;
  const now = Date.now();

  // 4. Запускаем таймер авто-обновления
  const eventId = registerOnceEvent({
    name: `recruitment_${buildingId}`,
    delayInSeconds: durationSeconds,
    action: () => refreshRecruitmentOptions(buildingId, false),
    persistent: true,
    metadata: {
      actionType: "recruitment",
      buildingId,
    },
  });

  // 5. Сохраняем
  building.data.recruitment = {
    options: newOptions,
    eventId: eventId,
    startTime: now,
    duration: durationSeconds * 1000,
  };

  await buildingRepository.updateData(buildingId, building.data);

  if (forced) {
    log(`Здание ${buildingId}: список рекрутов обновлен вручную`);
  } else {
    log(`Здание ${buildingId}: список рекрутов обновлен автоматически`);
  }

  return building.data.recruitment;
}

/**
 * Наем пешки (превращение опции в юнита)
 */
export async function recruitPawn(buildingId: string, optionId: string, playerId: string) {
  // 1. Получаем здание
  const buildings = await buildingRepository.getByBuildId(buildingId);
  const building = buildings[0];
  if (!building) throw new Error("Здание не найдено");
  if (building.ownerPlayerId !== playerId) throw new Error("Нет прав");

  // 2. Ищем опцию
  const state = building.data?.recruitment;
  if (!state || !state.options) throw new Error("Нет доступных рекрутов");

  const optionIndex = state.options.findIndex((o: any) => o.id === optionId);
  if (optionIndex === -1) throw new Error("Этот рекрут уже нанят или недоступен");

  const option = state.options[optionIndex];

  // 3. Получаем координаты здания (чтобы заспавнить пешку там же)
  // Нам нужно знать координаты карты. В модели Building есть mapCellId.
  // Но нам нужны x, y. Придется делать join или отдельный запрос.
  // У тебя есть building.mapCellId. Нужно получить координаты.
  // Импортируем mapRepository для этого.
  const mapTile = await mapRepository.getTileById(building.mapCellId);

  if (!mapTile) throw new Error("Ошибка карты: координаты здания не найдены");

  // 4. Создаем инвентарь для пешки
  const container = await inventoryRepository.createContainer(recruitmentConfig.pawnInventorySlots, "unit");
  if (!container) throw new Error("Ошибка создания инвентаря");

  // 5. Создаем юнита в БД
  const newUnit = await unitRepository.create({
    ownerPlayerId: playerId,
    worldId: mapTile.worldId,
    x: mapTile.x,
    y: mapTile.y,
    name: option.name,
    inventoryId: container.id,
    data: {},
  });

  if (!newUnit) throw new Error("Ошибка создания юнита");

  // 6. Удаляем опцию из списка
  state.options.splice(optionIndex, 1);
  await buildingRepository.updateData(buildingId, building.data!);

  log(`Игрок ${playerId} нанял ${newUnit.name} в здании ${buildingId}`);

  return { unit: newUnit, recruitmentState: state };
}

/**
 * Получение состояния (или инициализация, если первый раз)
 */
export async function getRecruitmentState(buildingId: string) {
  const buildings = await buildingRepository.getByBuildId(buildingId);
  const building = buildings[0];
  if (!building) return null;

  // Если данных нет вообще - инициализируем
  if (!building.data?.recruitment?.options) {
    return await refreshRecruitmentOptions(buildingId);
  }

  return building.data.recruitment;
}
