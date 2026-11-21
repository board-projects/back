import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppGateway } from './board.gateway';
import { BoardDirectoryController } from './board-directory.controller';
import { BoardDirectoryService } from './board-directory.service';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Board])],
  controllers: [BoardDirectoryController],
  providers: [AppGateway, BoardRoomService, BoardDirectoryService],
})
export class BoardModule {}
