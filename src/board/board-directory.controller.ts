import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BoardDirectoryService } from './board-directory.service';

type SessionBody = { access_token?: unknown; refresh_token?: unknown };

@Controller('boards')
export class BoardDirectoryController {
  constructor(
    private readonly auth: AuthService,
    private readonly boards: BoardDirectoryService,
  ) {}

  @Post('list')
  @HttpCode(200)
  async list(@Body() credentials?: SessionBody) {
    const owner = await this.auth.requireSessionUser(credentials?.access_token, credentials?.refresh_token);
    return this.boards.list(owner.id);
  }

  @Post()
  async create(@Body() body?: SessionBody & { title?: unknown }) {
    const owner = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.boards.create(owner.id, body?.title);
  }
}
