# SUOAC - Sistema Unificado de Ônibus para Assembleias e Congressos

**Documento de Requisitos**
**Versão:** 2.0
**Data:** 14/05/2026

---

## Sumário

1. [Introdução](#1-introdução)
2. [Requisitos Funcionais](#2-requisitos-funcionais)
3. [Requisitos Não Funcionais](#3-requisitos-não-funcionais)
4. [Funcionalidades Adicionais Sugeridas](#4-funcionalidades-adicionais-sugeridas)
5. [Fluxo Principal do Sistema](#5-fluxo-principal-do-sistema)
6. [Regras de Negócio](#6-regras-de-negócio)
7. [Stack Tecnológica](#7-stack-tecnológica)
8. [Considerações Finais](#8-considerações-finais)

---

## 1. INTRODUÇÃO

Este documento descreve os requisitos funcionais e não funcionais para o desenvolvimento de um sistema web e mobile destinado a organizar o arranjo unificado de ônibus para assembleias e congressos das congregações de um circuito.

### 1.1 Objetivo do Sistema

Facilitar o gerenciamento de inscrições, pagamentos e logística de transporte de irmãos para eventos religiosos, proporcionando uma visão panorâmica para os coordenadores do circuito e permitindo que cada congregação gerencie seus próprios participantes.

### 1.2 Contexto

- Quantidade variável de congregações por circuito (sem limite fixo)
- Cada congregação possui um coordenador e um assistente
- O circuito possui um coordenador geral e um assistente
- Eventos recorrentes: assembleias (1 dia) e congressos (múltiplos dias, tipicamente sexta a domingo)

### 1.3 Mudanças em relação à v1

- Suporte completo a eventos multi-dia (congressos de sexta a domingo)
- Inscrição de passageiros por dia do evento (parcial ou completa)
- Cálculo automático do valor total (valor da passagem × dias selecionados)
- Gestão de ocupação do ônibus por dia
- Funcionalidades adicionais de usabilidade e operação

---

## 2. REQUISITOS FUNCIONAIS

### 2.1 Gestão de Usuários e Permissões

#### 2.1.1 Perfis de Acesso

- **Coordenador do Circuito:** Visão completa do sistema, cria eventos, define prazos e valores, visualiza todas as congregações, gera relatórios gerais
- **Assistente do Circuito:** Mesmas permissões do coordenador (perfil de backup)
- **Coordenador da Congregação:** Visão e gestão exclusiva da sua congregação
- **Assistente da Congregação:** Mesmas permissões do coordenador da congregação

#### 2.1.2 Funcionalidades de Usuários

- Login e autenticação por perfil (e-mail + senha ou conta Google via OAuth 2.0)
- Cadastro e gerenciamento das congregações do circuito (quantidade ilimitada)
- Cadastro de coordenadores e assistentes por congregação
- Recuperação de senha (para contas com e-mail + senha)
- Vinculação de conta: usuário que cadastrou com e-mail pode vincular sua conta Google posteriormente (e vice-versa)
- Registro de auditoria (quem fez o quê e quando)
- Primeiro acesso via convite do coordenador do circuito (link ou código)

---

### 2.2 Gestão de Eventos

#### 2.2.1 Criação de Evento (Coordenador do Circuito)

Campos obrigatórios ao criar um evento:

- **Título do evento** (ex: "Assembleia de Circuito - Janeiro 2026")
- **Tipo de evento:** Assembleia ou Congresso Regional
- **Quantidade de dias do evento:** 1 dia (assembleia) ou múltiplos dias (congresso)
- **Datas do evento:** para eventos de 1 dia, uma data. Para eventos multi-dia, data de início e data de término. O sistema deve gerar automaticamente a lista de dias do evento a partir desse intervalo
- **Local do evento:** nome, endereço, cidade, estado
- **Valor da passagem (por dia):** valor único definido para o evento (ex: R$ 40,00). O valor total do passageiro é calculado multiplicando esse valor pela quantidade de dias em que ele se inscreveu
- **Prazo de inscrição:** data limite para cadastro de passageiros
- **Prazo de pagamento:** data limite para pagamento
- **Horário(s) de saída e retorno:** por dia do evento
- **Capacidade máxima de passageiros:** por ônibus e/ou total
- **Observações gerais:** campo livre para informações adicionais
- **Status do evento:** Rascunho, Aberto para inscrições, Inscrições encerradas, Finalizado

#### 2.2.2 Cálculo do Valor do Passageiro

O coordenador do circuito define um valor único de passagem ao criar o evento. O valor total de cada passageiro é calculado automaticamente:

- **Valor total = valor da passagem × quantidade de dias selecionados**
- Exemplo: passagem do congresso = R$ 40,00. Passageiro vai sexta e domingo (2 dias) → paga R$ 80,00. Passageiro vai os 3 dias → paga R$ 120,00
- Assembleia de 1 dia: o valor é simplesmente o valor da passagem

#### 2.2.3 Dias do Evento (EventDay)

Para cada dia do evento, o sistema deve armazenar:

- Data específica (ex: sexta 16/01, sábado 17/01, domingo 18/01)
- Rótulo do dia (ex: "Dia 1 - Sexta-feira", "Dia 2 - Sábado")
- Horário de saída
- Horário previsto de retorno
- Status do dia (ativo/cancelado — para lidar com cancelamentos parciais, ex: chuva no domingo)

#### 2.2.4 Ciclo de Vida do Evento

1. **Rascunho:** Evento criado mas não visível para congregações. Coordenador do circuito pode editar livremente
2. **Aberto para inscrições:** Evento publicado. Congregações podem cadastrar passageiros. Edições limitadas (não pode alterar datas já com inscrições). O prazo de inscrição (`registrationDeadline`) só pode ser alterado pelo coordenador do circuito
3. **Inscrições encerradas:** Prazo de inscrição expirou ou foi encerrado manualmente. Apenas coordenador do circuito pode adicionar/remover passageiros
4. **Finalizado:** Evento concluído. Dados em modo somente leitura para consulta e relatórios

---

### 2.3 Gestão de Passageiros

#### 2.3.1 Cadastro de Passageiro (Coordenador/Assistente da Congregação)

Campos por passageiro:

- Nome completo
- RG (documento de identidade)
- Telefone de contato (opcional, mas recomendado)
- Observações (ex: menor de idade, necessidade especial, acompanhante)
- **Dias do evento em que irá:** seleção de quais dias o passageiro participará (checkbox por dia). Para assembleias de 1 dia, seleção automática
- **Valor calculado:** valor da passagem × quantidade de dias selecionados (cálculo automático)
- **Status de pagamento:** Pendente, Pago parcial, Pago, Isento
- **Valor pago:** valor efetivamente recebido

#### 2.3.2 Inscrição por Dia

- Ao cadastrar um passageiro em um evento multi-dia, o coordenador seleciona os dias em que o passageiro irá (ex: sexta e domingo, mas não sábado)
- O valor total é calculado automaticamente com base nos dias escolhidos
- O coordenador pode alterar os dias de um passageiro já inscrito (adicionar ou remover dias), desde que o evento esteja no status "Aberto para inscrições"
- A alteração de dias recalcula automaticamente o valor

#### 2.3.3 Reutilização de Dados de Passageiros

- O sistema deve manter um cadastro base de passageiros por congregação (nome + RG), independente de eventos
- Ao cadastrar um passageiro para um novo evento, o coordenador pode buscar pelo nome ou RG e reaproveitar os dados do cadastro base, evitando redigitação
- Se o passageiro não existir no cadastro base, o sistema cria automaticamente ao cadastrar no evento

#### 2.3.4 Validações

- Não permitir RG duplicado no mesmo evento (mesmo passageiro em duas congregações)
- Alertar se um passageiro for cadastrado sem telefone de contato
- Validar formato do RG

---

### 2.4 Gestão Financeira

#### 2.4.1 Controle de Pagamento por Passageiro

- Registrar valor pago por passageiro
- Permitir pagamento parcial (ex: pagou metade agora, metade depois)
- Registrar data do pagamento
- Registrar quem registrou o pagamento (auditoria)
- Isenção de pagamento com campo de justificativa obrigatória

#### 2.4.2 Resumo Financeiro por Congregação

- Total de passageiros inscritos
- Total de passageiros por dia (para eventos multi-dia)
- Valor total esperado (soma dos valores calculados)
- Valor total recebido
- Valor pendente (diferença)
- Lista de passageiros com pagamento pendente

#### 2.4.3 Resumo Financeiro do Circuito (Coordenador do Circuito)

- Visão consolidada de todas as congregações
- Ranking de congregações por percentual de pagamento
- Total geral arrecadado vs. total esperado
- Exportação de relatório financeiro (PDF ou planilha)

---

### 2.5 Dashboard e Visões

#### 2.5.1 Dashboard do Circuito (Coordenador/Assistente do Circuito)

- Evento ativo atual com status geral
- Total de passageiros inscritos (geral e por dia do evento)
- Ocupação dos ônibus (geral e por dia)
- Percentual de pagamentos recebidos
- Lista de congregações com status resumido (inscritos, pagos, pendentes)
- Prazo restante para inscrição e pagamento
- Alertas: congregações que ainda não inscreveram ninguém, prazos próximos do vencimento, capacidade próxima do limite

#### 2.5.2 Dashboard da Congregação (Coordenador/Assistente da Congregação)

- Evento ativo com informações gerais (datas, valor, prazos)
- Lista de passageiros cadastrados pela congregação, com dias selecionados e status de pagamento
- Resumo financeiro da congregação (total esperado, recebido, pendente)
- Prazo restante para inscrição e pagamento
- Ações rápidas: cadastrar passageiro, registrar pagamento

---

### 2.6 Comunicação e Notificações

#### 2.6.1 Notificações no Sistema

- Notificação ao coordenador da congregação quando um novo evento é publicado
- Lembrete de prazo de inscrição (ex: 3 dias antes, 1 dia antes)
- Lembrete de prazo de pagamento
- Notificação ao coordenador do circuito quando uma congregação finaliza suas inscrições
- Alerta de capacidade atingida

#### 2.6.2 Exportação de Listas

- Exportar lista de passageiros por congregação (nome, RG, dias) em PDF ou planilha
- Exportar lista geral do evento (todos os passageiros de todas as congregações)
- Exportar lista por dia do evento (quem vai na sexta, quem vai no sábado, etc.)
- Exportar relatório financeiro

---

## 3. REQUISITOS NÃO FUNCIONAIS

### 3.1 Segurança

- Criptografia de dados sensíveis (RG) em repouso (AES-256-GCM)
- HTTPS obrigatório em todas as comunicações
- Autenticação via JWT com refresh token
- Proteção contra ataques comuns (CSRF, XSS, SQL Injection)
- Conformidade com LGPD: consentimento para armazenamento de dados pessoais, possibilidade de exclusão de dados a pedido do titular
- Controle de acesso por perfil (RBAC) em todas as rotas da API
- Rate limiting para proteção contra abuso

### 3.2 Performance

- Tempo de resposta da API inferior a 500ms para operações comuns
- Interface responsiva (web + mobile) com carregamento rápido
- Suporte a uso simultâneo por múltiplos coordenadores sem conflitos

### 3.3 Disponibilidade

- Sistema disponível 24/7, com tolerância a downtime planejado
- Backup automático do banco de dados

### 3.4 Usabilidade

- Interface intuitiva para usuários com diferentes níveis de familiaridade tecnológica
- Design responsivo (funcionar bem em celular e desktop)
- Feedback visual claro para ações do usuário (salvamento, erros, confirmações)
- Fluxos curtos: cadastrar um passageiro não deve exigir mais de 3 cliques após acessar o evento

### 3.5 Escalabilidade

- Arquitetura preparada para suportar mais congregações no futuro, caso o arranjo cresça
- Estrutura multi-tenant por circuito (caso o sistema seja adotado por outros circuitos)

---

## 4. FUNCIONALIDADES ADICIONAIS SUGERIDAS

### 4.1 Histórico de Eventos

- Manter registro de todos os eventos passados com seus dados completos
- Permitir consultar passageiros e financeiro de eventos anteriores
- Útil para planejamento: "quantos passageiros tivemos no congresso passado?"

### 4.2 Importação e Exportação em Lote

- Importar lista de passageiros via planilha (CSV/XLSX) — para congregações que já possuem listas prontas
- Exportar dados do evento em formatos variados (PDF, XLSX, CSV)

### 4.3 Lista de Presença / Check-in

- No dia do evento, o coordenador pode fazer check-in dos passageiros no embarque
- Registro de quem efetivamente embarcou vs. quem estava inscrito
- Check-in por dia em eventos multi-dia
- Útil para controle de assentos livres e no-shows

### 4.4 Gestão de Ônibus

- Cadastrar quantidade de ônibus disponíveis para o evento
- Definir capacidade por ônibus
- Visualizar ocupação por ônibus e por dia
- Opcional: alocação de passageiros por ônibus (mapa de assentos simplificado ou apenas lista por ônibus)

### 4.5 Ponto de Encontro

- Cadastrar pontos de encontro/embarque por congregação ou região
- Definir horário de embarque por ponto
- Passageiro pode ser associado a um ponto de embarque

### 4.6 Relatórios e Estatísticas

- Relatório de frequência: quais congregações participam mais, quais menos
- Evolução de passageiros ao longo dos eventos (gráfico de tendência)
- Relatório de inadimplência por congregação
- Comparativo entre eventos (este congresso vs. congresso anterior)

### 4.7 Cancelamento e Substituição

- Permitir cancelamento de passageiro com registro do motivo
- Permitir substituição: passageiro A cancela, passageiro B assume a vaga
- Regras configuráveis: até quando pode cancelar sem perder o valor, se há reembolso

### 4.8 Confirmação de Inscrição pela Congregação

- Após cadastrar todos os passageiros, o coordenador da congregação pode marcar a lista como "finalizada"
- Isso sinaliza ao coordenador do circuito que aquela congregação concluiu seu processo
- O coordenador do circuito visualiza quais congregações já finalizaram e quais ainda estão pendentes

### 4.9 Modo Offline (Mobile)

- Em áreas com conexão instável, permitir cadastro de passageiros offline com sincronização posterior
- Sincronizar dados quando a conexão for restabelecida

### 4.10 Acompanhamento em Tempo Real do Ônibus

Permite que coordenadores e assistentes (tanto do circuito quanto das congregações) acompanhem a localização do ônibus em tempo real no mapa durante o trajeto do evento.

#### Funcionalidades:

- Mapa em tempo real exibindo a posição atual do ônibus durante ida e volta
- Disponível para: coordenador e assistente do circuito, coordenadores e assistentes das congregações
- Ativação por dia do evento: o rastreamento é habilitado por dia (ex: rastrear na sexta, rastrear no domingo)
- Indicação visual do status do ônibus: parado no ponto de embarque, em trânsito (ida), no local do evento, em trânsito (volta), viagem finalizada

#### Modo de funcionamento:

- Uma pessoa designada no ônibus (ex: o motorista ou um coordenador presente) compartilha a localização via GPS do celular pelo próprio app
- O app envia atualizações periódicas de geolocalização ao servidor (ex: a cada 30 segundos)
- Os coordenadores e assistentes visualizam a posição atualizada no mapa em tempo real
- Previsão estimada de chegada (ETA) com base na posição atual e no destino

#### Considerações técnicas:

- Requer permissão de geolocalização no dispositivo do compartilhador
- Comunicação via WebSocket ou Server-Sent Events para atualizações em tempo real
- Consumo de bateria: o app deve otimizar o envio de localização para não drenar a bateria excessivamente
- Fallback: se o compartilhador perder conexão, exibir a última posição conhecida com timestamp ("última atualização há X minutos")
- O compartilhamento de localização deve ser iniciado e encerrado manualmente (botão "Iniciar rastreamento" / "Encerrar rastreamento")

---

## 5. FLUXO PRINCIPAL DO SISTEMA

### 5.1 Fluxo para Eventos de 1 Dia (Assembleia)

| Etapa | Ação | Responsável |
|-------|------|-------------|
| 1 | Criar evento com data, local, valor e prazos | Coord. Circuito |
| 2 | Publicar evento (status "Aberto para inscrições") | Coord. Circuito |
| 3 | Cadastrar passageiros (nome, RG, pagamento) | Coord. Congregação |
| 4 | Registrar pagamentos recebidos | Coord. Congregação |
| 5 | Finalizar lista da congregação | Coord. Congregação |
| 6 | Acompanhar panorama geral (inscritos, pagamentos) | Coord. Circuito |
| 7 | Encerrar inscrições (manual ou automático por prazo) | Coord. Circuito |
| 8 | Gerar listas e relatórios finais | Coord. Circuito |
| 9 | Check-in no dia do evento (opcional) | Coord. Congregação |
| 10 | Finalizar evento | Coord. Circuito |

### 5.2 Fluxo para Eventos Multi-dia (Congresso)

| Etapa | Ação | Responsável |
|-------|------|-------------|
| 1 | Criar evento com datas de início/fim, quantidade de dias, valor da passagem e prazos | Coord. Circuito |
| 2 | Publicar evento | Coord. Circuito |
| 3 | Cadastrar passageiros selecionando os dias em que cada um irá | Coord. Congregação |
| 4 | Sistema calcula valor automaticamente (passagem × dias selecionados) | Sistema |
| 5 | Registrar pagamentos (total ou parcial) | Coord. Congregação |
| 6 | Finalizar lista da congregação | Coord. Congregação |
| 7 | Acompanhar panorama geral por dia (quantos na sexta, quantos no sábado, etc.) | Coord. Circuito |
| 8 | Encerrar inscrições | Coord. Circuito |
| 9 | Gerar listas por dia (lista de embarque da sexta, lista do sábado, etc.) | Coord. Circuito |
| 10 | Check-in por dia (opcional) | Coord. Congregação |
| 11 | Finalizar evento | Coord. Circuito |

---

## 6. REGRAS DE NEGÓCIO

1. **Prazos:** Após o prazo de inscrição, apenas o coordenador do circuito pode adicionar ou remover participantes
2. **Pagamentos:** Coordenador da congregação só pode registrar pagamentos da sua própria congregação
3. **Edição de inscrição:** Dados dos participantes (incluindo dias selecionados) podem ser editados enquanto o evento estiver "Aberto para inscrições"
4. **Cancelamento:** Participante pode ser removido até a data limite definida pelo coordenador do circuito. Após essa data, apenas o coordenador do circuito pode remover
5. **Capacidade:** Sistema deve alertar quando atingir 80% e 100% da capacidade (geral e por dia em eventos multi-dia)
6. **Isenções:** Isenções de pagamento exigem justificativa e ficam registradas com data e responsável
7. **Duplicatas:** Sistema deve impedir cadastro de RG duplicado no mesmo evento, mesmo entre congregações diferentes
8. **Fechamento:** Após finalização do evento, nenhuma alteração é permitida (somente visualização e relatórios)
9. **Recálculo automático:** Qualquer alteração nos dias de um passageiro recalcula o valor (valor da passagem × dias selecionados)
10. **Dias do evento:** Cada dia do evento tem controle independente de ocupação. Um ônibus pode estar lotado na sexta mas ter vagas no domingo
11. **Consistência financeira:** O valor pago nunca pode exceder o valor calculado. Se os dias forem reduzidos e o valor pago for maior que o novo valor calculado, o sistema deve alertar sobre crédito/reembolso
12. **Permissões hierárquicas:** Coordenador do circuito pode fazer tudo que o coordenador da congregação faz, mas não o contrário
13. **Prazo de inscrição:** Com o evento aberto, apenas o coordenador do circuito pode prorrogar ou alterar o prazo de inscrição (`registrationDeadline`). Assistentes do circuito não têm essa permissão

---

## 7. STACK TECNOLÓGICA

### 7.1 Visão Geral da Arquitetura

O sistema é composto por dois backends e um frontend:

- **Monolito principal (NestJS + Fastify):** responsável por toda a lógica de negócio — autenticação, eventos, congregações, passageiros, pagamentos, relatórios
- **Serviço de tracking em tempo real (Go):** responsável exclusivamente pelo rastreamento GPS dos ônibus em tempo real. Será desenvolvido em fase posterior, após o MVP
- **Frontend (Next.js):** interface web responsiva (mobile-first) consumindo ambos os backends

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                │
│              React · TypeScript · MUI               │
└──────────┬──────────────────────────┬───────────────┘
           │ REST API                 │ WebSocket
           ▼                          ▼
┌─────────────────────┐   ┌─────────────────────────┐
│  Monolito (NestJS)  │   │  Tracking Service (Go)  │
│  Fastify adapter    │   │  WebSocket · GPS         │
│  TypeScript         │   │  Fase pós-MVP            │
└─────────┬───────────┘   └──────────┬──────────────┘
          │                          │
          ▼                          ▼
┌─────────────────────┐   ┌─────────────────────────┐
│   Neon PostgreSQL   │   │    Redis (Upstash)      │
│   (serverless)      │   │  (coordenadas em cache)  │
└─────────────────────┘   └─────────────────────────┘
```

### 7.2 Backend — Monolito Principal

| Camada | Tecnologia |
|--------|-----------|
| Framework | NestJS com Fastify adapter |
| Linguagem | TypeScript |
| ORM | Prisma |
| Banco de dados | Neon PostgreSQL (serverless, free tier) |
| Autenticação | JWT (access + refresh token) + Google OAuth 2.0 |
| Validação | class-validator + class-transformer (padrão NestJS) |
| Documentação da API | Swagger (via @nestjs/swagger) |
| Testes | Jest (unitários) + Supertest (e2e) |
| Criptografia (RG) | AES-256-GCM |

#### Estrutura modular do NestJS:

- **AuthModule** — login (e-mail/senha + Google OAuth 2.0), registro, JWT, guards, refresh token, vinculação de contas
- **UsersModule** — gestão de usuários e perfis (RBAC)
- **CongregationsModule** — cadastro e gestão das congregações
- **EventsModule** — criação, ciclo de vida e configuração de eventos
- **EventDaysModule** — dias do evento, horários, status por dia
- **PassengersModule** — cadastro base de passageiros e inscrições por evento/dia
- **PaymentsModule** — registro e controle de pagamentos
- **ReportsModule** — geração de relatórios e exportações (PDF, XLSX)
- **NotificationsModule** — alertas e lembretes do sistema

### 7.3 Backend — Serviço de Tracking (Go)

| Camada | Tecnologia |
|--------|-----------|
| Linguagem | Go |
| Comunicação | WebSocket (gorilla/websocket ou nhooyr/websocket) |
| Cache | Redis via Upstash (armazenar última posição conhecida) |
| Autenticação | Validação de JWT emitido pelo monolito |

#### Responsabilidades:

- Receber coordenadas GPS do compartilhador (celular no ônibus)
- Distribuir posição em tempo real para os listeners (coordenadores/assistentes)
- Armazenar última posição no Redis (fallback se conexão cair)
- Calcular ETA estimado
- Gerenciar ciclo de vida do rastreamento (iniciar/encerrar)

#### Integração com o monolito:

- O serviço Go valida os JWTs emitidos pelo monolito (mesma chave de assinatura)
- Consulta o monolito via REST para saber quais eventos/ônibus estão ativos
- Não acessa o PostgreSQL diretamente — é independente do banco principal

### 7.4 Frontend

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js (App Router) |
| Linguagem | TypeScript |
| UI Library | Material-UI (MUI) |
| Gerenciamento de estado servidor | TanStack Query (React Query) |
| Formulários | React Hook Form + Zod |
| Mapas (tracking) | Leaflet ou Google Maps API |
| Gráficos (dashboards) | Recharts |
| HTTP Client | Axios ou fetch nativo |

#### Abordagem:

- Mobile-first: maioria dos coordenadores usará pelo celular
- PWA (Progressive Web App): instalável no celular sem necessidade de app store
- Responsivo: funciona em desktop para relatórios e dashboards

### 7.5 Infraestrutura e DevOps

| Item | Tecnologia |
|------|-----------|
| Containerização | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Hospedagem | VPS (ex: DigitalOcean, Hetzner, ou Railway) |
| Banco de dados | Neon PostgreSQL (serverless, free tier) |
| Cache | Redis via Upstash (serverless, free tier) |
| MCP Server | Neon MCP Server (desenvolvimento e migrations) |
| Monitoramento | Logs estruturados (Winston/Pino no NestJS) |
| Backup | Time travel do Neon (6h) + backup diário via cron/pg_dump em storage externo |

#### Detalhes do Neon (Free Tier):

- 100 projetos disponíveis (SUOAC usa 1-2: produção + staging)
- 100 CU-hrs mensais por projeto (~400h de compute ativo com 0.25 CU mínimo)
- 0.5 GB de storage por projeto (consumo estimado do SUOAC: ~50-60 MB/ano)
- Autoscaling até 2 CU (8 GB RAM) em picos de demanda
- Scale-to-zero: compute desliga automaticamente sem uso, ideal para o padrão sazonal do SUOAC
- Branching: branches do banco para testar migrations com segurança antes de aplicar em produção
- Time travel: restauração de dados para qualquer ponto das últimas 6 horas
- MCP Server: gerenciamento do banco via AI (Cursor, Claude Code) durante o desenvolvimento
- Compatível com Prisma ORM sem nenhuma configuração especial

### 7.6 Segurança

- HTTPS obrigatório (certificado via Let's Encrypt)
- Criptografia de dados sensíveis (RG) em repouso com AES-256-GCM
- JWT com expiração curta (access token ~15min) + refresh token (HttpOnly cookie)
- Google OAuth 2.0 como método alternativo de login (via @nestjs/passport + passport-google-oauth20)
- RBAC implementado via Guards do NestJS
- Rate limiting via @nestjs/throttler
- Helmet para headers de segurança
- CORS configurado por domínio
- Conformidade LGPD

---

## 8. CONSIDERAÇÕES FINAIS

### 8.1 Próximos Passos

1. ~~Definição da stack tecnológica~~ ✅
2. Modelagem do banco de dados (Prisma schema)
3. Setup do projeto (monorepo ou repos separados, configuração inicial NestJS + Next.js)
4. Criação de wireframes e protótipos de interface
5. Desenvolvimento do MVP
6. Deploy e testes com usuários reais
7. Fase pós-MVP: serviço de tracking em Go, check-in, importação em lote

### 8.2 Priorização para MVP

O MVP deve cobrir o fluxo essencial: criar evento (com suporte a multi-dia), cadastrar passageiros (com seleção de dias), registrar pagamentos, e visualizar dashboards. Funcionalidades como check-in, importação em lote, modo offline, gestão de ônibus e tracking em tempo real (Go) serão adicionadas em fases posteriores.

### 8.3 Observações

- O sistema deve ser desenvolvido com foco na simplicidade de uso, considerando que os usuários podem ter diferentes níveis de familiaridade com tecnologia
- A interface deve ser clara, intuitiva e funcionar bem em celular, já que a maioria dos coordenadores usará o sistema pelo smartphone
- Os dados dos irmãos (especialmente RG) devem ser tratados com o máximo de cuidado e em conformidade com a LGPD
- O serviço de tracking em Go será o primeiro projeto real em Go do desenvolvedor, servindo também como aprendizado da linguagem

---

**Fim do Documento**
