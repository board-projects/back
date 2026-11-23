import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountRolesService, type AccountRole } from '../user/account-roles.service';

@Injectable()
export class ExamDashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountRoles: AccountRolesService,
  ) {}

  async overview(userId: string, requestedRole?: AccountRole) {
    const roles = await this.accountRoles.list(userId);
    const role = requestedRole ?? (roles.includes('teacher') ? 'teacher' : roles[0]);
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Sign in with an account registered for this dashboard');
    }
    const tests = role === 'teacher'
      ? await this.dataSource.query(
        `SELECT "id", "label", "status" FROM "tests"
         WHERE "teacher_id" = $1 AND "is_active" ORDER BY "created_at" DESC, "id"`, [userId],
      )
      : await this.dataSource.query(
        `SELECT a."id", t."label", CASE WHEN ta."submitted_at" IS NOT NULL THEN 'submitted'
            WHEN ta."id" IS NOT NULL THEN 'in_progress' ELSE 'assigned' END AS "status"
         FROM "test_assignments" a
         JOIN "tests" t ON t."id" = a."test_id"
         LEFT JOIN "test_attempts" ta ON ta."assignment_id" = a."id" AND ta."is_active"
         WHERE a."student_id" = $1 AND a."is_active" AND t."is_active" AND t."status" = 'published'
         ORDER BY a."created_at" DESC, a."id"`, [userId],
      );
    return { role, roles, tests };
  }
}
