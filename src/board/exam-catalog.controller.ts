import { Controller, Get, Query } from '@nestjs/common';
import { ExamCatalogService } from './exam-catalog.service';

@Controller('exam/catalog')
export class ExamCatalogController {
  constructor(private readonly catalog: ExamCatalogService) {}

  @Get()
  search(@Query() filters: Record<string, unknown>) {
    return this.catalog.search(filters);
  }
}
