import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Pipe global: valida automaticamente todo request body contra o DTO.
  // - whitelist: remove campos que não estão no DTO (segurança).
  // - forbidNonWhitelisted: retorna 400 se o client enviar campos extras.
  // - transform: converte o plain object do JSON em instância da classe DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SUOAC API')
      .setDescription('API do Sistema Unificado de Ônibus para Assembleias de Circuito')
      .setVersion('0.1')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 8080, '0.0.0.0');
}
void bootstrap();
