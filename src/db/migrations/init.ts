// src/db/migrations/init.ts
import { db } from "../connection";
import { sql } from "kysely";
import { log, error as logError } from "../../utils/logger";

// Определение структуры таблиц
interface TableColumn {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string;
  constraints?: string;
}

interface TableDefinition {
  name: string;
  columns: TableColumn[];
  constraints?: string[];
  indexes?: { name: string; columns: string | string[]; unique?: boolean }[];
}

// Определение всех таблиц и их колонок
const tables: TableDefinition[] = [
  {
    name: "players",
    columns: [
      { name: "id", type: "UUID", constraints: "PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "username", type: "VARCHAR(20)", constraints: "NOT NULL UNIQUE" },
      { name: "email", type: "VARCHAR(100)", constraints: "NOT NULL UNIQUE" },
      { name: "password", type: "VARCHAR(255)", constraints: "NOT NULL" },
      { name: "tag", type: "VARCHAR(50)", nullable: true },
      { name: "tag_position", type: "VARCHAR(50)", nullable: true },
      { name: "created_at", type: "TIMESTAMP WITH TIME ZONE", defaultValue: "CURRENT_TIMESTAMP" },
      { name: "last_login", type: "TIMESTAMP WITH TIME ZONE", nullable: true },
      { name: "status", type: "VARCHAR(10)", defaultValue: "'offline'" },
      { name: "settings", type: "JSONB", defaultValue: "'{}'::jsonb" },
      { name: "main_world_id", type: "UUID" },
    ],
    indexes: [
      { name: "idx_players_username", columns: "username" },
      { name: "idx_players_email", columns: "email" },
      { name: "idx_players_status", columns: "status" },
      { name: "idx_players_tag", columns: "tag" },
    ],
  },
  {
    name: "chat_messages",
    columns: [
      { name: "id", type: "UUID", constraints: "PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "sender_id", type: "UUID", constraints: "NOT NULL REFERENCES players(id)" },
      { name: "message", type: "TEXT", constraints: "NOT NULL" },
      { name: "timestamp", type: "BIGINT", constraints: "NOT NULL" },
      { name: "type", type: "VARCHAR(20)", constraints: "NOT NULL" },
      { name: "receiver_id", type: "UUID", nullable: true, constraints: "REFERENCES players(id)" },
      { name: "metadata", type: "JSONB", defaultValue: "'{}'::jsonb" },
    ],
    indexes: [
      { name: "idx_chat_messages_timestamp", columns: "timestamp DESC" },
      { name: "idx_chat_messages_sender_id", columns: "sender_id" },
      { name: "idx_chat_messages_type", columns: "type" },
    ],
  },
  {
    name: "tokens",
    columns: [
      { name: "id", type: "UUID", constraints: "PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "token", type: "VARCHAR(255)", constraints: "NOT NULL UNIQUE" },
      { name: "user_id", type: "UUID", constraints: "NOT NULL REFERENCES players(id)" },
      { name: "issued_at", type: "BIGINT", constraints: "NOT NULL" },
      { name: "expires_at", type: "BIGINT", constraints: "NOT NULL" },
      { name: "revoked", type: "BOOLEAN", defaultValue: "false" },
      { name: "device_info", type: "JSONB", defaultValue: "'{}'::jsonb" },
    ],
    indexes: [
      { name: "idx_tokens_user_id", columns: "user_id" },
      { name: "idx_tokens_expires_at", columns: "expires_at" },
      { name: "idx_tokens_token", columns: "token" },
      { name: "idx_tokens_revoked", columns: "revoked" },
    ],
  },
  {
    name: "worlds",
    columns: [
      { name: "id", type: "UUID", constraints: "PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "name", type: "VARCHAR(100)", constraints: "NOT NULL" },
      { name: "size_x", type: "INTEGER", constraints: "NOT NULL DEFAULT 50" },
      { name: "size_y", type: "INTEGER", constraints: "NOT NULL DEFAULT 50" },
      { name: "world_type", type: "VARCHAR(50)", constraints: "NOT NULL DEFAULT 'standard'" },
      { name: "created_at", type: "TIMESTAMP WITH TIME ZONE", defaultValue: "CURRENT_TIMESTAMP" },
      { name: "updated_at", type: "TIMESTAMP WITH TIME ZONE", defaultValue: "CURRENT_TIMESTAMP" },
      { name: "players", type: "UUID[]", defaultValue: "'{}'" }, // пустой массив UUID
      { name: "is_open", type: "BOOLEAN", defaultValue: "true" }, // открыто по умолчанию
      { name: "settings", type: "JSONB", defaultValue: "'{}'::jsonb" },
    ],
    indexes: [
      { name: "idx_worlds_name", columns: "name" },
      { name: "idx_worlds_type", columns: "world_type" },
      { name: "idx_worlds_created_at", columns: "created_at" },
    ],
  },
  {
    name: "map",
    columns: [
      { name: "id", type: "UUID", constraints: "PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "world_id", type: "UUID", constraints: "NOT NULL REFERENCES worlds(id) ON DELETE CASCADE" },
      { name: "x", type: "INTEGER", constraints: "NOT NULL" },
      { name: "y", type: "INTEGER", constraints: "NOT NULL" },
      { name: "type", type: "VARCHAR(50)", constraints: "NOT NULL DEFAULT 'plain'" },
      { name: "type_id", type: "INTEGER", constraints: "NOT NULL DEFAULT 0" },
      { name: "label", type: "VARCHAR(100)", defaultValue: "''" },
      { name: "metadata", type: "JSONB", defaultValue: "'{}'::jsonb" },
    ],
    constraints: [
      "UNIQUE(world_id, x, y)", // Уникальная комбинация мира и координат
    ],
    indexes: [
      { name: "idx_map_world_id", columns: "world_id" },
      { name: "idx_map_coordinates", columns: ["world_id", "x", "y"], unique: true },
      { name: "idx_map_type", columns: "type" },
      { name: "idx_map_type_id", columns: "type_id" },
      { name: "idx_map_x", columns: "x" },
      { name: "idx_map_y", columns: "y" },
    ],
  },
];

// Функция для выполнения начальных миграций базы данных
export async function initDatabase(): Promise<void> {
  try {
    // Используем транзакцию Kysely
    await db.transaction().execute(async (trx) => {
      // Обрабатываем каждую таблицу
      for (const table of tables) {
        // Проверяем существование таблицы
        const tableExistsResult = await sql`
          SELECT EXISTS (
            SELECT FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = ${table.name}
          )
        `.execute(trx);

        const tableExists = tableExistsResult.rows[0]?.exists === true;

        if (!tableExists) {
          // Создаем таблицу, если она не существует
          log(`Создание таблицы ${table.name}...`);

          const columnDefinitions = table.columns
            .map((column) => {
              let def = `${column.name} ${column.type}`;
              if (column.nullable === false || column.constraints?.includes("NOT NULL")) {
                def += " NOT NULL";
              }
              if (column.defaultValue) {
                def += ` DEFAULT ${column.defaultValue}`;
              }
              if (column.constraints && !column.constraints.includes("NOT NULL")) {
                def += ` ${column.constraints}`;
              }
              return def;
            })
            .join(", ");

          const createTableQuery = `CREATE TABLE ${table.name} (${columnDefinitions})`;
          await sql`${sql.raw(createTableQuery)}`.execute(trx);

          log(`Таблица ${table.name} успешно создана`);
        } else {
          // Если таблица существует, проверяем наличие всех нужных колонок
          log(`Таблица ${table.name} уже существует, проверяем колонки...`);

          // Получаем список существующих колонок
          const columnsResult = await sql`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = ${table.name} AND table_schema = 'public'
          `.execute(trx);

          const existingColumnNames = columnsResult.rows.map((row: any) => row.column_name);

          // Проверяем каждую колонку и добавляем отсутствующие
          for (const column of table.columns) {
            if (!existingColumnNames.includes(column.name)) {
              log(`Добавление колонки ${column.name} в таблицу ${table.name}...`);

              let alterQuery = `ALTER TABLE ${table.name} ADD COLUMN ${column.name} ${column.type}`;

              if (column.defaultValue) {
                alterQuery += ` DEFAULT ${column.defaultValue}`;
              }

              if (column.constraints && !column.constraints.includes("PRIMARY KEY") && !column.constraints.includes("REFERENCES")) {
                alterQuery += ` ${column.constraints}`;
              }

              await sql`${sql.raw(alterQuery)}`.execute(trx);
              log(`Колонка ${column.name} успешно добавлена в таблицу ${table.name}`);
            }
          }
        }

        // Создаем индексы, если они определены
        if (table.indexes && table.indexes.length > 0) {
          // Получаем существующие индексы для таблицы
          const indexesResult = await sql`
            SELECT indexname FROM pg_indexes
            WHERE tablename = ${table.name} AND schemaname = 'public'
          `.execute(trx);

          const existingIndexes = indexesResult.rows.map((row: any) => row.indexname);

          // Создаем отсутствующие индексы
          for (const index of table.indexes) {
            if (!existingIndexes.includes(index.name)) {
              const uniqueClause = index.unique ? "UNIQUE " : "";
              let columns = index.columns;

              if (Array.isArray(columns)) {
                columns = columns.join(", ");
              }

              const createIndexQuery = `CREATE ${uniqueClause}INDEX ${index.name} ON ${table.name} (${columns})`;

              log(`Создание индекса ${index.name}...`);
              await sql`${sql.raw(createIndexQuery)}`.execute(trx);
              log(`Индекс ${index.name} успешно создан`);
            }
          }
        }
      }
    });

    log("Миграция базы данных успешно завершена");
  } catch (err) {
    logError(`Ошибка при инициализации базы данных: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    throw err;
  }
}
