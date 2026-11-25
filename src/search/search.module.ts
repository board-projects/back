import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from '../exam/entities/exam.entity';
import { ElasticsearchClient } from './elasticsearch.client';
import { ExamCatalogController } from './exams/exam-catalog.controller';
import { ExamCatalogService } from './exams/exam-catalog.service';
import { ExamSearchRepository } from './exams/exam-search.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Exam])],
  controllers: [ExamCatalogController],
  providers: [ElasticsearchClient, ExamSearchRepository, ExamCatalogService],
})
export class SearchModule {}
