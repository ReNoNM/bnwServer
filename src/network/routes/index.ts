import { registerAuthHandlers } from "./authHandlers";
import { registerChatHandlers } from "./chatHandlers";
import { log } from "../../utils/logger";
import { registerSystemHandlers } from "./systemHandlers";

// Регистрация всех обработчиков маршрутов
export function registerAllHandlers(): void {
  log("Регистрация обработчиков маршрутов...");

  // Регистрация обработчиков аутентификации
  registerAuthHandlers();

  // Регистрация обработчиков чата
  registerChatHandlers();
  registerSystemHandlers();
  // Здесь можно добавить регистрацию других обработчиков

  log("Все обработчики маршрутов зарегистрированы");
}
