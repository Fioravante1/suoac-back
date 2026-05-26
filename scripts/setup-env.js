#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Gera o arquivo .env a partir do .env.example,
 * substituindo placeholders de seguranca por valores aleatorios.
 *
 * Uso: npm run setup:env
 *
 * Seguranca: nao sobrescreve .env existente (protege contra perda de secrets em uso).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const ENV_TARGET = path.join(ROOT, '.env');

/** @type {Array<{ placeholder: string; bytes: number; label: string }>} */
const SECRETS = [
  { placeholder: 'gerar-um-valor-aleatorio-de-64-caracteres-hex', bytes: 32, label: 'PASSWORD_PEPPER' },
  { placeholder: 'gerar-um-valor-aleatorio-para-jwt-secret', bytes: 64, label: 'JWT_SECRET' },
  { placeholder: 'gerar-um-valor-aleatorio-para-jwt-refresh-secret', bytes: 64, label: 'JWT_REFRESH_SECRET' },
  { placeholder: 'gerar-um-valor-aleatorio-para-encryption-key', bytes: 32, label: 'ENCRYPTION_KEY' },
];

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

  let content = fs.readFileSync(ENV_EXAMPLE, 'utf-8');

  for (const { placeholder, bytes, label } of SECRETS) {
    const value = crypto.randomBytes(bytes).toString('hex');
    content = content.replace(placeholder, value);
    console.log(`${label} gerado automaticamente (${bytes * 2} chars hex).`);
  }

  fs.writeFileSync(ENV_TARGET, content, 'utf-8');
  console.log('.env criado com sucesso!');
}

main();
