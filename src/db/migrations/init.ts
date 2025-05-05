import { db } from "../connection";
import { sql } from "kysely";
import { log, error as logError } from "../../utils/logger";

// Функция для выполнения начальных миграций базы данных
export async function initDatabase(): Promise<void> {
  try {
    // Проверяем существование таблиц перед их созданием
    const tablesResult = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('players', 'chat_messages')
    `.execute(db);

    const existingTables = tablesResult.rows.map((row: any) => row.tablename);
    log(`Существующие таблицы: ${existingTables.join(", ") || "нет"}`);

    // Используем транзакцию Kysely
    await db.transaction().execute(async (trx) => {
      // Создаем таблицу players только если её нет
      if (!existingTables.includes("players")) {
        log("Создание таблицы players...");
        await sql`
          CREATE TABLE players (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(20) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP WITH TIME ZONE,
            status VARCHAR(10) DEFAULT 'offline',
            settings JSONB DEFAULT '{}'::jsonb
          )
        `.execute(trx);
        log("Таблица players успешно создана");
      }

      // Создаем таблицу chat_messages только если её нет
      if (!existingTables.includes("chat_messages")) {
        log("Создание таблицы chat_messages...");
        await sql`
          CREATE TABLE chat_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_id UUID NOT NULL REFERENCES players(id),
            message TEXT NOT NULL,
            timestamp BIGINT NOT NULL,
            type VARCHAR(20) NOT NULL,
            receiver_id UUID REFERENCES players(id),
            metadata JSONB DEFAULT '{}'::jsonb
          )
        `.execute(trx);
        log("Таблица chat_messages успешно создана");
      }

      // Проверяем существование индексов перед их созданием
      const indexesResult = await sql`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND 
              (indexname LIKE 'idx_chat_messages%' OR indexname LIKE 'idx_players%')
      `.execute(trx);

      const existingIndexes = indexesResult.rows.map((row: any) => row.indexname);
      log(`Существующие индексы: ${existingIndexes.join(", ") || "нет"}`);

      // Создаем индексы если их нет
      const indexes = [
        { name: "idx_chat_messages_timestamp", query: "CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp DESC)" },
        { name: "idx_chat_messages_sender_id", query: "CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id)" },
        { name: "idx_chat_messages_type", query: "CREATE INDEX idx_chat_messages_type ON chat_messages(type)" },
        { name: "idx_players_username", query: "CREATE INDEX idx_players_username ON players(username)" },
        { name: "idx_players_status", query: "CREATE INDEX idx_players_status ON players(status)" },
      ];

      for (const index of indexes) {
        if (!existingIndexes.includes(index.name) && existingTables.includes(index.name.split("_")[1])) {
          log(`Создание индекса ${index.name}...`);
          await sql`${sql.raw(index.query)}`.execute(trx);
          log(`Индекс ${index.name} успешно создан`);
        }
      }
    });

    log("Миграция базы данных успешно завершена");
  } catch (err) {
    logError(`Ошибка при инициализации базы данных: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    throw err;
  }
}
