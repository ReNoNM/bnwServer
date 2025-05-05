import { db } from "../connection";
import { ChatMessage, ChatMessageType } from "../models/chatMessage";
import { log, error as logError } from "../../utils/logger";

// Получение всех сообщений чата
export async function getAll(): Promise<ChatMessage[]> {
  try {
    const results = await db
      .selectFrom("chat_messages as cm")
      .innerJoin("players as p", "cm.sender_id", "p.id")
      .select([
        "cm.id",
        "cm.sender_id as senderId",
        "cm.message",
        "cm.timestamp",
        "cm.type",
        "cm.receiver_id as receiverId",
        "cm.metadata",
        "p.username as senderUsername",
      ])
      .orderBy("cm.timestamp", "asc")
      .execute();

    return results.map((row) => {
      const metadata = (row.metadata as Record<string, any>) || {};
      metadata.username = row.senderUsername;

      return {
        senderId: row.senderId,
        message: row.message,
        timestamp: Number(row.timestamp),
        type: row.type as ChatMessageType,
        receiverId: row.receiverId,
        metadata: metadata,
      } as ChatMessage;
    });
  } catch (err) {
    logError(`Ошибка получения сообщений чата: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Добавление сообщения в чат
export async function add(message: ChatMessage): Promise<ChatMessage | undefined> {
  try {
    const result = await db
      .insertInto("chat_messages")
      .values({
        sender_id: message.senderId,
        message: message.message,
        timestamp: BigInt(message.timestamp),
        type: message.type,
        receiver_id: message.receiverId || null,
        metadata: message.metadata || {},
      })
      .returning(["id", "sender_id as senderId", "message", "timestamp", "type", "receiver_id as receiverId", "metadata"])
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      senderId: result.senderId,
      message: result.message,
      timestamp: Number(result.timestamp),
      type: result.type as ChatMessageType,
      receiverId: result.receiverId,
      metadata: result.metadata as Record<string, any>,
    } as ChatMessage;
  } catch (err) {
    logError(`Ошибка добавления сообщения чата: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Получение последних N сообщений чата
export async function getRecent(limit: number = 50): Promise<ChatMessage[]> {
  try {
    const results = await db
      .selectFrom("chat_messages as cm")
      .innerJoin("players as p", "cm.sender_id", "p.id")
      .select([
        "cm.id",
        "cm.sender_id as senderId",
        "cm.message",
        "cm.timestamp",
        "cm.type",
        "cm.receiver_id as receiverId",
        "cm.metadata",
        "p.username as senderUsername",
      ])
      .orderBy("cm.timestamp", "desc")
      .limit(limit)
      .execute();

    // Преобразуем и сортируем в хронологическом порядке
    return results
      .map((row) => {
        const metadata = (row.metadata as Record<string, any>) || {};
        metadata.username = row.senderUsername;

        return {
          senderId: row.senderId,
          message: row.message,
          timestamp: Number(row.timestamp),
          type: row.type as ChatMessageType,
          receiverId: row.receiverId,
          metadata: metadata,
        } as ChatMessage;
      })
      .reverse();
  } catch (err) {
    logError(`Ошибка получения последних сообщений: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Получение приватных сообщений между двумя пользователями
export async function getPrivate(user1Id: string, user2Id: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const results = await db
      .selectFrom("chat_messages as cm")
      .innerJoin("players as p", "cm.sender_id", "p.id")
      .select([
        "cm.id",
        "cm.sender_id as senderId",
        "cm.message",
        "cm.timestamp",
        "cm.type",
        "cm.receiver_id as receiverId",
        "cm.metadata",
        "p.username as senderUsername",
      ])
      .where("cm.type", "=", "PRIVATE")
      .where((eb) =>
        eb.or([
          eb.and([eb("cm.sender_id", "=", user1Id), eb("cm.receiver_id", "=", user2Id)]),
          eb.and([eb("cm.sender_id", "=", user2Id), eb("cm.receiver_id", "=", user1Id)]),
        ])
      )
      .orderBy("cm.timestamp", "desc")
      .limit(limit)
      .execute();

    return results
      .map((row) => {
        const metadata = (row.metadata as Record<string, any>) || {};
        metadata.username = row.senderUsername;

        return {
          senderId: row.senderId,
          message: row.message,
          timestamp: Number(row.timestamp),
          type: row.type as ChatMessageType,
          receiverId: row.receiverId,
          metadata: metadata,
        } as ChatMessage;
      })
      .reverse();
  } catch (err) {
    logError(`Ошибка получения приватных сообщений: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}
