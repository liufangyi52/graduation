import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'

const roles = ['manager', 'member', 'admin', 'auditor'] as const
const statuses = ['todo', 'in_progress', 'completed', 'closed'] as const
const activeTaskStatuses = ['todo', 'in_progress', 'completed'] as const
const projectRoles = ['manager', 'member'] as const
const projectStatuses = ['active', 'paused', 'archived'] as const
const priorities = ['low', 'medium', 'high', 'urgent'] as const

export class RegisterDto {
  @IsIn(roles) role!: typeof roles[number]
  @IsString() @MinLength(1) name!: string
  @IsEmail() email!: string
  @IsString() @MinLength(8) password!: string
}

export class LoginDto {
  @IsEmail() email!: string
  @IsString() password!: string
}

export class CreateProjectDto {
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) code!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() endDate?: string
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) code?: string
  @IsOptional() @IsString() @MaxLength(4000) description?: string
  @IsOptional() @IsString() endDate?: string | null
  @IsOptional() @IsIn(projectStatuses) status?: typeof projectStatuses[number]
}

export class TagDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string
}

export class UpdateTagDto extends TagDto {}

export class DesensitizationRuleDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string
  @IsString() @MinLength(1) @MaxLength(500) pattern!: string
  @IsString() @MaxLength(200) replacement!: string
  @IsBoolean() enabled!: boolean
}

export class UpdateDesensitizationRuleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) pattern?: string
  @IsOptional() @IsString() @MaxLength(200) replacement?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}

export class UpdateTaskDto {
  @IsOptional() @IsIn(activeTaskStatuses) status?: typeof activeTaskStatuses[number]
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progress?: number
}

export class FeedbackDto {
  @IsString() @MinLength(1) content!: string
  @Type(() => Number) @IsInt() @Min(0) @Max(100) progress!: number
}

export class CreateMeetingDto {
  @IsUUID() projectId!: string
  @IsString() @MinLength(1) title!: string
  @IsString() @MinLength(1) content!: string
}

export class ReviewDto {
  @IsBoolean() approved!: boolean
  @IsOptional() @IsString() @MinLength(1) reason?: string
}

export class ReviewBatchDto extends ReviewDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('4', { each: true }) analysisIds!: string[]
}

export class CreateTaskDto {
  @IsUUID() projectId!: string
  @IsString() @MinLength(1) @MaxLength(180) title!: string
  @IsOptional() @IsString() @MaxLength(4000) description?: string
  @IsUUID() assigneeId!: string
  @IsIn(priorities) priority!: typeof priorities[number]
  @IsOptional() @IsIn(activeTaskStatuses) status?: typeof activeTaskStatuses[number]
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progress?: number
  @IsOptional() @IsString() dueDate?: string | null
}

export class UpdateManagedTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) title?: string
  @IsOptional() @IsString() @MaxLength(4000) description?: string
  @IsOptional() @IsUUID() assigneeId?: string
  @IsOptional() @IsIn(priorities) priority?: typeof priorities[number]
  @IsOptional() @IsIn(activeTaskStatuses) status?: typeof activeTaskStatuses[number]
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progress?: number
  @IsOptional() @IsString() dueDate?: string | null
}

export class TaskNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) content!: string
}

export class ImportMeetingDto {
  @IsUUID() projectId!: string
  @IsString() @MinLength(1) title!: string
}

export class ProjectMemberDto {
  @IsUUID() userId!: string
  @IsIn(projectRoles) projectRole!: typeof projectRoles[number]
}

export class ProjectMemberUpdateDto {
  @IsIn(projectRoles) projectRole!: typeof projectRoles[number]
}

export class ManagedUserDto {
  @IsIn(roles) role!: typeof roles[number]
  @IsString() @MinLength(1) name!: string
  @IsEmail() email!: string
  @IsString() @MinLength(8) password!: string
}

export class ManagedUserUpdateDto {
  @IsOptional() @IsIn(roles) role?: typeof roles[number]
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @IsString() @MinLength(1) name?: string
}

export class ResetPasswordDto {
  @IsString() @MinLength(8) password!: string
}

export class SystemSettingsDto {
  @IsString() @MinLength(1) model!: string
  @IsString() @MinLength(1) mode!: string
  @IsBoolean() desensitize!: boolean
}
