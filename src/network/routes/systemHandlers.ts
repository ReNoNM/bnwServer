import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendMessage, sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { clients } from "../socketHandler";
import { log } from "../../utils/logger";
import { generateMap } from "../../utils/mapGenerator";
import { handleError } from "../../utils/errorHandler";
import * as worldRepository from "../../db/repositories/worldRepository";
import * as mapRepository from "../../db/repositories/mapRepository";

// Обработчик пинга
function handlePing(ws: WebSocket, data: any): void {
  sendMessage(ws, "system/pong", { timestamp: Date.now() });
}

// Обработчик понга (если нужно что-то делать при получении понга)
function handlePong(ws: WebSocket, data: any): void {
  // Находим клиента для данного WebSocket соединения
  const clientInfo = clients.find((client) => client.ws === ws);

  if (clientInfo) {
    // Обновляем время последней активности
    clientInfo.lastActivity = Date.now();
    log(`Pong получен от клиента ${clientInfo.username || clientInfo.id || "неизвестный пользователь"}`);
  }
}

async function handleCreateWorld(ws: WebSocket, data: any): Promise<void> {
  try {
    // Генерируем случайное название мира
    const worldNames = [
      "Земли Вечной Зимы",
      "Кровавые Пески",
      "Мир Полых Звезд",
      "Эфирный Океан",
      "Глубины Хаоса",
      "Сквернолесье",
      "Кристальный Купол",
      "Башни Безмолвия",
      "Трон Пепла",
      "Мир Голубой Волны",
      "Астральная Равнина",
      "Проклятые Топи",
      "Сияющие Небеса",
      "Багровые Холмы",
      "Бездна Теней",
      "Осколки Рассвета",
      "Морозный Предел",
      "Зеркальное Озеро",
      "Заледеневшие Склоны",
      "Долина Забвения",
      "Лес Падающих Звёзд",
      "Песчаные Бури",
      "Ночные Холмы",
      "Дыхание Бездны",
      "Остров Забытого Солнца",
      "Плато Тысячи Ветров",
      "Штормовые Скалы",
      "Руины Света",
      "Ржавые Пустоши",
      "Обитель Туманов",
      "Огненные Пики",
      "Морские Лабиринты",
      "Кости Земли",
      "Покой Древних",
      "Пепельные Горы",
      "Земли Обугленного Камня",
      "Плачущие Скалы",
      "Туманные Болота",
      "Лунное Озеро",
      "Остров Падающих Листьев",
      "Хрустальный Берег",
      "Безмолвная Долина",
      "Скованные Ветром Плато",
      "Сердце Пустоты",
      "Залив Чёрных Волн",
      "Багровая Трясина",
      "Звёздная Пропасть",
      "Гроза Предвечерья",
      "Болотные Оковы",
      "Гибельные Пески",
      "Алтарь Угасающего Огня",
      "Горящий Каньон",
      "Око Смерти",
      "Предел Морозного Заката",
      "Гарнизон Теней",
      "Слёзы Огненной Реки",
      "Облачный Круг",
      "Дюны Забытого Ветра",
      "Стеклянная Пустошь",
      "Огненные Врата",
      "Пыльный Ковчег",
      "Мир Бурлящих Сфер",
      "Склеп Шепчущих",
      "Чаща Обречённых",
      "Вечная Равнина",
      "Гряда Разбитых Оков",
      "Тёмные Ключи",
      "Огни Угасающей Луны",
      "Багровый Прилив",
      "Каньон Молчания",
      "Остров Одинокого Шторма",
      "Земли Застывших Волн",
      "Сквозь Ледяную Пустоту",
      "Каменные Лабиринты",
      "Безмолвный Вулкан",
      "Обрыв Сумрачной Звезды",
      "Хрустальные Пещеры",
      "Долина Иссохших Рек",
      "Земли Затерянных Ковчегов",
      "Сверкающие Осколки",
      "Лазурный Маяк",
      "Тропы Забытого Солнца",
      "Чёрная Бездна",
      "Остров Разбитых Мечей",
      "Пепельный Дворец",
      "Залив Ветра и Пепла",
      "Гряда Сломанных Стражей",
      "Земли Кровавых Облаков",
      "Пустыня Трещащих Костей",
      "Проклятые Пики",
      "Хребет Горящих Стрел",
      "Обитель Мёртвых Ветров",
      "Долина Грёз",
      "Равнина Ржавых Волн",
      "Берег Стылых Молний",
      "Шёпот Песочных Часов",
      "Костяной Лабиринт",
      "Гряда Сломанных Крыльев",
      "Храм Погасшего Света",
      "Бездна Ледяных Шипов",
      "Чаща Угасших Звёзд",
      "Река Тлеющих Камней",
    ];
    const randomName = worldNames[Math.floor(Math.random() * worldNames.length)] + " " + Math.floor(Math.random() * 1000);

    // Создаем мир со стандартными параметрами
    const newWorld = await worldRepository.add({
      name: randomName,
      sizeX: 50,
      sizeY: 50,
      worldType: "standard",
      settings: {},
    });

    if (!newWorld) {
      sendError(ws, "system/createWorld", "Не удалось создать мир");
      return;
    }

    log(`Создан новый мир: ${randomName} (${newWorld.id})`);
    const mapData = generateMap();

    log(`Сгенерирована карта для мира ${randomName}: ${mapData.map.length}x${mapData.map[0]?.length || 0}`);

    // Преобразуем сгенерированную карту в тайлы для базы данных
    const tiles = [];
    for (let x = 0; x < mapData.map.length; x++) {
      for (let y = 0; y < mapData.map[x].length; y++) {
        const tile = mapData.map[x][y];
        tiles.push({
          worldId: newWorld.id,
          x: x,
          y: y,
          type: tile.type,
          typeId: tile.locationId,
          label: tile.label,
          metadata: {
            generated: true,
            generatedAt: Date.now(),
          },
        });
      }
    }

    // Сохраняем тайлы в базу данных
    const saveSuccess = await mapRepository.addTiles(tiles);

    if (!saveSuccess) {
      log(`Ошибка сохранения карты для мира ${randomName}`, true);
      sendError(ws, "system/createWorld", "Мир создан, но карта не сохранена");
      return;
    }

    log(`Карта мира ${randomName} сохранена в базу данных (${tiles.length} тайлов)`);

    sendSuccess(ws, "system/createWorld", {
      world: newWorld,
      message: `Мир "${randomName}" создан и карта сгенерирована`,
      mapStats: {
        totalTiles: tiles.length,
        areas: mapData.stats,
      },
    });
  } catch (error) {
    handleError(error as Error, "SystemHandlers.createWorld");
    sendSystemError(ws, "Ошибка при создании мира");
  }
}

