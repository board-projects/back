import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './entities/exam.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamDashboardController } from './exam-dashboard.controller';
import { ExamDashboardService } from './exam-dashboard.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Exam, ExamAssignment, ExamAttempt])],
  controllers: [ExamDashboardController],
  providers: [ExamDashboardService],
})
export class ExamModule {}
