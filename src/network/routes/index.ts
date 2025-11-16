import { registerAuthHandlers } from "./authHandlers";
import { registerChatHandlers } from "./chatHandlers";
import { registerSystemHandlers } from "./systemHandlers";
import { registerMapHandlers } from "./mapHandlers";
import { log } from "../../utils/logger";
import { registerPlayerHandlers } from "./playerHandlers";
import { registerBuldingHandlers } from "./buldingHandlers";
import { registerTimeHandlers } from "./timeHandlers";

// Регистрация всех обработчиков маршрутов
export function registerAllHandlers(): void {
  log("Регистрация обработчиков маршрутов...");
  registerAuthHandlers();
  registerChatHandlers();
  registerSystemHandlers();
  registerMapHandlers();
  registerPlayerHandlers();
  registerBuldingHandlers();
  registerTimeHandlers();

  log("Все обработчики маршрутов зарегистрированы");
}
