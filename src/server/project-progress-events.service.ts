import { Inject, Injectable } from '@nestjs/common'
import { ProjectProgressGateway } from './project-progress.gateway'
import type { ProjectProgressEvent } from './project-progress.types'

@Injectable()
export class ProjectProgressEventsService {
  constructor(@Inject(ProjectProgressGateway) private readonly gateway: ProjectProgressGateway) {}
  publish(event: ProjectProgressEvent) { this.gateway.emitProgress(event) }
  revokeMember(projectId: string, userId: string) { return this.gateway.revokeMember(projectId, userId) }
}
