import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

// Функция для получения переменной окружения с проверкой наличия
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    console.warn(`ВНИМАНИЕ: Не найдена переменная окружения ${key}`);
  }
  return value || defaultValue || "";
}

// Функция для получения числового значения
function getNumEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const numValue = parseInt(value, 10);
  if (isNaN(numValue)) {
    console.warn(`ВНИМАНИЕ: Переменная окружения ${key} не является числом, используется значение по умолчанию`);
    return defaultValue;
  }

  return numValue;
}

// Определяем окружение
const NODE_ENV = getEnv("NODE_ENV", "development");

// Конфигурация сервера
const config = {
  // Основные настройки сервера
  server: {
    port: getNumEnv("PORT", 8080),
    logLevel: getEnv("LOG_LEVEL", "INFO"),
    environment: NODE_ENV,
    heartbeatInterval: getNumEnv("HEARTBEAT_INTERVAL", 30000),
    maxPayloadSize: getNumEnv("MAX_PAYLOAD_SIZE", 2097152), // 1MB
  },

  // Настройки базы данных
  database: {
    host: getEnv("DB_HOST", "localhost"),
    port: getNumEnv("DB_PORT", 5432),
    user: getEnv("DB_USER", "postgres"),
    password: getEnv("DB_PASSWORD", "1234"),
    name: getEnv("DB_NAME", "game"),
    pool: {
      max: getNumEnv("DB_POOL_MAX", 20),
      idleTimeout: getNumEnv("DB_IDLE_TIMEOUT", 30000),
      connectionTimeout: getNumEnv("DB_CONNECTION_TIMEOUT", 2000),
    },
  },

  // Настройки безопасности
  security: {
    jwtSecret: getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
    jwtExpiresIn: getEnv("JWT_EXPIRES_IN", "24h"),
    passwordSaltRounds: getNumEnv("PASSWORD_SALT_ROUNDS", 10),
    cors: {
      enabled: getEnv("CORS_ENABLED", "true") === "true",
      origin: getEnv("CORS_ORIGIN", "*"),
    },
  },

  // Настройки чата
  chat: {
    maxHistoryLength: getNumEnv("CHAT_MAX_HISTORY", 100),
    messageRateLimit: getNumEnv("CHAT_RATE_LIMIT", 1000), // ms между сообщениями
  },

  // Настройки логирования
  logging: {
    level: NODE_ENV === "production" ? "INFO" : "DEBUG",
    includeTimestamp: true,
    colorize: NODE_ENV !== "production",
  },

  // Простые функции проверки окружения
  isProduction: NODE_ENV === "production",
  isDevelopment: NODE_ENV === "development",
  isTest: NODE_ENV === "test",
};

export default config;
