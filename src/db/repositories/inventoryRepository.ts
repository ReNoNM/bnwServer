import { Selectable } from "kysely";
import { db } from "../connection";
import { error as logError } from "../../utils/logger";
import { InventoryItems, Containers } from "../models/database";

// --- КОНТЕЙНЕРЫ ---

// Используем Selectable<Containers> вместо просто Containers
export async function createContainer(capacity: number, type: string = "default"): Promise<Selectable<Containers> | null> {
  try {
    const result = await db
      .insertInto("containers")
      .values({
        capacity,
        type,
      })
      .returningAll()
      .executeTakeFirst();

    return result || null;
  } catch (err) {
    logError(`inventoryRepository.createContainer error: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export async function getContainer(containerId: string): Promise<Selectable<Containers> | null> {
  try {
    const result = await db.selectFrom("containers").selectAll().where("id", "=", containerId).executeTakeFirst();

    return result || null;
  } catch (err) {
    logError(`inventoryRepository.getContainer error: ${err}`);
    return null;
  }
}

// --- ПРЕДМЕТЫ ---

export async function getItems(containerId: string): Promise<Selectable<InventoryItems>[]> {
  try {
    return await db.selectFrom("inventory_items").selectAll().where("container_id", "=", containerId).orderBy("slot_index", "asc").execute();
  } catch (err) {
    logError(`inventoryRepository.getItems error: ${err}`);
    return [];
  }
}

export async function getItemAtSlot(containerId: string, slotIndex: number): Promise<Selectable<InventoryItems> | undefined> {
  try {
    return await db
      .selectFrom("inventory_items")
      .selectAll()
      .where("container_id", "=", containerId)
      .where("slot_index", "=", slotIndex)
      .executeTakeFirst();
  } catch (err) {
    logError(`inventoryRepository.getItemAtSlot error: ${err}`);
    return undefined;
  }
}

// Поиск предмета определенного типа (для стаканья)
export async function getItemByType(containerId: string, itemType: string): Promise<Selectable<InventoryItems> | undefined> {
  try {
    // Берем первый попавшийся, если их несколько
    return await db
      .selectFrom("inventory_items")
      .selectAll()
      .where("container_id", "=", containerId)
      .where("item_type", "=", itemType)
      .limit(1)
      .executeTakeFirst();
  } catch (err) {
    logError(`inventoryRepository.getItemByType error: ${err}`);
    return undefined;
  }
}

export async function addItem(data: {
  containerId: string;
  itemType: string;
  quantity: number;
  slotIndex: number;
  metadata?: any;
}): Promise<Selectable<InventoryItems> | null> {
  try {
    const result = await db
      .insertInto("inventory_items")
      .values({
        container_id: data.containerId,
        item_type: data.itemType,
        quantity: data.quantity,
        slot_index: data.slotIndex,
        metadata: JSON.stringify(data.metadata || {}),
      })
      .returningAll()
      .executeTakeFirst();
    return result || null;
  } catch (err) {
    logError(`inventoryRepository.addItem error: ${err}`);
    return null;
  }
}

export async function updateItemQuantity(itemId: string, newQuantity: number): Promise<boolean> {
  try {
    await db.updateTable("inventory_items").set({ quantity: newQuantity }).where("id", "=", itemId).execute();
    return true;
  } catch (err) {
    logError(`inventoryRepository.updateItemQuantity error: ${err}`);
    return false;
  }
}

export async function updateItemSlot(itemId: string, newSlotIndex: number): Promise<boolean> {
  try {
    await db.updateTable("inventory_items").set({ slot_index: newSlotIndex }).where("id", "=", itemId).execute();
    return true;
  } catch (err) {
    logError(`inventoryRepository.updateItemSlot error: ${err}`);
    return false;
  }
}

export async function deleteItem(itemId: string): Promise<boolean> {
  try {
    await db.deleteFrom("inventory_items").where("id", "=", itemId).execute();
    return true;
  } catch (err) {
    logError(`inventoryRepository.deleteItem error: ${err}`);
    return false;
  }
}

export async function setTempSlot(itemId: string): Promise<void> {
  await db.updateTable("inventory_items").set({ slot_index: -1 }).where("id", "=", itemId).execute();
}
