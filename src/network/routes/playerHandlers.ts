import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendError, sendSuccess } from "../../utils/websocketUtils";
import { log } from "../../utils/logger";
import * as worldRepository from "../../db/repositories/worldRepository";
import { handleError } from "../../utils/errorHandler";
import { playerRepository } from "../../db";

export function registerPlayerHandlers(): void {
  registerHandler("player", "searchWorld", handleSearchWorld);
}

/**
 * Ищем случайный стандартный открытый мир, добавляем туда игрока.
 * Если после добавления стало ровно 20 игроков — закрываем мир.
 * Если миров нет — возвращаем found=false.
 */
async function handleSearchWorld(ws: WebSocket): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id as string | undefined;

    if (!playerId) {
      sendError(ws, "player/searchWorld", "Не удалось определить текущего игрока");
      return;
    }

    // Проверяем, есть ли у игрока уже главный мир
    const player = await playerRepository.getById(playerId);
    if (!player) {
      sendError(ws, "player/searchWorld", "Игрок не найден");
      return;
    }

    if (player.mainWorldId) {
      sendError(ws, "player/searchWorld", "У вас уже есть главный мир");
      return;
    }

    // Берём все миры и фильтруем: стандартные и открытые, без текущего игрока
    const worlds = await worldRepository.getAll();
    const candidates = worlds.filter(
      (w) => w.worldType === "standard" && w.isOpen === true && (!Array.isArray(w.players) || !w.players.includes(playerId))
    );

    if (candidates.length === 0) {
      sendSuccess(ws, "player/searchWorld", { found: false, reason: "NO_OPEN_STANDARD_WORLDS" });
      return;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    const players = Array.isArray(picked.players) ? [...picked.players] : [];
    if (!players.includes(playerId)) {
      players.push(playerId);
    }

    const willClose = players.length === 20;

    await worldRepository.setPlayersAndOpen(picked.id, players, !willClose);

    sendSuccess(ws, "player/searchWorld", {
      found: true,
      worldId: picked.id,
      playersCount: players.length,
    });

    log(`player/searchWorld -> ${picked.id} (players: ${players.length}, closedNow: ${willClose})`);
  } catch (error) {
    handleError(error as Error, "player.searchWorld");
    sendError(ws, "player/searchWorld", "Внутренняя ошибка сервера");
  }
}
