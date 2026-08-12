import { Type } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, Max, MinLength } from 'class-validator'

const roles = ['manager', 'member', 'admin', 'auditor'] as const
const statuses = ['todo', 'in_progress', 'completed', 'closed'] as const

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

export class UpdateTaskDto {
  @IsOptional() @IsIn(statuses) status?: typeof statuses[number]
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
