import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import dotenv from "dotenv";
import { log, error as logError } from "../utils/logger";
import { Database } from "./models/database";

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

// Создаем экземпляр Kysely
export const db = new Kysely<Database>({
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
