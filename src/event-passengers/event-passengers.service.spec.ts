import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { EncryptionService } from '../common/encryption/encryption.service';
import { CongregationEventStatusService } from '../congregation-event-status/congregation-event-status.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PassengersService } from '../passengers/passengers.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPassengersService } from './event-passengers.service';

// ── Types ────────────────────────────────────────────────────────
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

interface PrismaEventDay {
  id: string;
  dayNumber: number;
  date: Date;
  label: string;
  departureTime: string;
  returnTime: string;
  status: string;
  eventId: string;
}

interface PrismaEvent {
  id: string;
  title: string;
  type: string;
  ticketPrice: unknown;
  status: string;
  registrationDeadline: Date;
  paymentDeadline: Date;
  venue: string;
  address: string;
  city: string;
  state: string;
  observations: string | null;
  circuitId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  eventDays: PrismaEventDay[];
}

interface PrismaPassenger {
  id: string;
  name: string;
  rgEncrypted: string;
  rgHash: string;
  phone: string | null;
  observations: string | null;
  congregationId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaEventPassengerDay {
  id: string;
  checkedIn: boolean;
  checkedInAt: Date | null;
  eventPassengerId: string;
  eventDayId: string;
  eventDay: { dayNumber: number; date: Date; label: string };
}

interface PrismaEventPassenger {
  id: string;
  totalAmount: unknown;
  paidAmount: unknown;
  paymentStatus: string;
  exemptionReason: string | null;
  observations: string | null;
  eventId: string;
  passengerId: string;
  congregationId: string;
  registeredById: string;
  createdAt: Date;
  updatedAt: Date;
  passenger: PrismaPassenger;
  eventPassengerDays: PrismaEventPassengerDay[];
}

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const PASSENGER_ID = 'p1p2p3p4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const EP_ID = 'ep1ep2e3-0000-0000-0000-000000000001';
const DAY_ID_1 = 'd1d2d3d4-0000-0000-0000-000000000001';
const DAY_ID_2 = 'd1d2d3d4-0000-0000-0000-000000000002';
const DAY_ID_3 = 'd1d2d3d4-0000-0000-0000-000000000003';
const RG_HASH = 'a'.repeat(64);
const ENCRYPTED_RG = 'base64-encrypted-rg';
const DECRYPTED_RG = '12345678X';

const FUTURE_DEADLINE = new Date('2099-12-31T23:59:59Z');
const PAST_DEADLINE = new Date('2020-01-01T00:00:00Z');

// ── Helpers ──────────────────────────────────────────────────────
function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'user@test.com',
    role: overrides.role ?? 'CONGREGATION_COORDINATOR',
    circuitId: overrides.circuitId ?? 'circuit-1',
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

function buildEventDay(overrides: Partial<PrismaEventDay> = {}): PrismaEventDay {
  return {
    id: overrides.id ?? DAY_ID_1,
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-06-01'),
    label: overrides.label ?? 'Dia 1 - Sábado',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '22:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? EVENT_ID,
  };
}

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? EVENT_ID,
    title: overrides.title ?? 'Assembleia de Circuito',
    type: overrides.type ?? 'ASSEMBLY',
    ticketPrice: overrides.ticketPrice ?? 25.0,
    status: overrides.status ?? 'OPEN',
    registrationDeadline: overrides.registrationDeadline ?? FUTURE_DEADLINE,
    paymentDeadline: overrides.paymentDeadline ?? FUTURE_DEADLINE,
    venue: overrides.venue ?? 'Salão',
    address: overrides.address ?? 'Rua A',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    observations: overrides.observations ?? null,
    circuitId: overrides.circuitId ?? 'circuit-1',
    createdById: overrides.createdById ?? USER_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    eventDays: overrides.eventDays ?? [buildEventDay()],
  };
}

