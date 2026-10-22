import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender';
import { LogEmailSender } from './log-email-sender';
import { ResendEmailSender } from './resend-email-sender';

/**
 * Escolhe o adaptador de envio pelo ambiente: desenvolvimento e teste apenas
 * registram no log, o resto fala com o Resend. Isso mantém a máquina do
 * desenvolvedor funcionando sem chave de API e sem risco de disparar e-mail
 * real para um endereço de teste.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailSender => {
        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const usesRealProvider = nodeEnv !== 'development' && nodeEnv !== 'test';

        return usesRealProvider ? new ResendEmailSender(config) : new LogEmailSender();
      },
    },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
