# Roadmap — Dores do Coordenador de Circuito

**Origem:** conversa com um coordenador de circuito em 17/06/2026.
**Objetivo:** registrar as dores reais, mapeá-las para o que já existe / o que falta, e definir
prioridade para acompanhamento no `PROGRESS.md`.

---

## Resumo

| # | Dor | Encaixe no projeto | Esforço | Status |
|---|---|---|---|---|
| 1 | Listas de passageiros por congregação p/ a empresa | PDF por congregação (já existe) | Baixo (só validar formato) | ✅ Implementado |
| 2 | Compartilhar carros por localidade das congregações | BusesModule (novo) + localidade | Alto | ⬜ Não iniciado |
| 3 | Recibos de pagamento por congregação no fim do arranjo | Extrato de pagamentos + recibo PDF | Médio | ✅ Implementado (19/06) — extrato + recibo PDF (S-24-T) |
| 4 | Relatório de gastos por evento (S-26 / S-44) | Despesas (novo model) + relatório oficial | Médio-alto | ⬜ Não iniciado |
| 5 | Orientações do manual para os irmãos | Conteúdo/ajuda | Baixo | ⬜ Não iniciado |

---

## Dor 1 — Listas de passageiros por congregação para a empresa

**O que é:** o coordenador precisa entregar à empresa de ônibus a relação de passageiros, separada
por congregação.

**Onde se encaixa:** **já implementado.** Endpoint:

```
GET /circuits/:circuitId/events/:eventId/passengers/export.pdf?congregationId=<uuid>
```

Gera o PDF filtrado por congregação, agrupado, com `# / Nome / Telefone / Observações` (+ `RG` quando
`includeSensitive=true`, restrito a roles de circuito).

**Lacuna / próximo passo:** confirmar com o coordenador **quais campos a empresa de ônibus exige**.
Se houver requisito específico (ex.: ordem, colunas adicionais, totais por ponto de embarque), é um
ajuste pequeno no `PdfService`.

**Ação:** validação de requisito (sem código até confirmar o formato).

---

## Dor 2 — Compartilhar os carros entre congregações por localidade

**O que é:** distribuir/compartilhar ônibus (ou carros) entre congregações considerando a
**localidade** de cada uma (proximidade), otimizando a logística do circuito.

**Onde se encaixa:** **BusesModule** (logística) — não existe ainda.

**Lacunas (importante):**
- ⚠️ **Models `Bus` e `BusAllocation` NÃO existem** no `schema.prisma`. (O `PROGRESS.md` afirmava o
  contrário; já corrigido.)
- ⚠️ **Falta granularidade de localidade:** `Congregation` só tem `city` (opcional). Para alocar por
  proximidade seria preciso enriquecer o modelo (bairro/região, ou ponto de embarque, ou
  coordenadas).

**Esboço de escopo (a detalhar):**
1. Modelar `Bus` (capacidade, dia/evento, ponto de saída) e `BusAllocation` (cota por congregação).
2. Enriquecer `Congregation` com localidade (decisão de negócio: bairro? ponto de embarque? geo?).
3. Lógica de sugestão de compartilhamento por proximidade.
4. Integração com `EventPassenger` para controle de capacidade.

**Por que é o mais complexo:** envolve modelagem nova, dado de localidade que ainda não temos, e
regra de alocação. Recomenda-se fazer **depois** das dores de menor esforço.

---

## Dor 3 — Recibos de pagamento por congregação no fim do arranjo

**O que é:** ao final do evento/arranjo, enviar a cada congregação um **recibo** consolidando os
pagamentos recebidos.

**Onde se encaixa:** Financeiro + PDF.

**Dependência:** o **extrato consolidado de pagamentos do evento** — Item 2 do
`PLANO_FINANCEIRO_ROADMAP.md`, ✅ **concluído em 19/06/2026**:

```
GET /events/:eventId/payments?congregationId=<uuid>&page=&limit=
```

**Caminho:**
1. ~~Implementar o extrato (Item 2) — `payments.service.findByEvent`.~~ ✅ Feito.
2. ~~Gerar o **recibo em PDF por congregação** (Fase 2 do roadmap financeiro).~~ ✅ Feito (19/06/2026):
   `GET /circuits/:circuitId/events/:eventId/payments/receipt.pdf` preenche o formulário oficial
   **S-24-T** (Cenário B — chapado) por coordenadas com `pdf-lib`.

**Esforço:** médio. Boa relação valor/esforço, pois reaproveita a base de PDF e o extrato.

---

## Dor 4 — Relatório de gastos por evento (formulários S-26 e S-44)

**O que é:** montar o relatório de **gastos por evento** nos formulários oficiais **S-26** e **S-44**.

**Onde se encaixa:** Financeiro — relatório oficial.

**Lacuna estrutural (importante):**
- ⚠️ Hoje o sistema só registra **receitas** (pagamentos de ingresso). **Não há model de
  despesas/gastos.** Antes do relatório, é preciso **modelar despesas** por evento (tipo, valor,
  data, descrição, comprovante?).

**Escopo (a detalhar):**
1. Modelar `Expense` (despesa) vinculada ao evento + CRUD.
2. Definir, com o coordenador, **quais campos os formulários S-26 e S-44 exigem** (layout oficial).
3. Geração do relatório no formato dos formulários (PDF, possivelmente XLSX).

**Esforço:** médio-alto, com decisão de negócio relevante (campos dos formulários).

---

## Dor 5 — Orientações do manual para os irmãos

**O que é:** disponibilizar, dentro do sistema, algumas **orientações do manual** para os irmãos.

**Onde se encaixa:** conteúdo/ajuda — novo, simples.

**Opções:**
- Conteúdo **estático** (textos fixos servidos pela API ou direto no front).
- Módulo de **conteúdo editável** (se o circuito quiser manter/atualizar as orientações).

**Decisão pendente:** de onde vem o conteúdo (fixo vs. editável) e quem mantém.

**Esforço:** baixo. Pode entrar a qualquer momento, independente das demais.

---

## Priorização recomendada (valor × esforço)

1. **Dor 1** — validar formato da lista com a empresa (provavelmente já pronto).
2. **Extrato de pagamentos (Item 2 financeiro) → Dor 3 (recibos)** — alto valor, base pronta.
3. **Dor 5 (orientações)** — rápido, ganho de UX.
4. **Dor 4 (gastos S-26/S-44)** — exige modelar despesas; nova fase financeira.
5. **Dor 2 (carros por localidade / BusesModule)** — maior; precisa de dados de localidade antes.
