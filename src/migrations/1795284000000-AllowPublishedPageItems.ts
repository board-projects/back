import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowPublishedPageItems1795284000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "published_boards"
        ADD COLUMN "item_reference" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        DROP CONSTRAINT "published_boards_pkey",
        ADD CONSTRAINT "published_boards_pkey" PRIMARY KEY ("reference", "item_reference")
    `);
    await queryRunner.query('ALTER TABLE "published_boards" ALTER COLUMN "item_reference" DROP DEFAULT');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      'SELECT 1 FROM "published_boards" WHERE "item_reference" <> $1 LIMIT 1',
      ['00000000-0000-0000-0000-000000000000'],
    );
    if (rows.length) throw new Error('Page item publications must be preserved before reverting this migration');

    await queryRunner.query(`
      ALTER TABLE "published_boards"
        DROP CONSTRAINT "published_boards_pkey",
        DROP COLUMN "item_reference",
        ADD CONSTRAINT "published_boards_pkey" PRIMARY KEY ("reference")
    `);
  }
}
