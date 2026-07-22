import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DemoService } from './demo.service';

@Module({ controllers: [AppController], providers: [DemoService] })
export class AppModule {}
