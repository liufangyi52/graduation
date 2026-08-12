import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DeepSeekService } from './deepseek.service'

@Module({ controllers: [AppController], providers: [AppService, DeepSeekService] })
export class AppModule {}
