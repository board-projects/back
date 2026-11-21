import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BoardPublicationService } from './board-publication.service';

type PublishBody = { access_token?: unknown; refresh_token?: unknown; layout?: unknown };

@Controller('boards')
export class BoardPublicationController {
  constructor(private readonly auth: AuthService, private readonly publications: BoardPublicationService) {}

  @Post(':reference/publish')
  async publish(@Param('reference', ParseUUIDPipe) reference: string, @Body() body?: PublishBody) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.publications.publish(user.id, reference, body?.layout);
  }

  @Get(':reference/published')
  read(@Param('reference', ParseUUIDPipe) reference: string) {
    return this.publications.read(reference);
  }
}
