import { registerAuthHandlers } from "./authHandlers";
import { registerChatHandlers } from "./chatHandlers";
import { registerSystemHandlers } from "./systemHandlers";
import { registerMapHandlers } from "./mapHandlers";
import { log } from "../../utils/logger";
import { registerPlayerHandlers } from "./playerHandlers";

// Регистрация всех обработчиков маршрутов
export function registerAllHandlers(): void {
  log("Регистрация обработчиков маршрутов...");

  // Регистрация обработчиков аутентификации
  registerAuthHandlers();

  // Регистрация обработчиков чата
  registerChatHandlers();

  // Регистрация системных обработчиков
  registerSystemHandlers();

  // Регистрация обработчиков карты
  registerMapHandlers();
  registerPlayerHandlers();
  log("Все обработчики маршрутов зарегистрированы");
}
