import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { log, error as logError } from "../utils/logger";
import { DB } from "./models/database";
import config from "../../config"; // Обновленный импорт

// Создаем пул подключений к PostgreSQL используя настройки из config
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  max: config.database.pool.max,
  idleTimeoutMillis: config.database.pool.idleTimeout,
  connectionTimeoutMillis: config.database.pool.connectionTimeout,
});

// Обработка ошибок пула
pool.on("error", (err) => {
  logError(`Ошибка пула подключений PostgreSQL: ${err.message}`);
});

// Создаем экземпляр Kysely
export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool,
  }),
});

// Функция для проверки подключения к базе данных
export async function testConnection(): Promise<boolean> {
  try {
    // Выполняем простой запрос для проверки подключения
    await db.selectFrom("players").select("id").limit(1).execute();
    log("Успешное подключение к PostgreSQL через Kysely");
    return true;
  } catch (err) {
    logError(`Ошибка подключения к PostgreSQL через Kysely: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}
