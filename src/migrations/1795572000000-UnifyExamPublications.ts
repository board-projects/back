import { TableColumn, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

type LegacyPublication = {
  reference: string;
  item_reference: string;
  public_reference: string;
  title: string;
  layout: object;
  snapshot: object;
  visibility: 'public' | 'private';
  topic: string;
  level: string;
  locale: string;
  published_at: Date;
  owner_id: string;
};

export class UnifyExamPublications1795572000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!runner.isTransactionActive) throw new Error('Unifying exam publications requires a transaction');
    await runner.renameTable('published_boards', 'legacy_exam_publications');
    await runner.addColumns('tests', [
      new TableColumn({ name: 'visibility', type: 'varchar', length: '7', default: "'private'" }),
      new TableColumn({ name: 'topic', type: 'varchar', length: '80', default: "''" }),
      new TableColumn({ name: 'level', type: 'varchar', length: '16', default: "''" }),
      new TableColumn({ name: 'locale', type: 'varchar', length: '12', default: "''" }),
      new TableColumn({ name: 'published_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'opens_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'closes_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'duration_minutes', type: 'integer', isNullable: true }),
      new TableColumn({ name: 'search_pending', type: 'boolean', default: false }),
    ]);
    await runner.createIndex('tests', new TableIndex({
      name: 'IDX_tests_search_pending', columnNames: ['published_at'], where: '"search_pending" = true',
    }));
    await runner.manager.createQueryBuilder().update('tests').set({
      opensAt: () => `("page_snapshot"->'timing'->>'opensAt')::timestamptz`,
      closesAt: () => `("page_snapshot"->'timing'->>'closesAt')::timestamptz`,
      durationMinutes: () => `("page_snapshot"->'timing'->>'durationMinutes')::integer`,
      pageSnapshot: () => `"page_snapshot" - 'timing'`,
    }).where(`jsonb_exists("page_snapshot", 'timing')`).execute();

    const count = await runner.manager.createQueryBuilder().select('COUNT(*)', 'count')
      .from('legacy_exam_publications', 'publication').getRawOne<{ count: string }>();
    let transferred = 0;
    for (let offset = 0; ; offset += 200) {
      const pages = await runner.manager.createQueryBuilder()
        .select('publication.*').addSelect('board.owner_id', 'owner_id')
        .from('legacy_exam_publications', 'publication')
        .innerJoin('boards', 'board', 'board.reference = publication.reference')
        .orderBy('publication.public_reference', 'ASC').limit(200).offset(offset)
        .getRawMany<LegacyPublication>();
      if (!pages.length) break;
      await runner.manager.createQueryBuilder().insert().into('tests').values(pages.map((page) => ({
        id: page.public_reference, teacherId: page.owner_id, boardReference: page.reference,
        pageId: page.item_reference, label: page.title,
        pageSnapshot: { layout: page.layout, snapshot: page.snapshot },
        status: 'published', visibility: page.visibility, topic: page.topic, level: page.level, locale: page.locale,
        publishedAt: page.published_at, searchPending: page.visibility === 'public',
        createdBy: page.owner_id, updatedBy: page.owner_id, createdAt: page.published_at, updatedAt: page.published_at,
      }))).execute();
      transferred += pages.length;
    }

    if (transferred !== Number(count?.count)) throw new Error('Not all exam publications were migrated');
    await runner.dropTable('legacy_exam_publications', false, false, false);
  }

  async down(): Promise<void> {
    throw new Error('Restore the pre-migration PostgreSQL backup to revert unified exam publications');
  }
}
