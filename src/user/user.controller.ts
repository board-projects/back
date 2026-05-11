import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private service: UserService) {}

  @Get('contacts')
  getUsers() {
    return this.service.find();
  }
}
