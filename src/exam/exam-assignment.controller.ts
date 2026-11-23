import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ExamAssignmentService } from './exam-assignment.service';

type Session = { access_token?: unknown; refresh_token?: unknown };

@Controller('exam/assignments')
export class ExamAssignmentController {
  constructor(private readonly auth: AuthService, private readonly assignments: ExamAssignmentService) {}

  @Post('board/:reference/pages/:pageId')
  @HttpCode(200)
  async assign(
    @Param('reference', ParseUUIDPipe) reference: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body?: Session & { draft?: unknown; emails?: unknown },
  ) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.assignments.assign(user.id, reference, pageId, body?.draft, body?.emails);
  }

  @Post(':assignmentId')
  @HttpCode(200)
  async read(@Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body?: Session) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    return this.assignments.read(user.id, assignmentId);
  }
}
