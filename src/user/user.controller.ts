import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UserController {
  constructor(private service: UserService) {}

  @Get()
  findAll() {
    return this.service.find();
  }

  @Get('id/:id')
  findOneById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get('email/:email')
  findOneByEmail(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.service.create(createUserDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() udpateUserDto: UpdateUserDto) {
  }
}
