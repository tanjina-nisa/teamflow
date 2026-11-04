import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PRIORITIES, PROJECT_STATUSES, ROLES, TASK_STATUSES, TASK_TYPES } from '../entities';
import type { Priority, ProjectStatus, Role, TaskStatus, TaskType } from '../entities';

export class RegisterDto {
  @IsString() @Length(2, 80) workspaceName: string;
  @IsString() @Length(2, 80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class InviteUserDto {
  @IsString() @Length(2, 80) name: string;
  @IsEmail() email: string;
  @IsIn(ROLES) role: Role;
  @IsOptional() @IsString() title?: string;
  @IsString() @MinLength(8) password: string;
}

export class UpdateUserDto {
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) capacity?: number;
  @IsOptional() active?: boolean;
}

export class ProjectDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9]{1,5}$/, { message: 'key must be 2–6 capital letters/digits' }) key: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: ProjectStatus;
  @IsOptional() @ValidateIf((o) => o.startDate !== null) @IsDateString() startDate?: string | null;
  @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateString() dueDate?: string | null;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) memberIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: ProjectStatus;
  @IsOptional() @ValidateIf((o) => o.startDate !== null) @IsDateString() startDate?: string | null;
  @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateString() dueDate?: string | null;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) memberIds?: string[];
}

export class SprintDto {
  @IsString() @Length(1, 80) name: string;
  @IsOptional() @IsString() goal?: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class TaskDto {
  @IsUUID() projectId: string;
  @IsString() @Length(1, 200) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsIn(TASK_TYPES) type?: TaskType;
  @IsOptional() @ValidateIf((o) => o.assigneeId !== null) @IsUUID() assigneeId?: string | null;
  @IsOptional() @ValidateIf((o) => o.sprintId !== null) @IsUUID() sprintId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) points?: number;
  @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateString() dueDate?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) labels?: string[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsIn(TASK_TYPES) type?: TaskType;
  @IsOptional() @ValidateIf((o) => o.assigneeId !== null) @IsUUID() assigneeId?: string | null;
  @IsOptional() @ValidateIf((o) => o.sprintId !== null) @IsUUID() sprintId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) points?: number;
  @IsOptional() @ValidateIf((o) => o.dueDate !== null) @IsDateString() dueDate?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) labels?: string[];
  @IsOptional() @IsNumber() order?: number;
}

export class CommentDto {
  @IsString() @Length(1, 5000) body: string;
}
