#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Gera o arquivo .env a partir do .env.example,
 * substituindo o placeholder do PASSWORD_PEPPER por um valor aleatorio.
 *
 * Uso: npm run setup:env
 *
 * Seguranca: nao sobrescreve .env existente (protege contra perda de pepper em uso).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const ENV_TARGET = path.join(ROOT, '.env');
const PLACEHOLDER = 'gerar-um-valor-aleatorio-de-64-caracteres-hex';

function main() {
  if (fs.existsSync(ENV_TARGET)) {
    console.log('.env ja existe — nenhuma alteracao feita.');
    console.log('Para regerar, remova o .env existente e rode novamente.');
    process.exit(0);
  }

  if (!fs.existsSync(ENV_EXAMPLE)) {
    console.error('Erro: .env.example nao encontrado em', ENV_EXAMPLE);
    process.exit(1);
  }

  const pepper = crypto.randomBytes(32).toString('hex');
  const content = fs.readFileSync(ENV_EXAMPLE, 'utf-8').replace(PLACEHOLDER, pepper);

  fs.writeFileSync(ENV_TARGET, content, 'utf-8');
  console.log('.env criado com sucesso!');
  console.log('PASSWORD_PEPPER gerado automaticamente (64 chars hex).');
}

main();
