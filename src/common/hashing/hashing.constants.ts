export const ARGON2_CONFIG = {
  MEMORY_COST: 65536, // 64 MiB (OWASP: minimo 19 MiB)
  TIME_COST: 3, // 3 iteracoes
  PARALLELISM: 1, // 1 thread (previne DoS em web servers)
  HASH_LENGTH: 32, // 256-bit output
} as const;
