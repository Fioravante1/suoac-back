import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, encryptValue, hashValue } from './common';

const FIRST_NAMES = [
  // Masculinos
  'João', 'Pedro', 'Lucas', 'Mateus', 'Gabriel', 'Rafael', 'Daniel', 'André',
  'Felipe', 'Marcos', 'Paulo', 'Carlos', 'Roberto', 'Ricardo', 'Fernando',
  'Gustavo', 'Rodrigo', 'Bruno', 'Eduardo', 'Leonardo', 'Diego', 'Vinícius',
  'Thiago', 'Henrique', 'Alexandre', 'Marcelo', 'Fábio', 'Leandro', 'Sérgio', 'Renato',
  // Femininos
  'Maria', 'Ana', 'Juliana', 'Fernanda', 'Camila', 'Patrícia', 'Adriana', 'Luciana',
  'Sandra', 'Márcia', 'Vanessa', 'Cristiane', 'Beatriz', 'Carolina', 'Débora',
  'Gabriela', 'Helena', 'Isabela', 'Jéssica', 'Larissa', 'Mariana', 'Natália',
  'Priscila', 'Raquel', 'Sílvia', 'Amanda', 'Bruna', 'Cláudia', 'Daniela', 'Flávia',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Almeida',
  'Nascimento', 'Lima', 'Araújo', 'Pereira', 'Barros', 'Ribeiro', 'Carvalho',
  'Gomes', 'Martins', 'Rocha', 'Correia', 'Dias', 'Teixeira', 'Lopes', 'Moreira',
  'Nunes', 'Costa', 'Mendes', 'Cavalcante', 'Monteiro', 'Cardoso', 'Batista', 'Campos',
  'Freitas', 'Vieira', 'Barbosa', 'Moura', 'Castro', 'Gonçalves', 'Pinto', 'Duarte',
  'Ramos', 'Pires', 'Melo', 'Cruz', 'Medeiros', 'Miranda', 'Machado', 'Coelho',
  'Andrade', 'Fonseca', 'Cunha', 'Azevedo',
];

const SECOND_LAST_NAMES = [
  'de Souza', 'dos Santos', 'de Oliveira', 'da Silva', 'de Lima',
  'de Almeida', 'do Nascimento', 'da Costa', 'de Carvalho', 'de Araújo',
  'dos Reis', 'de Jesus', 'de Paula', 'de Moraes', 'de Melo',
  'Aparecido', 'Aparecida', 'da Conceição', 'de Fátima', 'Batista',
];

const OBSERVATIONS_LIST = [
  'Cadeirante',
  'Idoso - necessita assistência',
  'Criança (menor de 12 anos)',
  'Gestante',
  'Necessita assento na frente do ônibus',
  'Acompanhante de cadeirante',
];

/** Quantidade de passageiros por congregação (na ordem do seedCommon) */
const PASSENGER_COUNTS = [
  25, // Águas de Março
  18, // Andorinha da Mata
  33, // Carmosina
  12, // Cidade Popular
  40, // Conj. José Bonifácio
  15, // Cosmopolita
  28, // Estrada da Fonte
  10, // Fontoura
  37, // Guaianazes
  22, // Itaquera
  14, // Jardim São Pedro
  31, // Jardim Tamoyo
  19, // Marabá
  40, // Parque do Carmo
  11, // Serra de São Domingos
  26, // Silvianópolis
  35, // Vila Jussara
  16, // Vila Rosa
];

function pick<T>(arr: T[], index: number): T {
  const item = arr[index % arr.length];
  if (item === undefined) {throw new Error('Array inesperadamente vazio');}
  return item;
}

function generateName(congIdx: number, passIdx: number): string {
  const firstName = pick(FIRST_NAMES, congIdx * 7 + passIdx * 3);
  const lastName = pick(LAST_NAMES, congIdx * 11 + passIdx * 7 + 3);

  // ~35% recebem um segundo sobrenome
  if ((congIdx + passIdx) % 3 === 0) {
    const secondLast = pick(SECOND_LAST_NAMES, congIdx * 5 + passIdx * 3 + 1);
    return `${firstName} ${secondLast} ${lastName}`;
  }

  return `${firstName} ${lastName}`;
}

function generateRg(congIdx: number, passIdx: number): string {
  const n1 = ((congIdx * 17 + passIdx * 31 + 42) % 90 + 10).toString();
  const n2 = ((congIdx * 13 + passIdx * 23 + 73) % 900 + 100).toString();
  const n3 = ((congIdx * 19 + passIdx * 29 + 17) % 900 + 100).toString();
  const check = ((congIdx + passIdx * 3) % 10).toString();
  return `${n1}${n2}${n3}${check}`;
}

function generatePhone(congIdx: number, passIdx: number): string | null {
  // ~25% não possuem telefone
  if ((congIdx + passIdx * 3) % 4 === 0) {return null;}
  const d1 = ((congIdx * 17 + passIdx * 31 + 1234) % 9000 + 1000).toString();
  const d2 = ((congIdx * 13 + passIdx * 23 + 5678) % 9000 + 1000).toString();
  return `(11) 9${d1}-${d2}`;
}

function generateObservation(congIdx: number, passIdx: number): string | null {
  // ~8% terão observações
  if ((congIdx * 3 + passIdx * 7) % 12 !== 0) {return null;}
  return pick(OBSERVATIONS_LIST, congIdx + passIdx);
}

export async function seedStagingPassengers(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const { congregations } = context;
  let totalCreated = 0;

  for (let c = 0; c < congregations.length; c++) {
    const cong = congregations[c];
    if (!cong) {continue;}

    const count = PASSENGER_COUNTS[c] ?? 15;
    let congCreated = 0;

    for (let p = 0; p < count; p++) {
      const name = generateName(c, p);
      const rg = generateRg(c, p);
      const rgHash = hashValue(rg);
      const rgEncrypted = encryptValue(rg);
      const phone = generatePhone(c, p);
      const observations = generateObservation(c, p);

      await prisma.passenger.upsert({
        where: { congregationId_rgHash: { congregationId: cong.id, rgHash } },
        update: { name, rgEncrypted, phone, observations },
        create: {
          name,
          rgEncrypted,
          rgHash,
          phone,
          observations,
          congregationId: cong.id,
        },
      });
      congCreated++;
    }

    console.log(`  ${cong.name}: ${congCreated} passageiros`);
    totalCreated += congCreated;
  }

  console.log(`\nPassenger seed completed: ${totalCreated} passageiros em ${congregations.length} congregações`);
}
