import { Request, Response, NextFunction } from "express";
import { User } from "@/database/entities";
import {
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
} from "typeorm";

export interface UserPayload {
  userId: string;
  jti?: string;
}

export type DecodedToken<T extends UserPayload> = {
  iat: number;
  exp: number;
} & T;

export interface ServiceResponse<T> {
  success: boolean;
  message?: string;
  response?: T;
  error?: {
    message: string;
    code?: string | unknown;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    hasMore: boolean;
    limit: number;
    totalPages: number;
  };
}

export interface BaseFilterOptions<T> {
  page?: number;
  limit?: number;
  search?: string;
  options?: {
    order?: FindOptionsOrder<T>;
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
    relations?: FindOptionsRelations<T> | FindOptionsRelations<T>[] | string[];
  };
}

export type FilterOptions<T> = BaseFilterOptions<T> & Record<string, any>;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface AuthenticatedRequest extends Request {
  user?: User;
}

declare module "express" {
  interface Request {
    user?: AuthenticatedRequest["user"];
    filterOptions?: ReturnType<typeof getFilterOptions>;
    validated?: any;
  }
}

export const getFilterOptions = (query: any) => {
  const {
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    sort = "createdAt:DESC",
    search,
    q,
    relations,
    dateFilter,
    ...filters
  } = query;

  const searchTerm = search ?? q;

  let order: any = {};
  if (sort && typeof sort === "string") {
    const [field, direction] = sort.split(":");
    if (field && direction) {
      order = { [field]: direction.toUpperCase() };
    }
  }
  let cleanFilters: Record<string, any> = {};
  if (filters) {
    cleanFilters = { ...filters };

    Object.keys(cleanFilters).forEach((key) => {
      if (
        cleanFilters[key] === undefined ||
        cleanFilters[key] === null ||
        cleanFilters[key] === ""
      ) {
        delete cleanFilters[key];
      }
    });
  }

  const pageNumber = Math.max(1, Number(page) || DEFAULT_PAGE);
  const limitNumber = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

  return {
    page: pageNumber,
    limit: limitNumber,
    sort: sort as string,
    search: searchTerm as string | undefined,
    dateFilter: dateFilter as string,
    options: {
      ...(sort ? { order } : {}),
      ...(relations ? { relations: relations.split(",") } : {}),
      ...(Object.keys(cleanFilters).length > 0 ? { where: cleanFilters } : {}),
    },
  };
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
};

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void> | void;
