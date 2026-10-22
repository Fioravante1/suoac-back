import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailModule } from './email.module';
import { EmailSender } from './email-sender';
import { LogEmailSender } from './log-email-sender';
import { ResendEmailSender } from './resend-email-sender';

// ── Helpers ──────────────────────────────────────────────────────
async function resolveSender(nodeEnv: string): Promise<EmailSender> {
  const values: Record<string, string | undefined> = {
    NODE_ENV: nodeEnv,
    RESEND_API_KEY: 're_fake_key',
    EMAIL_FROM: 'SUOAC <nao-responda@suoac.example.com>',
  };

  const module = await Test.createTestingModule({ imports: [EmailModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => values[key] })
    .compile();

  return module.get(EmailSender);
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EmailModule', () => {
  it('deve usar o sender de log em desenvolvimento', async () => {
    await expect(resolveSender('development')).resolves.toBeInstanceOf(LogEmailSender);
  });

  it('deve usar o sender de log em teste', async () => {
    await expect(resolveSender('test')).resolves.toBeInstanceOf(LogEmailSender);
  });

  it('deve usar o Resend em staging', async () => {
    await expect(resolveSender('staging')).resolves.toBeInstanceOf(ResendEmailSender);
  });

  it('deve usar o Resend em producao', async () => {
    await expect(resolveSender('production')).resolves.toBeInstanceOf(ResendEmailSender);
  });
});
