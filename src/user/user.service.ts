import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  findById(id: string) {
    return this.userRepository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  find() {
    return this.userRepository.find();
  }

  async create(dto: CreateUserDto) {
    const user = this.userRepository.create({
      email: dto.email,
      username: dto.email
    })
    
    return await this.userRepository.save(user);
  }

  async getOrCreate(dto: CreateUserDto) {
    const user = await this.findByEmail(dto.email);
    if (user !== null) {
      return user;
    }

    return await this.create(dto);
  }
}
