import { Controller, Get, Query, Inject, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  providerSearchQuerySchema,
  ProviderSearchQueryDto,
  ProviderSearchResponse,
  SearchFacets,
} from '@project-nirvana/shared';
import { ISearchService, SEARCH_SERVICE_TOKEN } from './interfaces/search.interface';

@ApiTags('Provider Discovery & Search')
@Controller('providers')
export class SearchController {
  constructor(
    @Inject(SEARCH_SERVICE_TOKEN)
    private readonly searchService: ISearchService,
  ) {}

  @Public()
  @Get('search')
  @UsePipes(new ZodValidationPipe(providerSearchQuerySchema))
  @ApiOperation({
    summary:
      'Search and filter sanctuary practitioners with Bayesian ranking and cursor pagination',
  })
  @ApiResponse({ status: 200, description: 'Matched practitioner search results and facets' })
  async search(@Query() query: ProviderSearchQueryDto): Promise<ProviderSearchResponse> {
    return this.searchService.searchProviders(query);
  }

  @Public()
  @Get('facets')
  @ApiOperation({ summary: 'Get active category, location, and price filter facets' })
  @ApiResponse({ status: 200, description: 'Search aggregation facets' })
  async getFacets(): Promise<SearchFacets> {
    return this.searchService.getFacets();
  }
}
