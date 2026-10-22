---
trigger: model_decision
description: Quando criar ou editar lógica de senhas e autenticação em src/common/hashing/**, src/auth/** ou src/users/** (Argon2id + pepper)
paths:
  - "src/common/hashing/**"
  - "src/auth/**"
  - "src/users/**"
---

# Hashing de senhas (Argon2 + pepper)

## Stack
- **Algoritmo**: Argon2id (RFC 9106, recomendado pela OWASP)
- **Biblioteca**: `argon2` (node-argon2) — bindings C nativos com suporte ao parametro `secret`
- **Pepper**: via parametro nativo `secret` do Argon2 (NAO via HMAC pre-hash)

### Configuracao (Parametros)
| Parametro | Valor | Justificativa |
|-----------|-------|---------------|
| `type` | `argon2id` | Hibrido: resistente a side-channel e GPU attacks |
| `memoryCost` | 65536 (64 MiB) | 3.4x acima do minimo OWASP (19 MiB) |
| `timeCost` | 3 | 3 iteracoes |
| `parallelism` | 1 | Previne DoS (cada request aloca memoryCost * p) |
| `hashLength` | 32 | 256-bit output |
| `salt` | Automatico | 16 bytes random por hash (gerenciado pelo argon2) |

### Arquitetura
- **Localizacao**: `src/common/hashing/` (cross-cutting, reutilizavel por auth, users, etc.)
- **HashingService**: Injectable via `HashingModule`, expoe `hash()`, `verify()`, `needsRehash()`
- **Pepper**: carregado de `PASSWORD_PEPPER` env var via `ConfigService`. Fail-fast se ausente.

### Regras
- **Nunca use bcrypt** — Argon2id e o padrao do projeto
- **Nunca implemente hashing fora do HashingService** — centralize toda logica de hashing
- **Nunca logue o pepper** — a redaction do Pino cobre `*.pepper` e `*.secret`
- **Nunca logue password hashes** — a redaction cobre `*.passwordHash`
- **Mock o HashingService nos testes** — apenas `hashing.service.spec.ts` roda argon2 real
- **`needsRehash()`** — usar no login para migracao transparente de parametros

---
