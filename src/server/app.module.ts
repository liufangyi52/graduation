import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DeepSeekService } from './deepseek.service'
import { RedisCacheService } from './redis-cache.service'
import { AnalysisRunner } from './analysis-runner'

@Module({ controllers: [AppController], providers: [AppService, DeepSeekService, RedisCacheService, AnalysisRunner] })
export class AppModule {}
