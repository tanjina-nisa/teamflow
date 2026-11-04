import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';
import { AuthGuard, Public } from './common/auth';
import { AuthController, AuthService, UsersController } from './auth/auth';
import { ActivityController, ActivityService } from './activity/activity';
import { DeadlineReminders, NotificationsController, NotificationsService } from './notifications/notifications';
import { ProjectsController, ProjectsService, SprintsController } from './projects/projects';
import { TasksController, TasksService } from './tasks/tasks';
import { ReportsController } from './reports/reports';
import { EventsGateway } from './realtime/events.gateway';

@Controller()
class HealthController {
  @Public() @Get('health') health() {
    return { ok: true, service: 'teamflow-api', time: new Date().toISOString() };
  }
}

const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/teamflow',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: ENTITIES,
      // Schema auto-sync keeps setup to one command. Turn it off and use migrations once you have real data.
      synchronize: process.env.DB_SYNC !== 'false',
    }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.register({ global: true, secret: jwtSecret, signOptions: { expiresIn: '7d' } }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    ProjectsController,
    SprintsController,
    TasksController,
    ActivityController,
    NotificationsController,
    ReportsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    EventsGateway,
    ActivityService,
    NotificationsService,
    DeadlineReminders,
    ProjectsService,
    TasksService,
  ],
})
export class AppModule {}
