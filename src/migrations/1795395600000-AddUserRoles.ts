import { UserRole } from '../user/entities/user-role.entity';
import { Table, TableForeignKey, type MigrationInterface, type QueryRunner } from 'typeorm';

const legacyRoles = [['teacher', 'teachers'], ['student', 'students']] as const;
const examMembers = [
  { table: 'tests', column: 'teacher_id', legacy: 'teachers' },
  { table: 'test_assignments', column: 'student_id', legacy: 'students' },
] as const;

const userForeignKey = (column: string, onDelete: 'RESTRICT' | 'SET NULL') => ({
  name: `user_roles_${column}_fkey`,
  columnNames: [column],
  referencedTableName: 'users',
  referencedColumnNames: ['id'],
  onDelete,
});

type Membership = {
  id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
};

const auditNames = ['created_by', 'updated_by', 'created_at', 'updated_at', 'is_active'] as const;

async function moveExamReferences(queryRunner: QueryRunner, useUserTable: boolean) {
  for (const { table, column, legacy } of examMembers) {
    const name = `${table}_${column}_fkey`;
    await queryRunner.dropForeignKey(table, name);
    await queryRunner.createForeignKey(table, new TableForeignKey({
      name,
      columnNames: [column],
      referencedTableName: useUserTable ? 'users' : legacy,
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    }));
  }
}

export class AddUserRoles1795395600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'user_roles',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid' },
        { name: 'role', type: 'varchar', length: '16' },
        { name: 'created_by', type: 'uuid', isNullable: true },
        { name: 'updated_by', type: 'uuid', isNullable: true },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        { name: 'is_active', type: 'boolean', default: true },
      ],
      uniques: [{ name: 'UQ_user_roles_user_role', columnNames: ['user_id', 'role'] }],
      checks: [{ name: 'CHK_user_roles_role', expression: `"role" IN ('teacher', 'student')` }],
      foreignKeys: [
        userForeignKey('user_id', 'RESTRICT'),
        userForeignKey('created_by', 'SET NULL'),
        userForeignKey('updated_by', 'SET NULL'),
      ],
    }));

    const manager = queryRunner.manager;
    for (const [role, table] of legacyRoles) {
      const members = await manager.createQueryBuilder().select('*').from(table, 'legacy').getRawMany<Membership>();
      for (let offset = 0; offset < members.length; offset += 500) {
        const values = members.slice(offset, offset + 500).map((member) => ({
          userId: member.id,
          role,
          createdBy: member.created_by,
          updatedBy: member.updated_by,
          createdAt: member.created_at,
          updatedAt: member.updated_at,
          isActive: member.is_active,
        }));
        await manager.insert(UserRole, values);
      }
    }
    await moveExamReferences(queryRunner, true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const manager = queryRunner.manager;
    for (const [role, table] of legacyRoles) {
      const members = await manager.createQueryBuilder().select('membership.user_id', 'id')
        .from('user_roles', 'membership')
        .where('membership.role = :role', { role })
        .addSelect(auditNames.map((column) => `membership.${column}`))
        .getRawMany<Membership>();
      for (let offset = 0; offset < members.length; offset += 500) {
        await manager.createQueryBuilder().insert().into(table).values(members.slice(offset, offset + 500))
          .orIgnore().execute();
      }
      for (const { id, updated_by, updated_at, is_active } of members) {
        await manager.createQueryBuilder().update(table).set({ updated_by, updated_at, is_active })
          .where('id = :id', { id }).execute();
      }
    }
    for (const { table, column, legacy } of examMembers) {
      const members = await manager.createQueryBuilder().select(`exam.${column}`, 'id')
        .distinct(true).from(table, 'exam').getRawMany<{ id: string }>();
      for (let offset = 0; offset < members.length; offset += 500) {
        await manager.createQueryBuilder().insert().into(legacy).values(members.slice(offset, offset + 500))
          .orIgnore().execute();
      }
    }
    await moveExamReferences(queryRunner, false);
    await queryRunner.dropTable('user_roles');
  }
}
