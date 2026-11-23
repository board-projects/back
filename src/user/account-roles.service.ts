import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type AccountRole = 'teacher' | 'student';

@Injectable()
export class AccountRolesService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string): Promise<AccountRole[]> {
    const rows: Array<{ role: AccountRole }> = await this.dataSource.query(
      'SELECT "role" FROM "user_roles" WHERE "user_id" = $1 AND "is_active"',
      [userId],
    );
    return rows.map(({ role }) => role);
  }

  async require(userId: string, role: AccountRole) {
    if (!(await this.list(userId)).includes(role)) throw new ForbiddenException(`This account does not have the ${role} role`);
  }
}
