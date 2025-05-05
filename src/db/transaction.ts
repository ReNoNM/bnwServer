import { Pool, PoolClient } from "pg";
import pool from "./connection";
import { log, error as logError } from "../utils/logger";

// Тип для функции выполнения транзакции
type TransactionFunction<T> = (client: PoolClient) => Promise<T>;

/**
 * Выполняет операцию внутри транзакции
 * @param fn Функция, которая будет выполнена внутри транзакции
 * @returns Результат выполнения функции или ошибку
 */
export async function withTransaction<T>(fn: TransactionFunction<T>): Promise<T> {
  const client = await pool.connect();

  try {
    // Начинаем транзакцию
    await client.query("BEGIN");

    // Выполняем переданную функцию
    const result = await fn(client);

    // Если всё прошло успешно, фиксируем изменения
    await client.query("COMMIT");

    return result;
  } catch (error) {
    // В случае ошибки откатываем все изменения
    await client.query("ROLLBACK");
    logError(`Ошибка в транзакции: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    throw error;
  } finally {
    // Освобождаем клиента в любом случае
    client.release();
  }
}

/**
 * Выполняет запрос к базе данных с параметрами
 * @param text SQL запрос
 * @param params Параметры запроса
 * @returns Результат запроса
 */
export async function query(text: string, params?: any[]): Promise<any> {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    logError(`Ошибка выполнения запроса: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    throw error;
  }
}
