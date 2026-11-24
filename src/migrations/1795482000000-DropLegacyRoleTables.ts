import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';

const legacyTables = ['teachers', 'students'] as const;

export class DropLegacyRoleTables1795482000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error('Removing legacy role tables requires a transaction');

    for (const table of legacyTables) {
      const retired = `${table}_legacy_retired`;
      await queryRunner.renameTable(table, retired);
      const count = await queryRunner.manager.createQueryBuilder()
        .select('COUNT(*)', 'count')
        .from(retired, 'legacy')
        .getRawOne<{ count: string }>();
      if (Number(count?.count) !== 0) throw new Error(`Legacy role table "${table}" still contains data`);

      await queryRunner.dropTable(retired, false, false, false);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of legacyTables) {
      await queryRunner.createTable(new Table({
        name: table,
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'created_by', type: 'uuid', isNullable: true },
          { name: 'updated_by', type: 'uuid', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          { name: 'is_active', type: 'boolean', default: true },
        ],
        foreignKeys: ['id', 'created_by', 'updated_by'].map((column) => ({
          name: `${table}_${column}_fkey`,
          columnNames: [column],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: column === 'id' ? 'RESTRICT' : 'SET NULL',
        })),
      }));
    }
  }
}
