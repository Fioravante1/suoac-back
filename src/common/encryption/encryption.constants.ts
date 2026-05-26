export const ENCRYPTION_CONFIG = {
  ALGORITHM: 'aes-256-gcm',
  IV_LENGTH: 12, // 96-bit IV (recomendado para GCM)
  AUTH_TAG_LENGTH: 16, // 128-bit authentication tag
  KEY_LENGTH: 32, // 256-bit key
} as const;
