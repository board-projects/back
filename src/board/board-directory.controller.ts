import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { parseBoardChanges } from './board.protocol';
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

  @Post(':reference/title')
  @HttpCode(200)
  async title(@Param('reference', ParseUUIDPipe) reference: string, @Body() credentials?: SessionBody) {
    const user = await this.auth.requireSessionUser(credentials?.access_token, credentials?.refresh_token);
    return this.boards.title(reference, user.id);
  }

  @Post(':reference/rename')
  @HttpCode(200)
  async rename(@Param('reference', ParseUUIDPipe) reference: string, @Body() body?: SessionBody & { title?: unknown }) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.boards.rename(reference, user.id, body?.title);
  }

  @Post('validate-import')
  @HttpCode(200)
  validateImport(@Body('changes') value: unknown) {
    const changes = parseBoardChanges(value);
    if (!changes || changes.some((change) => change.item === null)) {
      throw new BadRequestException('Invalid board items in this JSON file');
    }
    return { valid: true };
  }

  @Post()
  async create(@Body() body?: SessionBody & { title?: unknown }) {
    const owner = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.boards.create(owner.id, body?.title);
  }
}
