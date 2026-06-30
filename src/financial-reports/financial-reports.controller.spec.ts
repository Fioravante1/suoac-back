import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { EventFinancialReportResponse } from './interfaces/event-financial-report-response.interface';
import { FinancialReportsController } from './financial-reports.controller';
import { FinancialReportsService } from './financial-reports.service';

const USER: JwtPayload = {
  sub: 'u1u2u3u4-0000-0000-0000-000000000001',
  email: 'coord@test.com',
  role: 'CIRCUIT_COORDINATOR',
  circuitId: 'circuit-1',
  congregationId: null,
};

const CIRCUIT_ID = 'circuit-1';
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';

function buildReport(): EventFinancialReportResponse {
  return {
    event: {
      id: EVENT_ID,
      title: 'Congresso 2026',
      type: 'REGIONAL_CONVENTION',
      status: 'FINISHED',
      ticketPrice: '40.00',
      circuitId: CIRCUIT_ID,
    },
    revenue: { totalExpected: '160.00', totalReceived: '90.00', totalPending: '70.00', byCongregation: [] },
    expenses: { total: '120.00', byCategory: [] },
    cashBalance: '-30.00',
    projectedBalance: '40.00',
    generatedAt: new Date('2026-06-22T10:00:00Z'),
    generatedByName: 'Coordenador',
  };
}

describe('FinancialReportsController', () => {
  let controller: FinancialReportsController;
  let serviceMock: jest.Mocked<FinancialReportsService>;

  beforeEach(async () => {
    serviceMock = {
      buildEventFinancialReport: jest.fn(),
      generateReport: jest.fn(),
    } as unknown as jest.Mocked<FinancialReportsService>;

    const module = await Test.createTestingModule({
      controllers: [FinancialReportsController],
      providers: [{ provide: FinancialReportsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(FinancialReportsController);
  });

  it('deve delegar ao service repassando circuitId, eventId e user', async () => {
    const expected = buildReport();
    serviceMock.buildEventFinancialReport.mockResolvedValue(expected);

    const result = await controller.getEventFinancialReport(CIRCUIT_ID, EVENT_ID, USER, { format: 'json' });

    expect(result).toEqual(expected);
    expect(serviceMock.buildEventFinancialReport).toHaveBeenCalledWith(CIRCUIT_ID, EVENT_ID, USER);
  });

  it('deve gerar o PDF com headers e filename corretos', async () => {
    serviceMock.generateReport.mockResolvedValue({ buffer: Buffer.from('%PDF-1.7'), eventTitle: 'Congresso 2026' });
    const reply = {
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Parameters<typeof controller.getEventFinancialReportPdf>[4];

    await controller.getEventFinancialReportPdf(CIRCUIT_ID, EVENT_ID, { form: 's44' }, USER, reply);

    expect(serviceMock.generateReport).toHaveBeenCalledWith(CIRCUIT_ID, EVENT_ID, USER, 's44');
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(reply.header).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="relatorio-s44-${EVENT_ID}.pdf"`,
    );
    expect(reply.send).toHaveBeenCalled();
  });
});
