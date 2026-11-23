import type { MigrationInterface, QueryRunner } from 'typeorm';

const auditColumns = `
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "is_active" boolean NOT NULL DEFAULT true
`;

export class CreateExamTables1795392000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['teachers', 'students']) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
          ${auditColumns}
        )
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "tests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "teacher_id" uuid NOT NULL REFERENCES "teachers"("id") ON DELETE RESTRICT,
        "board_reference" uuid REFERENCES "boards"("reference") ON DELETE SET NULL,
        "page_id" uuid NOT NULL,
        "label" varchar(80) NOT NULL,
        "page_snapshot" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        ${auditColumns},
        CONSTRAINT "CHK_tests_page_snapshot" CHECK (jsonb_typeof("page_snapshot") = 'object'),
        CONSTRAINT "CHK_tests_status" CHECK ("status" IN ('draft', 'published', 'archived'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tests_teacher_page_created" ON "tests" ("teacher_id", "page_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "test_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "test_id" uuid NOT NULL REFERENCES "tests"("id") ON DELETE RESTRICT,
        "source_item_id" varchar(128) NOT NULL,
        "kind" varchar(48) NOT NULL,
        "position" integer NOT NULL,
        "question_jsonb" jsonb NOT NULL,
        ${auditColumns},
        CONSTRAINT "UQ_test_questions_test_item" UNIQUE ("test_id", "source_item_id"),
        CONSTRAINT "UQ_test_questions_test_position" UNIQUE ("test_id", "position"),
        CONSTRAINT "CHK_test_questions_position" CHECK ("position" >= 0),
        CONSTRAINT "CHK_test_questions_payload" CHECK (jsonb_typeof("question_jsonb") = 'object')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "test_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "test_id" uuid NOT NULL REFERENCES "tests"("id") ON DELETE RESTRICT,
        "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
        ${auditColumns},
        CONSTRAINT "UQ_test_assignments_test_student" UNIQUE ("test_id", "student_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_test_assignments_student" ON "test_assignments" ("student_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "test_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL REFERENCES "test_assignments"("id") ON DELETE RESTRICT,
        "answers_jsonb" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "submitted_at" timestamptz,
        ${auditColumns},
        CONSTRAINT "UQ_test_attempts_assignment" UNIQUE ("assignment_id"),
        CONSTRAINT "CHK_test_attempts_answers" CHECK (jsonb_typeof("answers_jsonb") = 'object'),
        CONSTRAINT "CHK_test_attempts_submission_time" CHECK ("submitted_at" >= "started_at")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['test_attempts', 'test_assignments', 'test_questions', 'tests', 'students', 'teachers']) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }
  }
}
