import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ExportsProcessor } from './processors/exports.processor';
import { NotificationsProcessor } from './processors/notifications.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { TimesheetRemindersProcessor } from './processors/timesheet-reminders.processor';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    BullModule.registerQueue(
      ...['exports', 'notifications', 'timesheet-reminders', 'reports'].map((name) => ({
        name,
        defaultJobOptions: {
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 100 },
        },
      })),
    ),
    StorageModule,
  ],
  providers: [
    JobsService,
    ExportsProcessor,
    NotificationsProcessor,
    TimesheetRemindersProcessor,
    ReportsProcessor,
  ],
  exports: [JobsService],
})
export class JobsModule {}
