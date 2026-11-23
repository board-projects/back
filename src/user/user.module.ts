import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AccountRolesService } from './account-roles.service';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, AccountRolesService],
  controllers: [UserController],
  exports: [UserService, AccountRolesService],
})
export class UserModule {}
