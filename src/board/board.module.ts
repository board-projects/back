import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppGateway } from './board.gateway';
import { BoardDirectoryController } from './board-directory.controller';
import { BoardDirectoryService } from './board-directory.service';
import { BoardRoomService } from './board-room.service';
import { BoardPublicationController } from './board-publication.controller';
import { BoardPublicationService } from './board-publication.service';
import { Exam } from '../exam/entities/exam.entity';
import { Board } from './entities/board.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Board, Exam])],
  controllers: [BoardDirectoryController, BoardPublicationController],
  providers: [AppGateway, BoardRoomService, BoardDirectoryService, BoardPublicationService],
})
export class BoardModule {}
