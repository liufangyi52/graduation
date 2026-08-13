import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppService } from './app.service'
import { CreateMeetingDto, CreateProjectDto, FeedbackDto, ImportMeetingDto, LoginDto, ManagedUserDto, ManagedUserUpdateDto, ProjectMemberDto, ProjectMemberUpdateDto, RegisterDto, ResetPasswordDto, ReviewDto, SystemSettingsDto, UpdateTaskDto } from './dtos'
import { extractMeetingFileContent, type UploadedMeetingFile } from './document-import'

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
  @Get('projects/:id/members') async projectMembers(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listProjectMembers(await this.user(authorization), id) }
  @Get('projects/:id/member-candidates') async projectMemberCandidates(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.projectMemberCandidates(await this.user(authorization), id) }
  @Post('projects/:id/members') async addProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ProjectMemberDto) { return this.app.addProjectMember(await this.user(authorization), id, body.userId, body.projectRole) }
  @Patch('projects/:id/members/:userId') async updateProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('userId') userId: string, @Body() body: ProjectMemberUpdateDto) { return this.app.updateProjectMemberRole(await this.user(authorization), id, userId, body.projectRole) }
  @Delete('projects/:id/members/:userId') async removeProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('userId') userId: string) { return this.app.removeProjectMember(await this.user(authorization), id, userId) }
  @Get('tasks') async tasks(@Headers('authorization') authorization?: string) { return this.app.tasks(await this.user(authorization)) }
  @Get('calendar-events') async calendarEvents(@Headers('authorization') authorization?: string) { return this.app.calendarEvents(await this.user(authorization)) }
  @Patch('tasks/:id') async updateTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateTaskDto) { return this.app.updateTask(await this.user(authorization), id, body) }
  @Post('tasks/:id/feedbacks') async feedback(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: FeedbackDto) { return this.app.feedback(await this.user(authorization), id, body) }
  @Get('notifications') async notifications(@Headers('authorization') authorization?: string) { return this.app.notifications(await this.user(authorization)) }
  @Patch('notifications/:id/read') async markNotificationRead(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.markNotificationRead(await this.user(authorization), id) }
  @Patch('projects/:id/archive') async archiveProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.archiveProject(await this.user(authorization), id) }
  @Post('meetings') async createMeeting(@Headers('authorization') authorization: string | undefined, @Body() body: CreateMeetingDto) { return this.app.createMeeting(await this.user(authorization), body) }
  @Post('meetings/import') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } })) async importMeeting(@Headers('authorization') authorization: string | undefined, @Body() body: ImportMeetingDto, @UploadedFile() file?: UploadedMeetingFile) {
    const imported = await extractMeetingFileContent(file)
    return this.app.createMeeting(await this.user(authorization), { ...body, content: imported.content, sourceType: imported.sourceType })
  }
  @Get('meetings/:id/versions') async meetingVersions(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listMeetingVersions(await this.user(authorization), id) }
  @Get('meetings/:id/versions/:versionId') async meetingVersion(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('versionId') versionId: string) { return this.app.getMeetingVersion(await this.user(authorization), id, versionId) }
  @Post('meetings/:id/versions/:versionId/restore') async restoreMeetingVersion(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('versionId') versionId: string) { return this.app.restoreMeetingVersion(await this.user(authorization), id, versionId) }
  @Post('meetings/:id/analyze') async analyzeMeeting(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.analyzeMeeting(await this.user(authorization), id) }
  @Get('analyses') async analyses(@Headers('authorization') authorization?: string) { return this.app.listAnalyses(await this.user(authorization)) }
  @Post('analyses/:id/review') async review(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ReviewDto) { return this.app.reviewAnalysis(await this.user(authorization), id, body.approved, body.reason) }
  @Get('risks') async risks(@Headers('authorization') authorization?: string) { return this.app.risks(await this.user(authorization)) }
  @Patch('risks/:id/resolve') async resolveRisk(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.resolveRisk(await this.user(authorization), id) }
  @Get('audit-logs') async auditLogs(@Headers('authorization') authorization?: string) { return this.app.auditLogs(await this.user(authorization)) }
  @Get('settings') async settings(@Headers('authorization') authorization?: string) { return this.app.getSystemSettings(await this.user(authorization)) }
  @Patch('settings') async updateSettings(@Headers('authorization') authorization: string | undefined, @Body() body: SystemSettingsDto) { return this.app.updateSystemSettings(await this.user(authorization), body) }
  @Get('users') async users(@Headers('authorization') authorization?: string) { return this.app.listUsers(await this.user(authorization)) }
  @Post('users') async createUser(@Headers('authorization') authorization: string | undefined, @Body() body: ManagedUserDto) { return this.app.createManagedUser(await this.user(authorization), body) }
  @Patch('users/:id') async updateUser(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ManagedUserUpdateDto) { return this.app.updateManagedUser(await this.user(authorization), id, body) }
  @Post('users/:id/reset-password') async resetPassword(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ResetPasswordDto) { return this.app.resetManagedPassword(await this.user(authorization), id, body.password) }
}
