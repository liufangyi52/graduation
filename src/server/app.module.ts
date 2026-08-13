import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DeepSeekService } from './deepseek.service'
import { RedisCacheService } from './redis-cache.service'
import { AnalysisRunner } from './analysis-runner'
import { SiliconFlowEmbeddingProvider } from './embedding-provider'
import { QdrantVectorStore } from './vector-store'

@Module({ controllers: [AppController], providers: [AppService, DeepSeekService, RedisCacheService, AnalysisRunner, SiliconFlowEmbeddingProvider, QdrantVectorStore] })
export class AppModule {}
