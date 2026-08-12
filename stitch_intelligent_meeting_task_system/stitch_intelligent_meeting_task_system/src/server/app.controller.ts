import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { CreateMeetingDto, CreateProjectDto, FeedbackDto, LoginDto, ManagedUserDto, ManagedUserUpdateDto, RegisterDto, ResetPasswordDto, ReviewDto, UpdateTaskDto } from './dtos'

@Controller('api')
export class AppController {
  constructor(@Inject(AppService) private readonly app: AppService) {}
  private user(authorization?: string) { return this.app.databaseUser(authorization?.replace(/^Bearer\s+/i, '')) }

  @Get('health') health() { return { status: 'ok', storage: 'mysql' } }
  @Post('auth/register') register(@Body() body: RegisterDto) { return this.app.register(body) }
  @Post('auth/login') login(@Body() body: LoginDto) { return this.app.login(body.email, body.password) }
  @Get('auth/me') async me(@Headers('authorization') authorization?: string) { return this.app.databaseUser(authorization?.replace(/^Bearer\s+/i, '')) }
  @Get('projects') async projects(@Headers('authorization') authorization?: string) { return this.app.projects(await this.user(authorization)) }
  @Post('projects') async createProject(@Headers('authorization') authorization: string | undefined, @Body() body: CreateProjectDto) { return this.app.createProject(await this.user(authorization), body) }
  @Get('tasks') async tasks(@Headers('authorization') authorization?: string) { return this.app.tasks(await this.user(authorization)) }
  @Patch('tasks/:id') async updateTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateTaskDto) { return this.app.updateTask(await this.user(authorization), id, body) }
  @Post('tasks/:id/feedbacks') async feedback(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: FeedbackDto) { return this.app.feedback(await this.user(authorization), id, body) }
  @Get('notifications') async notifications(@Headers('authorization') authorization?: string) { return this.app.notifications(await this.user(authorization)) }
  @Patch('notifications/:id/read') async markNotificationRead(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.markNotificationRead(await this.user(authorization), id) }
  @Patch('projects/:id/archive') async archiveProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.archiveProject(await this.user(authorization), id) }
  @Post('meetings') async createMeeting(@Headers('authorization') authorization: string | undefined, @Body() body: CreateMeetingDto) { return this.app.createMeeting(await this.user(authorization), body) }
  @Post('meetings/:id/analyze') async analyzeMeeting(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.analyzeMeeting(await this.user(authorization), id) }
  @Get('analyses') async analyses(@Headers('authorization') authorization?: string) { return this.app.listAnalyses(await this.user(authorization)) }
  @Post('analyses/:id/review') async review(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ReviewDto) { return this.app.reviewAnalysis(await this.user(authorization), id, body.approved) }
  @Get('risks') async risks(@Headers('authorization') authorization?: string) { return this.app.risks(await this.user(authorization)) }
  @Patch('risks/:id/resolve') async resolveRisk(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.resolveRisk(await this.user(authorization), id) }
  @Get('audit-logs') async auditLogs(@Headers('authorization') authorization?: string) { return this.app.auditLogs(await this.user(authorization)) }
  @Get('users') async users(@Headers('authorization') authorization?: string) { return this.app.listUsers(await this.user(authorization)) }
  @Post('users') async createUser(@Headers('authorization') authorization: string | undefined, @Body() body: ManagedUserDto) { return this.app.createManagedUser(await this.user(authorization), body) }
  @Patch('users/:id') async updateUser(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ManagedUserUpdateDto) { return this.app.updateManagedUser(await this.user(authorization), id, body) }
  @Post('users/:id/reset-password') async resetPassword(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ResetPasswordDto) { return this.app.resetManagedPassword(await this.user(authorization), id, body.password) }
}
