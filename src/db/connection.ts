import { Pool } from "pg";
import dotenv from "dotenv";
import { log, error as logError } from "../utils/logger";

// Загружаем переменные окружения
dotenv.config();

// Создаем пул подключений к PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20, // максимальное количество клиентов в пуле
  idleTimeoutMillis: 30000, // сколько времени клиент может быть неактивным до закрытия
  connectionTimeoutMillis: 2000, // таймаут подключения
});

// Обработка ошибок пула
pool.on("error", (err) => {
  logError(`Ошибка пула подключений PostgreSQL: ${err.message}`);
});

// Функция для проверки подключения к базе данных
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    log("Успешное подключение к PostgreSQL");
    client.release();
    return true;
  } catch (err) {
    logError(`Ошибка подключения к PostgreSQL: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Экспортируем пул для использования в других модулях
export default pool;
