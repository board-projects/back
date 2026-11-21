import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Board } from './entities/board.entity';

@Injectable()
export class BoardDirectoryService {
  constructor(@InjectRepository(Board) private readonly boards: Repository<Board>) {}

  list(ownerId: string) {
    return this.boards.find({
      where: { ownerId },
      select: { reference: true, title: true, createdAt: true },
      order: { createdAt: 'DESC', reference: 'ASC' },
    });
  }

  async title(reference: string) {
    const board = await this.boards.findOne({ where: { reference }, select: { title: true } });
    return { title: board?.title ?? 'Untitled board' };
  }

  async create(ownerId: string, title: unknown) {
    const name = typeof title === 'string' ? title.trim() : '';
    if (!name || name.length > 80) {
      throw new BadRequestException('Enter a board name between 1 and 80 characters');
    }

    const board = await this.boards.save(this.boards.create({
      reference: randomUUID(),
      ownerId,
      title: name,
    }));

    return { reference: board.reference, title: board.title, createdAt: board.createdAt };
  }
}
