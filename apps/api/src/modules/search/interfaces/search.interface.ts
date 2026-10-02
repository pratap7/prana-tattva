import {
  ProviderSearchQueryDto,
  ProviderSearchResponse,
  SearchFacets,
} from '@project-nirvana/shared';

export const SEARCH_SERVICE_TOKEN = Symbol('SEARCH_SERVICE_TOKEN');

export interface ISearchService {
  searchProviders(query: ProviderSearchQueryDto): Promise<ProviderSearchResponse>;
  getFacets(): Promise<SearchFacets>;
}
