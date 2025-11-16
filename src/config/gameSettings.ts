// Настройки игровых механик
export const gameSettings = {
  // Настройки игрового цикла
  gameCycle: {
    interval: 30, // секунд между циклами
  },

  // Настройки временных событий
  timeEvents: {
    TICK_INTERVAL: 300,
    BUCKET_SIZE: 5000, // размер bucket в миллисекундах (для группировки событий)
    SAVE_INTERVAL: 5 * 60 * 1000, // интервал очистки завершенных событий
  },
};

export default gameSettings;
