import { Board } from '../board/entities/board.entity';
import { User } from '../user/entities/user.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { ExamAssignmentController } from './exam-assignment.controller';
import { ExamAssignmentService } from './exam-assignment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './entities/exam.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamDashboardController } from './exam-dashboard.controller';
import { ExamDashboardService } from './exam-dashboard.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Exam, ExamAssignment, ExamAttempt, ExamQuestion, Board, User])],
  controllers: [ExamDashboardController, ExamAssignmentController],
  providers: [ExamDashboardService, ExamAssignmentService],
})
export class ExamModule {}
