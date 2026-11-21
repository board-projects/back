import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BoardPublicationService } from './board-publication.service';

type PublishBody = { access_token?: unknown; refresh_token?: unknown; layout?: unknown; snapshot?: unknown };

@Controller('boards')
export class BoardPublicationController {
  constructor(private readonly auth: AuthService, private readonly publications: BoardPublicationService) {}

  @Post(':reference/publish')
  async publish(@Param('reference', ParseUUIDPipe) reference: string, @Body() body?: PublishBody) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.publications.publish(user.id, reference, body?.layout);
  }

  @Post(':reference/pages/:itemReference/preview')
  @HttpCode(200)
  async previewPage(
    @Param('reference', ParseUUIDPipe) reference: string,
    @Param('itemReference', ParseUUIDPipe) itemReference: string,
    @Body() body?: PublishBody,
  ) {
    await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.publications.previewPage(reference, itemReference);
  }

  @Post(':reference/pages/:itemReference/publish')
  async publishPage(
    @Param('reference', ParseUUIDPipe) reference: string,
    @Param('itemReference', ParseUUIDPipe) itemReference: string,
    @Body() body?: PublishBody,
  ) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.publications.publishPage(user.id, reference, itemReference, body?.snapshot);
  }

  @Post('publications')
  publishPublicPage(@Body() draft: unknown) {
    return this.publications.publishPublicPage(draft);
  }

  @Get(':reference/published')
  read(@Param('reference', ParseUUIDPipe) reference: string) {
    return this.publications.read(reference);
  }
}
