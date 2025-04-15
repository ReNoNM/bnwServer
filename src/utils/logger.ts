// Уровни логирования
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Настройка логгера
const logConfig = {
  level: process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
  includeTimestamp: true,
  colorize: process.env.NODE_ENV !== "production",
};

// Цвета для консоли
const colors = {
  reset: "\x1b[0m",
  debug: "\x1b[36m", // Голубой
  info: "\x1b[32m", // Зеленый
  warn: "\x1b[33m", // Желтый
  error: "\x1b[31m", // Красный
};

// Основная функция логирования
export function log(message: string, isError: boolean = false): void {
  const level = isError ? LogLevel.ERROR : LogLevel.INFO;

  // Пропускаем, если уровень логирования ниже настроенного
  if (level < logConfig.level) {
    return;
  }

  const timestamp = logConfig.includeTimestamp ? new Date().toISOString() : "";
  const logPrefix = isError ? "[ERROR]" : "[INFO]";

  const formattedMessage = logConfig.includeTimestamp ? `${timestamp} ${logPrefix} ${message}` : `${logPrefix} ${message}`;

  // Выводим сообщение в консоль
  if (logConfig.colorize) {
    const color = isError ? colors.error : colors.info;
    console.log(`${color}${formattedMessage}${colors.reset}`);
  } else {
    console.log(formattedMessage);
  }
}

// Вспомогательные функции для разных типов логов
export function debug(message: string): void {
  if (logConfig.level > LogLevel.DEBUG) return;

  const timestamp = logConfig.includeTimestamp ? new Date().toISOString() : "";
  const formattedMessage = logConfig.includeTimestamp ? `${timestamp} [DEBUG] ${message}` : `[DEBUG] ${message}`;

  if (logConfig.colorize) {
    console.log(`${colors.debug}${formattedMessage}${colors.reset}`);
  } else {
    console.log(formattedMessage);
  }
}

export function warn(message: string): void {
  if (logConfig.level > LogLevel.WARN) return;

  const timestamp = logConfig.includeTimestamp ? new Date().toISOString() : "";
  const formattedMessage = logConfig.includeTimestamp ? `${timestamp} [WARN] ${message}` : `[WARN] ${message}`;

  if (logConfig.colorize) {
    console.log(`${colors.warn}${formattedMessage}${colors.reset}`);
  } else {
    console.log(formattedMessage);
  }
}

export function error(message: string): void {
  log(message, true);
}
