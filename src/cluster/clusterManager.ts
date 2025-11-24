import cluster from "cluster";
import os from "os";
import { startServer } from "../network/websocketServer";
import { log, error as logError } from "../utils/logger";
import { initializeDatabase } from "../db";
import { initializeTimeManager, stopTimeManager } from "../game/engine/timeManager";
import { initializeGameCycle } from "../game/engine/gameEventSystem";

// Определяем оптимальное количество рабочих процессов
const determineWorkerCount = (): number => {
  const cpuCount = 1; //os.cpus().length;

  // Используем CPU count - 1, чтобы оставить один поток для ОС
  // Минимум 1 процесс, максимум количество ядер
  return Math.max(1, Math.min(cpuCount - 1, cpuCount));
};

export function startCluster(): void {
  if (cluster.isPrimary) {
    const numWorkers = determineWorkerCount();
    log(`Основной процесс ${process.pid} запущен`);
    log(`Запуск ${numWorkers} рабочих процессов...`);

    const tokensCleanupInterval = 60 * 60 * 1000; // 1 час
    setInterval(async () => {
      try {
        const { cleanupExpiredTokens } = require("../db/repositories/tokenRepository");
        const deletedCount = await cleanupExpiredTokens();
        if (deletedCount > 0) {
          log(`Очищено ${deletedCount} устаревших токенов`);
        }
      } catch (err) {
        logError(`Ошибка при очистке устаревших токенов: ${err}`);
      }
    }, tokensCleanupInterval);

    // Создаём workers
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    // Обработка выхода worker'а
    cluster.on("exit", (worker, code, signal) => {
      const exitReason = signal || code;

      if (exitReason !== 0) {
        logError(`Рабочий процесс ${worker.process.pid} завершился с кодом ${exitReason}. Перезапуск...`);
        cluster.fork();
      } else {
        log(`Рабочий процесс ${worker.process.pid} завершил работу корректно.`);
      }
    });

    // Обработка сообщений от worker'ов
    cluster.on("message", (worker, message) => {
      if (message.type === "LOG") {
        log(`[Worker ${worker.id}] ${message.data}`);
      }
    });

    // Обработка сигналов завершения
    process.on("SIGTERM", () => {
      log("Получен сигнал SIGTERM. Завершение работы...");

      // Завершаем все worker'ы и затем завершаем основной процесс
      for (const id in cluster.workers) {
        if (cluster.workers[id]) {
          cluster.workers[id]?.kill();
        }
      }

      setTimeout(() => {
        log("Все рабочие процессы завершены. Выключение сервера.");
        process.exit(0);
      }, 5000);
    });

    process.on("SIGINT", () => {
      log("Получен сигнал SIGINT. Завершение работы...");

      // Завершаем все worker'ы и затем завершаем основной процесс
      for (const id in cluster.workers) {
        if (cluster.workers[id]) {
          cluster.workers[id]?.kill();
        }
      }

      setTimeout(() => {
        log("Все рабочие процессы завершены. Выключение сервера.");
        process.exit(0);
      }, 5000);
    });
  } else {
    // Код для worker процесса
    try {
      // Инициализируем базу данных перед запуском сервера
      initializeDatabase()
        .then(async () => {
          // 1. Инициализируем TimeManager (чистая библиотека)
          await initializeTimeManager();
          log("TimeManager инициализирован");

          // 2. Инициализируем игровой цикл (игровая механика)
          await initializeGameCycle();
          log("GameCycle инициализирован");

          // 3. После успешной инициализации запускаем сервер
          startServer();
          log(`Рабочий процесс ${process.pid} запущен`);
        })
        .catch((err) => {
          logError(`Ошибка инициализации: ${err.message}`);
          process.exit(1);
        });

      // Обработка неперехваченных исключений
      process.on("uncaughtException", (error) => {
        logError(`Непойманное исключение в рабочем процессе ${process.pid}: ${error.message}`);
        logError(error.stack || "Стек вызовов недоступен");

        // В продакшене, возможно, стоит завершить процесс и позволить кластеру перезапустить его
        if (process.env.NODE_ENV === "production") {
          process.exit(1);
        }
      });

      // Обработка отклонённых промисов
      process.on("unhandledRejection", (reason, promise) => {
        logError(`Необработанное отклонение промиса в рабочем процессе ${process.pid}: ${reason}`);

        // В продакшене, возможно, стоит завершить процесс
        if (process.env.NODE_ENV === "production") {
          process.exit(1);
        }
      });

      // Корректная остановка при завершении процесса
      process.on("SIGTERM", async () => {
        log("Worker: Получен SIGTERM, остановка...");
        await stopTimeManager();
        process.exit(0);
      });

      process.on("SIGINT", async () => {
        log("Worker: Получен SIGINT, остановка...");
        await stopTimeManager();
        process.exit(0);
      });
    } catch (error) {
      logError(`Ошибка запуска рабочего процесса ${process.pid}: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
      process.exit(1);
    }
  }
}
