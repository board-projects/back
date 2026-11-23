import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ExamDashboardController } from './exam-dashboard.controller';
import { ExamDashboardService } from './exam-dashboard.service';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [ExamDashboardController],
  providers: [ExamDashboardService],
})
export class ExamModule {}
