import WebSocket from "ws";
import config from "../../config"; // Обновленный импорт
import { handleMessage, addClient, startHeartbeat } from "./socketHandler";
import { log, error as logError } from "../utils/logger";
import { registerAllHandlers } from "./routes";

export function startServer(): void {
  try {
    const port = config.server.port;

    // Проверка корректности порта
    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Некорректный порт: ${config.server.port}`);
    }

    // Регистрируем обработчики всех маршрутов
    registerAllHandlers();

    // Создаем WebSocket сервер
    const wss = new WebSocket.Server({
      port,
      // Добавляем таймаут на соединение
      clientTracking: true,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        // Отключаем контекст дефлатора
        serverNoContextTakeover: true,
        clientNoContextTakeover: true,
      },
    });

    // Обработчик ошибок сервера
    wss.on("error", (err) => {
      logError(`Ошибка WebSocket сервера: ${err.message}`);
    });

    // Обработчик подключений
    wss.on("connection", (ws: WebSocket, req: any) => {
      try {
        const ip = req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "unknown";

        log(`Новое соединение: ${ip} (${userAgent})`);

        // Устанавливаем максимальный размер сообщения
        (ws as any).maxPayload = config.server.maxPayloadSize;

        // Регистрируем клиента
        addClient(ws);

        // Обрабатываем сообщения
        ws.on("message", (data: WebSocket.Data) => {
          try {
            if (typeof data === "string") {
              handleMessage(ws, data);
            } else if (data instanceof Buffer) {
              handleMessage(ws, data.toString());
            }
          } catch (error) {
            logError(`Ошибка обработки сообщения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
          }
        });
      } catch (error) {
        logError(`Ошибка при установке соединения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
        ws.close();
      }
    });

    // Запускаем проверку соединений (heartbeat)
    startHeartbeat();

    log(`WebSocket сервер запущен на порту ${port}`);
  } catch (error) {
    logError(`Невозможно запустить WebSocket сервер: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    process.exit(1);
  }
}
