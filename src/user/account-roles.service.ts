import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, type AccountRole } from './entities/user-role.entity';

export type { AccountRole } from './entities/user-role.entity';

@Injectable()
export class AccountRolesService {
  constructor(@InjectRepository(UserRole) private readonly roles: Repository<UserRole>) {}

  async list(userId: string): Promise<AccountRole[]> {
    const rows = await this.roles.find({ select: { role: true }, where: { userId, isActive: true } });
    return rows.map(({ role }) => role);
  }

  async require(userId: string, role: AccountRole) {
    if (!(await this.roles.existsBy({ userId, role, isActive: true }))) {
      throw new ForbiddenException(`This account does not have the ${role} role`);
    }
  }
}
