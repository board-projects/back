import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatGateway } from './chat/chat.gateway';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AppGateway } from './board/board.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'mahan',
      password: 'mahan',
      database: 'board',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      autoLoadEntities: true,
      synchronize: false,
    }),
    UserModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, ChatGateway, AppGateway],
})
export class AppModule {}
