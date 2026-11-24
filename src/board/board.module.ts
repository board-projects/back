import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ExamCatalogController } from './exam-catalog.controller';
import { ExamCatalogService } from './exam-catalog.service';
import { AppGateway } from './board.gateway';
import { BoardDirectoryController } from './board-directory.controller';
import { BoardDirectoryService } from './board-directory.service';
import { BoardRoomService } from './board-room.service';
import { BoardPublicationController } from './board-publication.controller';
import { BoardPublicationService } from './board-publication.service';
import { PublishedBoard } from './entities/published-board.entity';
import { Board } from './entities/board.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Board, PublishedBoard])],
  controllers: [BoardDirectoryController, BoardPublicationController, ExamCatalogController],
  providers: [AppGateway, BoardRoomService, BoardDirectoryService, BoardPublicationService, ExamCatalogService],
})
export class BoardModule {}
