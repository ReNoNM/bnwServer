import crypto from 'crypto';

// Простой механизм создания токенов для авторизации
export function generateToken(userId: string): string {
  const randomPart = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const dataToHash = `${userId}:${randomPart}:${timestamp}`;
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
  
  return `${userId}.${randomPart}.${timestamp}.${hash}`;
}

// Проверка валидности токена
export function validateToken(token: string): { valid: boolean; userId?: string } {
  try {
    const [userId, randomPart, timestamp, hash] = token.split('.');
    
    if (!userId || !randomPart || !timestamp || !hash) {
      return { valid: false };
    }
    
    // Проверяем, не истек ли токен (24 часа)
    const tokenTimestamp = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const tokenAge = currentTime - tokenTimestamp;
    const tokenMaxAge = 24 * 60 * 60 * 1000; // 24 часа
    
    if (tokenAge > tokenMaxAge) {
      return { valid: false };
    }
    
    // Проверяем подпись токена
    const dataToHash = `${userId}:${randomPart}:${timestamp}`;
    const expectedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    
    if (hash !== expectedHash) {
      return { valid: false };
    }
    
    return { valid: true, userId };
  } catch (error) {
    return { valid: false };
  }
}
