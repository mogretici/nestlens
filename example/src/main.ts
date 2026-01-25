import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestLensLogger } from 'nestlens';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('NestLens Example API')
    .setDescription('The NestLens example API description')
    .setVersion('1.0')
    .addTag('users')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Use NestLensLogger to capture all logs
  const nestLensLogger = app.get(NestLensLogger);
  app.useLogger(nestLensLogger);

  await app.listen(3000);
  console.log('Application running on http://localhost:3000');
  console.log('Swagger documentation: http://localhost:3000/api');
  console.log('NestLens dashboard: http://localhost:3000/nestlens');
}
bootstrap();
