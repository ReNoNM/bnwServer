import { Kysely } from "kysely";
import { db } from "./connection";
import { log, error as logError } from "../utils/logger";
import { DB } from "./models/database";

/**
 * Выполняет операцию внутри транзакции
 * @param fn Функция, которая будет выполнена внутри транзакции
 * @returns Результат выполнения функции или ошибку
 */
export async function withTransaction<T>(fn: (trx: Kysely<DB>) => Promise<T>): Promise<T> {
  try {
    // Используем встроенный механизм транзакций Kysely
    return await db.transaction().execute(fn);
  } catch (error) {
    logError(`Ошибка в транзакции: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    throw error;
  }
}

/**
 * Выполняет запрос к базе данных
 * @param queryFn Функция, выполняющая запрос к DB
 * @returns Результат запроса
 */
export async function query<T>(queryFn: (db: Kysely<DB>) => Promise<T>): Promise<T> {
  try {
    return await queryFn(db);
  } catch (error) {
    logError(`Ошибка выполнения запроса: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    throw error;
  }
}
