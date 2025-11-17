/**
 * Настройки игрового календаря
 */
export interface CalendarSettings {
  monthsPerYear: number; // месяцев в году (по умолчанию 12)
  daysPerMonth: number; // дней в месяце (по умолчанию 30)
  secondsPerDay: number; // секунд в игровом дне (по умолчанию 30)
}

/**
 * Текущее состояние игрового календаря
 */
export interface CalendarState {
  year: number;
  month: number; // 1-12
  day: number; // 1-30
  lastUpdate: number; // timestamp последнего обновления
}

/**
 * Настройки игры в БД
 */
export interface GameSettings {
  id: string; // 'global' - единственная запись
  calendar: CalendarSettings;
  currentDate: CalendarState;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Дефолтные настройки календаря
 */
export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  monthsPerYear: 12,
  daysPerMonth: 30,
  secondsPerDay: 30,
};

/**
 * Начальное состояние календаря
 */
export const INITIAL_CALENDAR_STATE: CalendarState = {
  year: 1,
  month: 1,
  day: 1,
  lastUpdate: Date.now(),
};
