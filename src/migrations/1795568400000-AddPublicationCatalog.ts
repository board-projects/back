import { TableColumn, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddPublicationCatalog1795568400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.addColumns('published_boards', [
      new TableColumn({ name: 'visibility', type: 'varchar', length: '7', default: "'public'" }),
      new TableColumn({ name: 'topic', type: 'varchar', length: '80', default: "''" }),
      new TableColumn({ name: 'level', type: 'varchar', length: '16', default: "''" }),
      new TableColumn({ name: 'locale', type: 'varchar', length: '12', default: "''" }),
      new TableColumn({ name: 'search_pending', type: 'boolean', default: true }),
    ]);
    await runner.createIndex('published_boards', new TableIndex({
      name: 'IDX_published_boards_search_pending', columnNames: ['published_at'], where: '"search_pending" = true',
    }));
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropIndex('published_boards', 'IDX_published_boards_search_pending');
    await runner.dropColumns('published_boards', ['visibility', 'topic', 'level', 'locale', 'search_pending']);
  }
}
