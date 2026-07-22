import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';
import { DemoService } from './demo.service';
import { Candidate, Task } from './models';

class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
class MeetingDto { @IsString() title!: string; @IsString() content!: string; @IsOptional() @IsString() date?: string; @IsOptional() @IsArray() attendees?: string[]; }
class ReviewDto { @IsArray() selected!: Candidate[]; }
class TaskPatchDto { @IsOptional() @IsString() status?: Task['status']; @IsOptional() progress?: number; @IsOptional() @IsString() blocked?: boolean; }

@Controller()
export class AppController {
  constructor(private readonly demo: DemoService) {}
  private user(auth?: string) { return this.demo.userFromToken(auth); }
  @Post('auth/login') login(@Body() dto:LoginDto) { return this.demo.login(dto.email, dto.password); }
  @Get('me') me(@Headers('authorization') auth?:string) { return this.user(auth); }
  @Get('dashboard') dashboard() { return this.demo.dashboard(); }
  @Get('projects') projects() { return [this.demo.project]; }
  @Get('projects/:id/tasks') tasks(@Param('id') id:string) { return this.demo.tasks.filter(t=>t.projectId===id); }
  @Patch('tasks/:id') updateTask(@Param('id') id:string,@Body() body:TaskPatchDto,@Headers('authorization') auth?:string) { return this.demo.updateTask(id,this.user(auth),body); }
  @Get('meetings') meetings() { return this.demo.meetings; }
  @Post('meetings') meeting(@Body() dto:MeetingDto,@Headers('authorization') auth?:string) { this.demo.ensureManager(this.user(auth)); return this.demo.createMeeting(dto); }
  @Post('meetings/:id/analyze') analyze(@Param('id') id:string,@Headers('authorization') auth?:string) { this.demo.ensureManager(this.user(auth)); return this.demo.analyze(id); }
  @Get('meetings/:id/analysis') analysis(@Param('id') id:string) { return this.demo.analyses.get(id) || this.demo.analyze(id); }
  @Post('meetings/:id/review') review(@Param('id') id:string,@Body() dto:ReviewDto,@Headers('authorization') auth?:string) { return this.demo.review(id,this.user(auth),dto.selected); }
  @Get('analytics/evaluation') evaluation() { return { variants:[{name:'无 AI',f1:0.61,time:24,trust:0.72},{name:'单轮 LLM',f1:0.76,time:9.8,trust:0.73},{name:'RAG',f1:0.83,time:8.6,trust:0.86},{name:'智能体编排',f1:0.9,time:7.4,trust:0.93}], metrics:{citationCoverage:0.96, humanEditRate:0.12, avgLatency:1.09} }; }
  @Get('traces') traces() { return [{id:'run-20260721-0930',meeting:'第 12 次项目推进会',model:'Mock Provider / meetingflow-structured-v1',promptVersion:'v1.2.0',latency:'1.09s',tokens:1842,status:'SUCCESS',time:'09:31:12'}]; }
}
