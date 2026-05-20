import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  find() {
    return this.userRepository.find();
  }

  create(email: string, password: string) {
    const user = this.userRepository.create({
      email,
      username: email,
    });
    return this.userRepository.save(user);
  }
}
