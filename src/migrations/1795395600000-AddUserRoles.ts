import type { MigrationInterface, QueryRunner } from 'typeorm';

const legacyRoles = [['teacher', 'teachers'], ['student', 'students']] as const;

export class AddUserRoles1795395600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "role" varchar(16) NOT NULL,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_user_roles_user_role" UNIQUE ("user_id", "role"),
        CONSTRAINT "CHK_user_roles_role" CHECK ("role" IN ('teacher', 'student'))
      )
    `);
    for (const [role, table] of legacyRoles) {
      await queryRunner.query(`
        INSERT INTO "user_roles" ("user_id", "role", "created_by", "updated_by", "created_at", "updated_at", "is_active")
        SELECT "id", $1, "created_by", "updated_by", "created_at", "updated_at", "is_active" FROM "${table}"
      `, [role]);
    }
    await queryRunner.query(`
      ALTER TABLE "tests" DROP CONSTRAINT "tests_teacher_id_fkey",
      ADD CONSTRAINT "tests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "test_assignments" DROP CONSTRAINT "test_assignments_student_id_fkey",
      ADD CONSTRAINT "test_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [role, table] of legacyRoles) {
      await queryRunner.query(`
        INSERT INTO "${table}" ("id", "created_by", "updated_by", "created_at", "updated_at", "is_active")
        SELECT "user_id", "created_by", "updated_by", "created_at", "updated_at", "is_active"
        FROM "user_roles" WHERE "role" = $1
        ON CONFLICT ("id") DO UPDATE SET
          "updated_by" = EXCLUDED."updated_by", "updated_at" = EXCLUDED."updated_at", "is_active" = EXCLUDED."is_active"
      `, [role]);
    }
    await queryRunner.query(`
      INSERT INTO "teachers" ("id") SELECT DISTINCT "teacher_id" FROM "tests" ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "students" ("id") SELECT DISTINCT "student_id" FROM "test_assignments" ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query(`
      ALTER TABLE "tests" DROP CONSTRAINT "tests_teacher_id_fkey",
      ADD CONSTRAINT "tests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "test_assignments" DROP CONSTRAINT "test_assignments_student_id_fkey",
      ADD CONSTRAINT "test_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query('DROP TABLE "user_roles"');
  }
}
