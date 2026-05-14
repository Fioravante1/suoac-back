# SUOAC — Diagrama de Entidades e Relacionamentos

**Versão:** 2.0 | **Atualizado em:** 14/05/2026

> Para visualizar: abra no GitHub, GitLab ou VS Code com a extensão "Markdown Preview Mermaid Support".

```mermaid
erDiagram
  Circuit ||--o{ Congregation : has
  Circuit ||--o{ User : has
  Circuit ||--o{ Event : has
  Circuit ||--o{ Invitation : has
  Congregation ||--o{ User : has
  Congregation ||--o{ Passenger : registers
  Congregation ||--o{ EventPassenger : enrolls
  Congregation ||--o{ CongregationEventStatus : tracks
  Congregation ||--o{ Invitation : has
  User ||--o{ Account : authenticates
  User ||--o{ Invitation : sends
  User ||--o{ AuditLog : generates
  Event ||--o{ EventDay : contains
  Event ||--o{ EventPassenger : enrolls
  Event ||--o{ CongregationEventStatus : tracks
  Passenger ||--o{ EventPassenger : enrolled_in
  EventPassenger ||--o{ EventPassengerDay : attends
  EventPassenger ||--o{ Payment : receives
  EventDay ||--o{ EventPassengerDay : scheduled

  Circuit {
    uuid id PK
    string name
    string city
    string state
    datetime created_at
    datetime updated_at
  }

  Congregation {
    uuid id PK
    uuid circuit_id FK
    string name
    string city
    boolean is_active
    datetime created_at
    datetime updated_at
  }

  User {
    uuid id PK
    uuid circuit_id FK
    uuid congregation_id FK
    string name
    string email UK
    string password_hash
    enum role
    boolean is_active
    datetime created_at
    datetime updated_at
  }

  Account {
    uuid id PK
    uuid user_id FK
    enum provider
    string provider_account_id
    datetime created_at
  }

  Event {
    uuid id PK
    uuid circuit_id FK
    uuid created_by_id FK
    string title
    enum type
    decimal ticket_price
    datetime registration_deadline
    datetime payment_deadline
    string venue
    string address
    string city
    string state
    enum status
    text observations
    datetime created_at
    datetime updated_at
  }

  EventDay {
    uuid id PK
    uuid event_id FK
    int day_number
    date date
    string label
    string departure_time
    string return_time
    enum status
  }

  Passenger {
    uuid id PK
    uuid congregation_id FK
    string name
    string rg_encrypted
    string rg_hash UK
    string phone
    text observations
    datetime created_at
    datetime updated_at
  }

  EventPassenger {
    uuid id PK
    uuid event_id FK
    uuid passenger_id FK
    uuid congregation_id FK
    uuid registered_by_id FK
    decimal total_amount
    decimal paid_amount
    enum payment_status
    string exemption_reason
    text observations
    datetime created_at
    datetime updated_at
  }

  EventPassengerDay {
    uuid id PK
    uuid event_passenger_id FK
    uuid event_day_id FK
    boolean checked_in
    datetime checked_in_at
  }

  Payment {
    uuid id PK
    uuid event_passenger_id FK
    uuid registered_by_id FK
    decimal amount
    datetime paid_at
    text observations
    datetime created_at
  }

  CongregationEventStatus {
    uuid id PK
    uuid congregation_id FK
    uuid event_id FK
    uuid finalized_by_id FK
    enum status
    datetime finalized_at
    datetime created_at
  }

  Invitation {
    uuid id PK
    uuid circuit_id FK
    uuid congregation_id FK
    uuid created_by_id FK
    string email
    enum role
    string token UK
    datetime expires_at
    datetime used_at
    datetime created_at
  }

  AuditLog {
    uuid id PK
    uuid user_id FK
    string action
    string entity
    uuid entity_id
    json details
    string ip
    datetime created_at
  }
```

## Resumo dos relacionamentos

- **Circuit** → raiz multi-tenant. Tudo pertence a um circuito.
- **Congregation** → pertence a um Circuit. Quantidade ilimitada.
- **User** → pertence a um Circuit, opcionalmente a uma Congregation (null para coordenadores do circuito).
- **Account** → providers de autenticação (LOCAL, GOOGLE) vinculados ao User.
- **Event** → criado pelo coordenador do circuito. Contém EventDays.
- **EventDay** → cada dia do evento (sexta, sábado, domingo).
- **Passenger** → cadastro base por congregação (nome + RG criptografado).
- **EventPassenger** → inscrição de um passageiro em um evento.
- **EventPassengerDay** → quais dias o passageiro vai (pivot entre EventPassenger e EventDay).
- **Payment** → registros individuais de pagamento (suporta parciais).
- **CongregationEventStatus** → se a congregação finalizou sua lista para o evento.
- **Invitation** → convites para novos usuários.
- **AuditLog** → registro de todas as ações no sistema.
