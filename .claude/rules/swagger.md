---
paths:
  - "src/**/*.controller.ts"
  - "src/**/dto/**"
---

# Documentacao da API (Swagger / OpenAPI)

O projeto utiliza `@nestjs/swagger` para gerar documentação interativa OpenAPI 3.0 automaticamente.

- **URL:** `http://localhost:8080/api/docs` (disponível apenas quando `NODE_ENV !== 'production'`).
- **CLI Plugin:** Configurado em `nest-cli.json` com `classValidatorShim: true` e `introspectComments: true`. Isso significa que os decorators `@ApiProperty()` **não precisam ser adicionados manualmente** nos DTOs — o plugin infere os tipos automaticamente a partir do TypeScript e dos decorators do `class-validator`.
- **`@ApiTags()`:** Todo controller **deve** ter o decorator `@ApiTags('NomeDoRecurso')` para agrupar endpoints na UI do Swagger.
- **`PartialType`:** Em DTOs de update que usam `PartialType`, o import **deve** vir de `@nestjs/swagger` (não de `@nestjs/mapped-types`), para que os metadados OpenAPI sejam propagados corretamente.
  ```typescript
  // Correto
  import { PartialType } from '@nestjs/swagger';
  // Errado
  import { PartialType } from '@nestjs/mapped-types';
  ```

---
