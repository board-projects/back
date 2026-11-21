import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublishedBoards1795280400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "published_boards" (
        "reference" uuid PRIMARY KEY,
        "public_reference" uuid NOT NULL,
        "title" varchar(80) NOT NULL,
        "layout" jsonb NOT NULL,
        "snapshot" jsonb NOT NULL,
        "published_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_published_boards_public_reference" UNIQUE ("public_reference"),
        CONSTRAINT "FK_published_boards_board" FOREIGN KEY ("reference") REFERENCES "boards"("reference") ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "published_boards"');
  }
}
