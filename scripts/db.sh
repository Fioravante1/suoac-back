#!/usr/bin/env bash
# ============================================================
# SUOAC Backend - Script unificado para operações de banco
# ============================================================
# Uso:
#   ./scripts/db.sh <comando> <ambiente>
#
# Comandos:
#   migrate   Aplica migrations (dev: migrate dev / staging|prod: migrate deploy)
#   seed      Executa seed do banco
#   status    Mostra status das migrations
#   reset     Reseta o banco (APENAS dev)
#   studio    Abre Prisma Studio
#   push      Sincroniza schema sem migrations (APENAS dev)
#
# Ambientes:
#   dev       Banco local Docker (default)
#   test      Banco local Docker (testes E2E)
#   staging   Banco Neon staging
#   prod      Banco Neon produção
# ============================================================

set -euo pipefail

# ── Cores ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Funções auxiliares ───────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERRO]${NC} $*" >&2; exit 1; }

confirm() {
  local env_name="$1"
  echo -e "${YELLOW}⚠️  Você está prestes a executar contra ${BOLD}${env_name}${NC}${YELLOW}.${NC}"
  read -r -p "Confirmar? (y/N): " response
  [[ "$response" =~ ^[Yy]$ ]] || { info "Operação cancelada."; exit 0; }
}

confirm_double() {
  local env_name="$1"
  echo -e "${RED}🚨 ATENÇÃO: Você está prestes a executar contra ${BOLD}PRODUÇÃO${NC}${RED}.${NC}"
  read -r -p "Digite '${env_name}' para confirmar: " response
  [[ "$response" == "$env_name" ]] || { info "Operação cancelada."; exit 0; }
}

set_node_env() {
  case "$1" in
    dev)     export NODE_ENV=development ;;
    test)    export NODE_ENV=test ;;
    staging) export NODE_ENV=staging ;;
    prod)    export NODE_ENV=production ;;
    *)       error "Ambiente inválido: '$1'. Use: dev, test, staging, prod" ;;
  esac
}

# ── Validação de argumentos ──────────────────────────────────
COMMAND="${1:-}"
ENV="${2:-dev}"

if [[ -z "$COMMAND" ]]; then
  echo -e "${BOLD}Uso:${NC} ./scripts/db.sh <comando> <ambiente>"
  echo ""
  echo "Comandos:"
  echo "  migrate   Aplica migrations"
  echo "  seed      Executa seed do banco"
  echo "  status    Mostra status das migrations"
  echo "  reset     Reseta o banco (APENAS dev/test)"
  echo "  studio    Abre Prisma Studio"
  echo "  push      Sincroniza schema sem migrations (APENAS dev)"
  echo ""
  echo "Ambientes:"
  echo "  dev       Banco local Docker (default)"
  echo "  test      Banco local Docker (testes E2E)"
  echo "  staging   Banco Neon staging"
  echo "  prod      Banco Neon produção"
  exit 0
fi

set_node_env "$ENV"

# ── Comandos ─────────────────────────────────────────────────
case "$COMMAND" in
  migrate)
    case "$ENV" in
      dev)
        info "Criando/aplicando migration em dev..."
        npx prisma migrate dev
        ;;
      test)
        info "Aplicando migrations no banco de testes..."
        npx prisma migrate deploy
        ;;
      staging)
        confirm "STAGING"
        info "Aplicando migrations pendentes em staging..."
        npx prisma migrate deploy
        ;;
      prod)
        confirm_double "prod"
        info "Aplicando migrations pendentes em produção..."
        npx prisma migrate deploy
        ;;
    esac
    success "Migrations aplicadas com sucesso em $ENV."
    ;;

  seed)
    case "$ENV" in
      dev)
        info "Rodando seed de desenvolvimento..."
        ;;
      test)
        info "Rodando seed de testes..."
        ;;
      staging)
        confirm "STAGING"
        info "Rodando seed de staging..."
        ;;
      prod)
        confirm_double "prod"
        info "Rodando seed de produção..."
        ;;
    esac
    npx prisma db seed
    success "Seed executado com sucesso em $ENV."
    ;;

  status)
    info "Status das migrations em $ENV..."
    npx prisma migrate status
    ;;

  reset)
    if [[ "$ENV" != "dev" && "$ENV" != "test" ]]; then
      error "O comando 'reset' só pode ser usado em dev ou test. Ambiente atual: $ENV"
    fi
    warn "Isso vai APAGAR todos os dados e recriar o banco."
    npx prisma migrate reset
    success "Banco resetado com sucesso em $ENV."
    ;;

  studio)
    info "Abrindo Prisma Studio para $ENV..."
    npx prisma studio
    ;;

  push)
    if [[ "$ENV" != "dev" ]]; then
      error "O comando 'push' só pode ser usado em dev. Ambiente atual: $ENV"
    fi
    info "Sincronizando schema com o banco de dev..."
    npx prisma db push
    success "Schema sincronizado com sucesso."
    ;;

  *)
    error "Comando desconhecido: '$COMMAND'. Use: migrate, seed, status, reset, studio, push"
    ;;
esac
