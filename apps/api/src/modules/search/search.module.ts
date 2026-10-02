import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { PostgresSearchService } from './services/postgres-search.service';
import { SEARCH_SERVICE_TOKEN } from './interfaces/search.interface';

@Module({
  controllers: [SearchController],
  providers: [
    {
      provide: SEARCH_SERVICE_TOKEN,
      useClass: PostgresSearchService,
    },
    PostgresSearchService,
  ],
  exports: [SEARCH_SERVICE_TOKEN, PostgresSearchService],
})
export class SearchModule {}
