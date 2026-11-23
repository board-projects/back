import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ExamDashboardService } from './exam-dashboard.service';

type OverviewBody = { access_token?: unknown; refresh_token?: unknown; role?: unknown };

@Controller('exam/dashboard')
export class ExamDashboardController {
  constructor(
    private readonly auth: AuthService,
    private readonly dashboard: ExamDashboardService,
  ) {}

  @Post()
  @HttpCode(200)
  async overview(@Body() body?: OverviewBody) {
    const user = await this.auth.requireSessionUser(body?.access_token, body?.refresh_token);
    const role = body?.role;
    if (role !== undefined && role !== 'teacher' && role !== 'student') throw new BadRequestException('Unknown dashboard role');
    return this.dashboard.overview(user.id, role);
  }
}
