import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppService } from './app.service'
import { CreateMeetingDto, CreateProjectDto, CreateTaskDto, DesensitizationRuleDto, FeedbackDto, ImportMeetingDto, LoginDto, ManagedUserDto, ManagedUserUpdateDto, ProjectMemberDto, ProjectMemberUpdateDto, RegisterDto, ResetPasswordDto, ReviewBatchDto, ReviewDto, ReviewDraftDto, SystemSettingsDto, TagDto, TaskNoteDto, UpdateDesensitizationRuleDto, UpdateManagedTaskDto, UpdateProjectDto, UpdateTagDto, UpdateTaskDto } from './dtos'
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
  @Get('projects/:id/detail') async projectDetail(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.projectDetail(await this.user(authorization), id) }
  @Get('projects/deleted') async deletedProjects(@Headers('authorization') authorization?: string) { return this.app.deletedProjects(await this.user(authorization)) }
  @Post('projects') async createProject(@Headers('authorization') authorization: string | undefined, @Body() body: CreateProjectDto) { return this.app.createProject(await this.user(authorization), body) }
  @Patch('projects/:id') async updateProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateProjectDto) { return this.app.updateProject(await this.user(authorization), id, body) }
  @Delete('projects/:id') async deleteProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.softDeleteProject(await this.user(authorization), id) }
  @Post('projects/:id/restore') async restoreProject(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.restoreProject(await this.user(authorization), id) }
  @Get('projects/:id/tags') async projectTags(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listProjectTags(await this.user(authorization), id) }
  @Post('projects/:id/tags') async createProjectTag(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: TagDto) { return this.app.createProjectTag(await this.user(authorization), id, body) }
  @Patch('projects/:id/tags/:tagId') async updateProjectTag(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('tagId') tagId: string, @Body() body: UpdateTagDto) { return this.app.updateProjectTag(await this.user(authorization), id, tagId, body) }
  @Delete('projects/:id/tags/:tagId') async deleteProjectTag(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('tagId') tagId: string) { return this.app.deleteProjectTag(await this.user(authorization), id, tagId) }
  @Post('projects/:id/tags/:tagId/link') async linkProjectTag(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('tagId') tagId: string) { return this.app.linkProjectTag(await this.user(authorization), id, tagId) }
  @Delete('projects/:id/tags/:tagId/link') async unlinkProjectTag(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('tagId') tagId: string) { return this.app.unlinkProjectTag(await this.user(authorization), id, tagId) }
  @Get('projects/:id/desensitization-rules') async desensitizationRules(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listDesensitizationRules(await this.user(authorization), id) }
  @Post('projects/:id/desensitization-rules') async createDesensitizationRule(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: DesensitizationRuleDto) { return this.app.createDesensitizationRule(await this.user(authorization), id, body) }
  @Patch('projects/:id/desensitization-rules/:ruleId') async updateDesensitizationRule(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('ruleId') ruleId: string, @Body() body: UpdateDesensitizationRuleDto) { return this.app.updateDesensitizationRule(await this.user(authorization), id, ruleId, body) }
  @Delete('projects/:id/desensitization-rules/:ruleId') async deleteDesensitizationRule(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('ruleId') ruleId: string) { return this.app.deleteDesensitizationRule(await this.user(authorization), id, ruleId) }
  @Get('projects/:id/members') async projectMembers(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listProjectMembers(await this.user(authorization), id) }
  @Get('projects/:id/member-candidates') async projectMemberCandidates(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.projectMemberCandidates(await this.user(authorization), id) }
  @Post('projects/:id/members') async addProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ProjectMemberDto) { return this.app.addProjectMember(await this.user(authorization), id, body.userId, body.projectRole) }
  @Patch('projects/:id/members/:userId') async updateProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('userId') userId: string, @Body() body: ProjectMemberUpdateDto) { return this.app.updateProjectMemberRole(await this.user(authorization), id, userId, body.projectRole) }
  @Delete('projects/:id/members/:userId') async removeProjectMember(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Param('userId') userId: string) { return this.app.removeProjectMember(await this.user(authorization), id, userId) }
  @Get('tasks') async tasks(@Headers('authorization') authorization?: string) { return this.app.tasks(await this.user(authorization)) }
  @Get('dashboard/overdue-tasks') async overdueTasks(@Headers('authorization') authorization?: string) { return this.app.overdueTasks(await this.user(authorization)) }
  @Post('tasks') async createTask(@Headers('authorization') authorization: string | undefined, @Body() body: CreateTaskDto) { return this.app.createTask(await this.user(authorization), body) }
  @Get('calendar-events') async calendarEvents(@Headers('authorization') authorization?: string) { return this.app.calendarEvents(await this.user(authorization)) }
  @Patch('tasks/:id') async updateTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateTaskDto) { return this.app.updateTask(await this.user(authorization), id, body) }
  @Patch('tasks/:id/manage') async updateManagedTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateManagedTaskDto) { return this.app.updateManagedTask(await this.user(authorization), id, body) }
  @Post('tasks/:id/close') async closeTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.closeTask(await this.user(authorization), id) }
  @Post('tasks/:id/reopen') async reopenTask(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: UpdateTaskDto) { return this.app.reopenTask(await this.user(authorization), id, body.status === 'in_progress' ? 'in_progress' : 'todo') }
  @Get('tasks/:id/notes') async taskNotes(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listTaskNotes(await this.user(authorization), id) }
  @Post('tasks/:id/notes') async addTaskNote(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: TaskNoteDto) { return this.app.addTaskNote(await this.user(authorization), id, body.content) }
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
  @Get('meetings/:id/desensitization-logs') async desensitizationLogs(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.listMeetingDesensitizationLogs(await this.user(authorization), id) }
  @Get('meetings/:id/review') async reviewDetail(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.reviewDetail(await this.user(authorization), id) }
  @Get('analyses') async analyses(@Headers('authorization') authorization?: string) { return this.app.listAnalyses(await this.user(authorization)) }
  @Post('analyses/review-batch') async reviewBatch(@Headers('authorization') authorization: string | undefined, @Body() body: ReviewBatchDto) { return this.app.reviewAnalyses(await this.user(authorization), body.analysisIds, body.approved, body.reason) }
  @Post('analyses/:id/review') async review(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ReviewDto) { return this.app.reviewAnalysis(await this.user(authorization), id, body.approved, body.reason) }
  @Put('analyses/:id/draft') async saveReviewDraft(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: ReviewDraftDto) { return this.app.saveReviewDraft(await this.user(authorization), id, body) }
  @Post('analyses/:id/reanalyze') async reanalyze(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.app.reanalyzeRejectedAnalysis(await this.user(authorization), id) }
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
