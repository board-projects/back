import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { AppGateway } from './board.gateway';
import { BoardDirectoryController } from './board-directory.controller';
import { BoardDirectoryService } from './board-directory.service';
import { BoardRoomService } from './board-room.service';
import { BoardPublicationController } from './board-publication.controller';
import { BoardPublicationService } from './board-publication.service';
import { PublishedBoard } from './entities/published-board.entity';
import { Board } from './entities/board.entity';

@Module({
  imports: [AuthModule, UserModule, TypeOrmModule.forFeature([Board, PublishedBoard])],
  controllers: [BoardDirectoryController, BoardPublicationController],
  providers: [AppGateway, BoardRoomService, BoardDirectoryService, BoardPublicationService],
})
export class BoardModule {}