function buildPassenger(overrides: Partial<PrismaPassenger> = {}): PrismaPassenger {
  return {
    id: overrides.id ?? PASSENGER_ID,
    name: overrides.name ?? 'João Silva',
    rgEncrypted: overrides.rgEncrypted ?? ENCRYPTED_RG,
    rgHash: overrides.rgHash ?? RG_HASH,
    phone: overrides.phone ?? '11999999999',
    observations: overrides.observations ?? null,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildEventPassenger(overrides: Partial<PrismaEventPassenger> = {}): PrismaEventPassenger {
  return {
    id: overrides.id ?? EP_ID,
    totalAmount: overrides.totalAmount ?? 25.0,
    paidAmount: overrides.paidAmount ?? 0,
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    exemptionReason: overrides.exemptionReason ?? null,
    observations: overrides.observations ?? null,
    eventId: overrides.eventId ?? EVENT_ID,
    passengerId: overrides.passengerId ?? PASSENGER_ID,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    registeredById: overrides.registeredById ?? USER_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    passenger: overrides.passenger ?? buildPassenger(),
    eventPassengerDays: overrides.eventPassengerDays ?? [
      {
        id: 'epd-1',
        checkedIn: false,
        checkedInAt: null,
        eventPassengerId: EP_ID,
        eventDayId: DAY_ID_1,
        eventDay: { dayNumber: 1, date: new Date('2026-06-01'), label: 'Dia 1 - Sábado' },
      },
    ],
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventPassengersService', () => {
  let service: EventPassengersService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let encryptionMock: jest.Mocked<EncryptionService>;
  let passengersServiceMock: jest.Mocked<PassengersService>;
  let congregationEventStatusMock: jest.Mocked<CongregationEventStatusService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    encryptionMock = {
      encrypt: jest.fn().mockReturnValue(ENCRYPTED_RG),
      decrypt: jest.fn().mockReturnValue(DECRYPTED_RG),
      hash: jest.fn().mockReturnValue(RG_HASH),
    } as unknown as jest.Mocked<EncryptionService>;
    passengersServiceMock = {
      create: jest.fn(),
      findByCongregation: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<PassengersService>;
    congregationEventStatusMock = {
      findByEvent: jest.fn(),
      updateStatus: jest.fn(),
      ensureNotFinalized: jest.fn(),
    } as unknown as jest.Mocked<CongregationEventStatusService>;

    const module = await Test.createTestingModule({
      providers: [
        EventPassengersService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: EncryptionService, useValue: encryptionMock },
        { provide: PassengersService, useValue: passengersServiceMock },
        { provide: CongregationEventStatusService, useValue: congregationEventStatusMock },
      ],
    }).compile();

    service = module.get(EventPassengersService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve inscrever passageiro existente com dados válidos (ASSEMBLY)', async () => {
      const user = buildUser();
      const event = buildEvent();
      const passenger = buildPassenger();
      const ep = buildEventPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      const result = await service.create(EVENT_ID, user, { passengerId: PASSENGER_ID });

      expect(result.id).toBe(EP_ID);
      expect(result.passenger.rg).toBe(DECRYPTED_RG);
      expect(result.totalAmount).toBe('25');
      expect(result.days).toHaveLength(1);
      expect(prismaMock.eventPassenger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: EVENT_ID,
            passengerId: PASSENGER_ID,
            congregationId: CONGREGATION_ID,
          }),
        }),
      );
    });

    it('deve auto-criar passageiro inline e inscrevê-lo', async () => {
      const user = buildUser();
      const event = buildEvent();
      const ep = buildEventPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      passengersServiceMock.create.mockResolvedValue({
        id: PASSENGER_ID,
        name: 'João Silva',
        rg: DECRYPTED_RG,
        phone: '11999999999',
        observations: null,
        congregationId: CONGREGATION_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.passenger.findUnique.mockResolvedValue(buildPassenger());
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      const result = await service.create(EVENT_ID, user, {
        name: 'João Silva',
        rg: '12.345.678-X',
        phone: '11999999999',
      });

      expect(result.id).toBe(EP_ID);
      expect(passengersServiceMock.create).toHaveBeenCalledWith(
        CONGREGATION_ID,
        {
          name: 'João Silva',
          rg: '12.345.678-X',
          phone: '11999999999',
        },
        user,
      );
    });

    it('deve auto-selecionar o único dia ACTIVE para ASSEMBLY (ignora dayIds)', async () => {
      const user = buildUser();
      const event = buildEvent();
      const ep = buildEventPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(buildPassenger());
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      await service.create(EVENT_ID, user, { passengerId: PASSENGER_ID, dayIds: ['random-id'] });

      expect(prismaMock.eventPassenger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventPassengerDays: { create: [{ eventDayId: DAY_ID_1 }] },
          }),
        }),
      );
    });

    it('deve calcular totalAmount como ticketPrice * dias selecionados', async () => {
      const user = buildUser();
      const event = buildEvent({
        type: 'REGIONAL_CONVENTION',
        ticketPrice: 30.0,
        eventDays: [
          buildEventDay({ id: DAY_ID_1 }),
          buildEventDay({ id: DAY_ID_2, dayNumber: 2 }),
          buildEventDay({ id: DAY_ID_3, dayNumber: 3 }),
        ],
      });
      const ep = buildEventPassenger({ totalAmount: 90.0 });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(buildPassenger());
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      await service.create(EVENT_ID, user, {
        passengerId: PASSENGER_ID,
        dayIds: [DAY_ID_1, DAY_ID_2, DAY_ID_3],
      });

      expect(prismaMock.eventPassenger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmount: 90 }),
        }),
      );
    });

    it('deve definir paymentStatus como EXEMPT quando exemptionReason é enviado', async () => {
      const user = buildUser();
      const event = buildEvent();
      const ep = buildEventPassenger({ paymentStatus: 'EXEMPT', exemptionReason: 'Pioneiro regular' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(buildPassenger());
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      const result = await service.create(EVENT_ID, user, {
        passengerId: PASSENGER_ID,
        exemptionReason: 'Pioneiro regular',
      });

      expect(result.paymentStatus).toBe('EXEMPT');
      expect(prismaMock.eventPassenger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentStatus: 'EXEMPT',
            exemptionReason: 'Pioneiro regular',
          }),
        }),
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.create(EVENT_ID, buildUser(), { passengerId: PASSENGER_ID })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar UnprocessableEntityException quando o evento não está OPEN', async () => {
      const event = buildEvent({ status: 'DRAFT' });
      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.create(EVENT_ID, buildUser(), { passengerId: PASSENGER_ID })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando prazo expirou para role de congregação', async () => {
      const event = buildEvent({ registrationDeadline: PAST_DEADLINE });
      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(
        service.create(EVENT_ID, buildUser({ role: 'CONGREGATION_COORDINATOR' }), { passengerId: PASSENGER_ID }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve permitir inscrição após prazo para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });
      const event = buildEvent({ registrationDeadline: PAST_DEADLINE });
      const passenger = buildPassenger();
      const ep = buildEventPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);
      prismaMock.eventPassenger.create.mockResolvedValue(ep as never);

      const result = await service.create(EVENT_ID, user, { passengerId: PASSENGER_ID });

      expect(result.id).toBe(EP_ID);
    });

    it('deve lançar ConflictException quando passageiro já inscrito no evento', async () => {
      const user = buildUser();
      const event = buildEvent();
      const passenger = buildPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEventPassenger() as never);

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID })).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException quando RG duplicado cross-congregation', async () => {
      const user = buildUser();
      const event = buildEvent();
      const passenger = buildPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(
        buildEventPassenger({ passengerId: 'other-passenger' }) as never,
      );

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID })).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException quando passengerId não existe', async () => {
      const user = buildUser();
      const event = buildEvent();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(null);

      await expect(service.create(EVENT_ID, user, { passengerId: 'non-existent' })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando congregação do passageiro é diferente', async () => {
      const user = buildUser({ congregationId: 'other-congregation' });
      const event = buildEvent();
      const passenger = buildPassenger({ congregationId: CONGREGATION_ID });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID })).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar UnprocessableEntityException quando dia cancelado para congresso', async () => {
      const user = buildUser();
      const event = buildEvent({
        type: 'REGIONAL_CONVENTION',
        eventDays: [
          buildEventDay({ id: DAY_ID_1, status: 'CANCELLED' }),
          buildEventDay({ id: DAY_ID_2, dayNumber: 2, status: 'ACTIVE' }),
        ],
      });
      const passenger = buildPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID, dayIds: [DAY_ID_1] })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando dayIds ausente para congresso regional', async () => {
      const user = buildUser();
      const event = buildEvent({
        type: 'REGIONAL_CONVENTION',
        eventDays: [buildEventDay({ id: DAY_ID_1 })],
      });
      const passenger = buildPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);
      prismaMock.eventPassenger.findFirst.mockResolvedValue(null);

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando nem passengerId nem name+rg enviados', async () => {
      const event = buildEvent();
      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.create(EVENT_ID, buildUser(), {})).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando ambos passengerId e name+rg enviados', async () => {
      const event = buildEvent();
      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(
        service.create(EVENT_ID, buildUser(), { passengerId: PASSENGER_ID, name: 'João', rg: '12345678X' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando lista da congregação está finalizada (passageiro existente)', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      const event = buildEvent();
      const passenger = buildPassenger();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.passenger.findUnique.mockResolvedValue(passenger);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar inscrições',
        ),
      );

      await expect(service.create(EVENT_ID, user, { passengerId: PASSENGER_ID })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve bloquear inscrição inline sem criar Passenger quando lista está finalizada', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      const event = buildEvent();

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar inscrições',
        ),
      );

      await expect(service.create(EVENT_ID, user, { name: 'João Silva', rg: '12.345.678-X' })).rejects.toThrow(
        UnprocessableEntityException,
      );

      expect(passengersServiceMock.create).not.toHaveBeenCalled();
    });
  });

  // ── findByEvent ────────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve retornar lista paginada de inscrições', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });
      const ep = buildEventPassenger();

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.eventPassenger.findMany.mockResolvedValue([ep] as never);
      prismaMock.eventPassenger.count.mockResolvedValue(1);

      const result = await service.findByEvent(EVENT_ID, 1, 20, user);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.passenger.rg).toBe(DECRYPTED_RG);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('deve filtrar por congregação para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.eventPassenger.findMany.mockResolvedValue([]);
      prismaMock.eventPassenger.count.mockResolvedValue(0);

      await service.findByEvent(EVENT_ID, 1, 20, user);

      expect(prismaMock.eventPassenger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: EVENT_ID, congregationId: CONGREGATION_ID },
        }),
      );
    });

    it('deve listar todas congregações para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.eventPassenger.findMany.mockResolvedValue([]);
      prismaMock.eventPassenger.count.mockResolvedValue(0);

      await service.findByEvent(EVENT_ID, 1, 20, user);

      expect(prismaMock.eventPassenger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: EVENT_ID },
        }),
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.findByEvent(EVENT_ID, 1, 20, buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar inscrição com dias e passageiro', async () => {
      const ep = { ...buildEventPassenger(), event: { circuitId: 'circuit-1' } };
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      const result = await service.findOne(EP_ID, buildUser());

      expect(result.id).toBe(EP_ID);
      expect(result.passenger.name).toBe('João Silva');
      expect(result.passenger.rg).toBe(DECRYPTED_RG);
      expect(result.days).toHaveLength(1);
      expect(result.days[0]!.eventDayId).toBe(DAY_ID_1);
    });

    it('deve lançar NotFoundException quando inscrição não existe', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      const ep = { ...buildEventPassenger(), event: { circuitId: 'outro-circuito' } };
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.findOne(EP_ID, buildUser())).rejects.toThrow(ForbiddenException);
    });
  });

  // ── updateDays ────────────────────────────────────────────────
  describe('updateDays', () => {
    function buildEpWithEvent(overrides: { paidAmount?: number; paymentStatus?: string; event?: PrismaEvent } = {}): {
      id: string;
      totalAmount: number;
      paidAmount: number;
      paymentStatus: string;
      exemptionReason: null;
      observations: null;
      eventId: string;
      passengerId: string;
      congregationId: string;
      registeredById: string;
      createdAt: Date;
      updatedAt: Date;
      passenger: PrismaPassenger;
      event: PrismaEvent;
    } {
      return {
        id: EP_ID,
        totalAmount: 25.0,
        paidAmount: overrides.paidAmount ?? 0,
        paymentStatus: overrides.paymentStatus ?? 'PENDING',
        exemptionReason: null,
        observations: null,
        eventId: EVENT_ID,
        passengerId: PASSENGER_ID,
        congregationId: CONGREGATION_ID,
        registeredById: USER_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        passenger: buildPassenger(),
        event:
          overrides.event ??
          buildEvent({
            type: 'REGIONAL_CONVENTION',
            ticketPrice: 30.0,
            eventDays: [
              buildEventDay({ id: DAY_ID_1 }),
              buildEventDay({ id: DAY_ID_2, dayNumber: 2 }),
              buildEventDay({ id: DAY_ID_3, dayNumber: 3 }),
            ],
          }),
      };
    }

    it('deve substituir dias e recalcular totalAmount', async () => {
      const user = buildUser();
      const epWithEvent = buildEpWithEvent();
      const updatedEp = buildEventPassenger({ totalAmount: 60.0 });

      prismaMock.eventPassenger.findUnique
        .mockResolvedValueOnce(epWithEvent as never)
        .mockResolvedValueOnce(updatedEp as never);
      prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.updateDays(EP_ID, { dayIds: [DAY_ID_1, DAY_ID_2] }, user);

      expect(result.id).toBe(EP_ID);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve recalcular paymentStatus para PARTIAL quando paidAmount parcial', async () => {
      const user = buildUser();
      const epWithEvent = buildEpWithEvent({ paidAmount: 30 });
      const updatedEp = buildEventPassenger({ totalAmount: 60.0, paidAmount: 30, paymentStatus: 'PARTIAL' });

      prismaMock.eventPassenger.findUnique
        .mockResolvedValueOnce(epWithEvent as never)
        .mockResolvedValueOnce(updatedEp as never);
      prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.updateDays(EP_ID, { dayIds: [DAY_ID_1, DAY_ID_2] }, user);

      expect(result.paymentStatus).toBe('PARTIAL');
    });

    it('deve manter EXEMPT inalterado ao atualizar dias', async () => {
      const user = buildUser();
      const epWithEvent = buildEpWithEvent({ paymentStatus: 'EXEMPT' });
      const updatedEp = buildEventPassenger({ paymentStatus: 'EXEMPT' });

      prismaMock.eventPassenger.findUnique
        .mockResolvedValueOnce(epWithEvent as never)
        .mockResolvedValueOnce(updatedEp as never);
      prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.updateDays(EP_ID, { dayIds: [DAY_ID_1] }, user);

      expect(result.paymentStatus).toBe('EXEMPT');
    });

    it('deve lançar NotFoundException quando inscrição não existe', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);

      await expect(service.updateDays('non-existent', { dayIds: [DAY_ID_1] }, buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar UnprocessableEntityException quando evento não está OPEN', async () => {
      const epWithEvent = buildEpWithEvent({ event: buildEvent({ status: 'CLOSED' }) });

      prismaMock.eventPassenger.findUnique.mockResolvedValue(epWithEvent as never);

      await expect(service.updateDays(EP_ID, { dayIds: [DAY_ID_1] }, buildUser())).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando dia inválido', async () => {
      const user = buildUser();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEvent() as never);

      await expect(service.updateDays(EP_ID, { dayIds: ['non-existent-day'] }, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar ForbiddenException quando congregação diferente', async () => {
      const user = buildUser({ congregationId: 'other-congregation' });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEvent() as never);

      await expect(service.updateDays(EP_ID, { dayIds: [DAY_ID_1] }, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar UnprocessableEntityException quando lista da congregação está finalizada', async () => {
      const user = buildUser();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEvent() as never);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar inscrições',
        ),
      );

      await expect(service.updateDays(EP_ID, { dayIds: [DAY_ID_1] }, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    function buildEpWithEventForRemove(overrides: Record<string, unknown> = {}): unknown {
      return {
        id: EP_ID,
        totalAmount: 25.0,
        paidAmount: 0,
        paymentStatus: 'PENDING',
        exemptionReason: null,
        observations: null,
        eventId: EVENT_ID,
        passengerId: PASSENGER_ID,
        congregationId: CONGREGATION_ID,
        registeredById: USER_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        event: buildEvent({
          registrationDeadline: (overrides.registrationDeadline as Date) ?? FUTURE_DEADLINE,
          status: (overrides.status as string) ?? 'OPEN',
        }),
      };
    }

    it('deve remover inscrição (hard-delete) com sucesso', async () => {
      const user = buildUser();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEventForRemove() as never);

      await service.remove(EP_ID, user);

      expect(prismaMock.eventPassenger.delete).toHaveBeenCalledWith({ where: { id: EP_ID } });
    });

    it('deve lançar NotFoundException quando inscrição não existe', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar UnprocessableEntityException quando evento não está OPEN', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEventForRemove({ status: 'CLOSED' }) as never);

      await expect(service.remove(EP_ID, buildUser())).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando prazo expirou para role de congregação', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(
        buildEpWithEventForRemove({ registrationDeadline: PAST_DEADLINE }) as never,
      );

      await expect(service.remove(EP_ID, buildUser({ role: 'CONGREGATION_COORDINATOR' }))).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve permitir remoção após prazo para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(
        buildEpWithEventForRemove({ registrationDeadline: PAST_DEADLINE }) as never,
      );

      await service.remove(EP_ID, user);

      expect(prismaMock.eventPassenger.delete).toHaveBeenCalledWith({ where: { id: EP_ID } });
    });

    it('deve lançar UnprocessableEntityException quando lista da congregação está finalizada', async () => {
      const user = buildUser();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEpWithEventForRemove() as never);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar inscrições',
        ),
      );

      await expect(service.remove(EP_ID, user)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
