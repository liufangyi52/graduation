import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { migrate } from './migrate'
import { ValidationPipe } from '@nestjs/common'

async function bootstrap() {
  await migrate()
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  const origins = (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
  app.enableCors({ origin: origins, credentials: true })
  await app.listen(Number(process.env.API_PORT ?? 3000), '127.0.0.1')
}

bootstrap()