// Обработчик получения списка миров
async function handleGetWorlds(ws: WebSocket, data: any): Promise<void> {
  try {
    const worlds = await worldRepository.getAll();

    log(`Запрошен список миров: найдено ${worlds.length} миров`);

    sendSuccess(ws, "system/getWorlds", {
      worlds: worlds,
      count: worlds.length,
    });
  } catch (error) {
    handleError(error as Error, "SystemHandlers.getWorlds");
    sendSystemError(ws, "Ошибка при получении списка миров");
  }
}

// Обработчик загрузки карты мира
async function handleLoadWorldMap(ws: WebSocket, data: any): Promise<void> {
  try {
    const { worldId } = data;

    if (!worldId) {
      sendError(ws, "system/loadWorldMap", "Не указан ID мира");
      return;
    }

    // Получаем информацию о мире
    const world = await worldRepository.getById(worldId);
    if (!world) {
      sendError(ws, "system/loadWorldMap", "Мир не найден");
      return;
    }

    // Получаем карту мира
    const mapTiles = await mapRepository.getByWorldId(worldId);

    if (mapTiles.length === 0) {
      sendError(ws, "system/loadWorldMap", "Карта мира пуста или не сгенерирована");
      return;
    }

    // Преобразуем тайлы в двумерную карту
    const mapGrid: any = [];
    for (let x = 0; x < world.sizeX; x++) {
      mapGrid[x] = [];
      for (let y = 0; y < world.sizeY; y++) {
        mapGrid[x][y] = {
          locationId: 0,
          type: "plain",
          label: "Равнина",
          x: x,
          y: y,
        };
      }
    }

    // Заполняем карту данными из базы
    mapTiles.forEach((tile) => {
      if (tile.x < world.sizeX && tile.y < world.sizeY) {
        mapGrid[tile.x][tile.y] = {
          locationId: tile.typeId,
          type: tile.type,
          label: tile.label || tile.type,
          x: tile.x,
          y: tile.y,
        };
      }
    });

    // Подсчитываем статистику
    const stats: any = {};
    mapTiles.forEach((tile) => {
      const label = tile.label || tile.type;
      if (!stats[label]) {
        stats[label] = { count: 0, cells: 0 };
      }
      stats[label].cells++;
    });

    // Подсчитываем количество областей (упрощенно)
    Object.keys(stats).forEach((key) => {
      if (key !== "plain" && key !== "Равнина") {
        stats[key].count = Math.ceil(stats[key].cells / 10); // Примерная оценка
      } else {
        stats[key].count = 1;
      }
    });

    log(`Загружена карта мира ${world.name}: ${mapTiles.length} тайлов`);

    sendSuccess(ws, "system/loadWorldMap", {
      world: world,
      map: mapGrid,
      stats: stats,
      tilesCount: mapTiles.length,
    });
  } catch (error) {
    handleError(error as Error, "SystemHandlers.loadWorldMap");
    sendSystemError(ws, "Ошибка при загрузке карты мира");
  }
}

function handleMap(ws: WebSocket, data: any): void {
  const map = generateMap();
  sendSuccess(ws, "system/map", {
    map: map.map,
    stats: map.stats,
  });
}

// Регистрация обработчиков системных сообщений
export function registerSystemHandlers(): void {
  registerHandler("system", "ping", handlePing);
  registerHandler("system", "pong", handlePong);
  registerHandler("system", "map", handleMap);
  registerHandler("system", "createWorld", handleCreateWorld);
  registerHandler("system", "getWorlds", handleGetWorlds);
  registerHandler("system", "loadWorldMap", handleLoadWorldMap);
}
