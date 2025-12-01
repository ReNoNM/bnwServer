import { db } from "../../db/connection";
import { inventoryRepository } from "../../db/repositories";
import { log, error as logError } from "../../utils/logger";

/**
 * Получить информацию о контейнере и его предметах
 */
export async function getInventory(containerId: string) {
  try {
    const container = await inventoryRepository.getContainer(containerId);
    if (!container) return null;

    const items = await inventoryRepository.getItems(containerId);

    return {
      info: container,
      items: items,
    };
  } catch (err) {
    logError(`inventoryEngine.getInventory error: ${err}`);
    return null;
  }
}

/**
 * Добавить предмет в контейнер.
 * Автоматически ищет место: либо стакает, либо кладет в первый свободный слот.
 */
export async function addItem(
  containerId: string,
  itemType: string,
  quantity: number,
  metadata: any = {}
): Promise<{ success: boolean; reason?: string; item?: any }> {
  try {
    return await db.transaction().execute(async (trx) => {
      // 1. Получаем инфо о контейнере (нужна capacity)
      const container = await inventoryRepository.getContainer(containerId);
      if (!container) return { success: false, reason: "Container not found" };

      // 2. Пытаемся найти такой же предмет для стака
      const existingItem = await inventoryRepository.getItemByType(containerId, itemType);

      if (existingItem) {
        // --- СТАК ---
        const newQuantity = existingItem.quantity + quantity;
        await inventoryRepository.updateItemQuantity(existingItem.id, newQuantity);

        return {
          success: true,
          item: { ...existingItem, quantity: newQuantity },
        };
      } else {
        // --- НОВЫЙ СЛОТ ---

        const items = await inventoryRepository.getItems(containerId);
        const occupiedSlots = new Set(items.map((i) => i.slot_index));

        // Ищем первый свободный
        let freeSlot = -1;
        for (let i = 0; i < container.capacity; i++) {
          if (!occupiedSlots.has(i)) {
            freeSlot = i;
            break;
          }
        }

        if (freeSlot === -1) {
          return { success: false, reason: "Inventory full" };
        }

        const newItem = await inventoryRepository.addItem({
          containerId,
          itemType,
          quantity,
          slotIndex: freeSlot,
          metadata,
        });

        return { success: true, item: newItem };
      }
    });
  } catch (err) {
    logError(`inventoryEngine.addItem error: ${err}`);
    return { success: false, reason: "Internal error" };
  }
}

/**
 * Перемещение предмета внутри контейнера (Drag & Drop / Swap)
 */
export async function moveItem(containerId: string, fromSlot: number, toSlot: number): Promise<{ success: boolean; reason?: string }> {
  if (fromSlot === toSlot) return { success: false, reason: "Same slot" };

  try {
    return await db.transaction().execute(async (trx) => {
      // 1. Проверяем контейнер
      const container = await inventoryRepository.getContainer(containerId);
      if (!container) return { success: false, reason: "Container not found" };

      if (toSlot < 0 || toSlot >= container.capacity) {
        return { success: false, reason: "Invalid target slot" };
      }

      // 2. Получаем предмет-источник
      const sourceItem = await inventoryRepository.getItemAtSlot(containerId, fromSlot);
      if (!sourceItem) return { success: false, reason: "No item at source slot" };

      // 3. Получаем предмет-цель
      const targetItem = await inventoryRepository.getItemAtSlot(containerId, toSlot);

      if (targetItem) {
        // --- ОБМЕН (Swap) ---
        // Используем временный слот -1, чтобы обойти UNIQUE constraint

        // Target -> -1
        await inventoryRepository.setTempSlot(targetItem.id);

        // Source -> Target
        await inventoryRepository.updateItemSlot(sourceItem.id, toSlot);

        // Target (-1) -> Source
        await inventoryRepository.updateItemSlot(targetItem.id, fromSlot);
      } else {
        // --- ПЕРЕМЕЩЕНИЕ В ПУСТОТУ ---
        await inventoryRepository.updateItemSlot(sourceItem.id, toSlot);
      }

      return { success: true };
    });
  } catch (err) {
    logError(`inventoryEngine.moveItem error: ${err}`);
    return { success: false, reason: "Internal error" };
  }
}

/**
 * Удалить предмет (или часть стака) из конкретного слота
 */
export async function removeItem(containerId: string, slotIndex: number, amount: number): Promise<{ success: boolean; reason?: string }> {
  try {
    return await db.transaction().execute(async (trx) => {
      const item = await inventoryRepository.getItemAtSlot(containerId, slotIndex);

      if (!item) return { success: false, reason: "Item not found" };

      if (item.quantity < amount) {
        return { success: false, reason: "Not enough quantity" };
      }

      if (item.quantity === amount) {
        // Удаляем запись
        await inventoryRepository.deleteItem(item.id);
      } else {
        // Уменьшаем кол-во
        await inventoryRepository.updateItemQuantity(item.id, item.quantity - amount);
      }

      return { success: true };
    });
  } catch (err) {
    logError(`inventoryEngine.removeItem error: ${err}`);
    return { success: false, reason: "Internal error" };
  }
}
