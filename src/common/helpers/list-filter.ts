import { FilterOptions, PaginatedResponse, getFilterOptions } from "../types";

export type RequestFilter = ReturnType<typeof getFilterOptions> | undefined;

export interface ListFilterRules {
  filters?: string[];
  sorts?: string[];
  force?: Record<string, unknown>;
}

export const buildListFilter = <T>(
  filterOptions: ReturnType<typeof getFilterOptions> | undefined,
  rules: ListFilterRules = {},
): FilterOptions<T> => {
  const base = filterOptions ?? getFilterOptions({});
  const allowedFilters = new Set(rules.filters ?? []);
  const allowedSorts = new Set(rules.sorts ?? ["createdAt"]);

  const where: Record<string, unknown> = {};
  for (const [key, value] of Object.entries((base.options.where ?? {}) as Record<string, unknown>)) {
    if (allowedFilters.has(key)) where[key] = value;
  }
  Object.assign(where, rules.force ?? {});

  const order: Record<string, "ASC" | "DESC"> = {};
  for (const [key, dir] of Object.entries((base.options.order ?? {}) as Record<string, string>)) {
    if (allowedSorts.has(key) && (dir === "ASC" || dir === "DESC")) order[key] = dir;
  }
  if (Object.keys(order).length === 0) order.createdAt = "DESC";

  return {
    page: base.page,
    limit: base.limit,
    search: base.search,
    dateFilter: base.dateFilter,
    options: { where, order },
  } as unknown as FilterOptions<T>;
};

export const mapPaginated = <T, R>(
  result: PaginatedResponse<T>,
  fn: (row: T) => R,
): PaginatedResponse<R> => ({ data: result.data.map(fn), meta: result.meta });

export const buildMeta = (total: number, page: number, limit: number): PaginatedResponse<never>["meta"] => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasMore: page * limit < total,
});
