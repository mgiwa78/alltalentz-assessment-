import {
  Repository,
  FindOptionsWhere,
  EntityTarget,
  DataSource,
  ObjectLiteral,
  DeepPartial,
  SaveOptions,
  FindManyOptions,
  UpdateResult,
  FindOperator,
  SelectQueryBuilder,
  In,
} from "typeorm";
import { FilterOptions, PaginatedResponse } from "../common/types";
import { RedisClient } from "../common";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { AuditLogger } from "../common/monitoring/audit";
import { getRequestContext } from "../common/context/request-context";
import { NotFoundError } from "../common/errors";

export class BaseRepository<T extends ObjectLiteral> extends Repository<T> {
  private readonly redis?: RedisClient;
  cacheTTL: number = 3600;
  cachePrefix: string;

  protected auditEnabled: boolean = false;

  protected cacheEnabled: boolean = true;

  cacheKeys: any = {
    findById: (id: string | number, relations?: string[] | FindManyOptions) =>
      `findById:${id}${relations ? `:${JSON.stringify(relations)}` : "*"}`,
    findByIds: (ids: (string | number)[]) => `findByIds:${ids.join(",")}`,
    findPaginated: (options: FindManyOptions<T>, page = 1, limit = 10) =>
      `findPaginated:${JSON.stringify(options)}:${page}:${limit}`,
  };

  constructor(
    entity: EntityTarget<T>,
    dataSource: DataSource,
    redis?: RedisClient,
  ) {
    super(entity, dataSource.createEntityManager());
    this.redis = redis;
    this.cachePrefix = this.metadata.tableName;
  }

  private audit(
    action: "create" | "update" | "delete",
    resourceId?: string,
  ): void {
    if (!this.auditEnabled) return;
    try {
      const logger = AuditLogger.getInstance();
      const ctx = getRequestContext();
      const resourceType = this.metadata.targetName;
      logger.logCrud(action, resourceType, resourceId ?? "", ctx.userId).catch(() => undefined);
    } catch {
      return;
    }
  }

  private getCacheKey(key: string): string {
    return `${this.cachePrefix}:${key}`;
  }

  async getFromCache<R>(key: string): Promise<R | null> {
    if (!this.redis || !this.cacheEnabled) return null;
    try {
      const cached = await this.redis.getJSON<R>(this.getCacheKey(key));
      return cached === null ? null : this.reviveDates(cached);
    } catch {
      return null;
    }
  }

  private reviveDates<R>(value: R): R {
    const dateProps = this.metadata.columns
      .filter((c) => ["timestamptz", "timestamp", "date", Date].includes(c.type as never))
      .map((c) => c.propertyName);
    if (dateProps.length === 0) return value;

    const revive = (row: unknown) => {
      if (!row || typeof row !== "object") return;
      const record = row as Record<string, unknown>;
      for (const prop of dateProps) {
        if (typeof record[prop] === "string") record[prop] = new Date(record[prop] as string);
      }
    };
    if (Array.isArray(value)) value.forEach(revive);
    else revive(value);
    return value;
  }

  async setCache<R>(key: string, data: R): Promise<void> {
    if (!this.redis || !this.cacheEnabled) return;
    try {
      await this.redis.set(
        this.getCacheKey(key),
        JSON.stringify(data),
        this.cacheTTL,
      );
    } catch {
      return;
    }
  }

  async cache<R>(key: string, data: R): Promise<void> {
    await this.setCache(key, data);
  }

  protected getSearchFields(): string[] {
    return [];
  }

  public formatEntityForResponse(entity: T): any {
    return entity;
  }

  protected formatEntitiesForResponse(entities: T[]): any[] {
    return entities.map((entity) => this.formatEntityForResponse(entity));
  }

  formatForResponse(entity: T): any {
    return this.formatEntityForResponse(entity);
  }

  formatManyForResponse(entities: T[]): any[] {
    return this.formatEntitiesForResponse(entities);
  }

  protected getDateFields(): string[] {
    return ["createdAt"];
  }

  private parseDateFilter(
    dateFilter: string,
  ): { startDate: Date; endDate: Date } | null {
    if (!dateFilter) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilter.includes("::")) {
      const [startStr, endStr] = dateFilter.split("::");
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return null;
      }

      if (!endStr.includes("T")) {
        endDate.setHours(23, 59, 59, 999);
      }

      return { startDate, endDate };
    }

    switch (dateFilter) {
      case "today":
        return {
          startDate: new Date(today),
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        };

      case "yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          startDate: yesterday,
          endDate: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1),
        };
      }

      case "thisWeek": {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return { startDate: startOfWeek, endDate: endOfWeek };
      }

      case "lastWeek": {
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        lastWeekEnd.setHours(23, 59, 59, 999);
        return { startDate: lastWeekStart, endDate: lastWeekEnd };
      }

      case "thisMonth": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        return { startDate: startOfMonth, endDate: endOfMonth };
      }

      case "lastMonth": {
        const lastMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        lastMonthEnd.setHours(23, 59, 59, 999);
        return { startDate: lastMonthStart, endDate: lastMonthEnd };
      }

      case "thisYear": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31);
        endOfYear.setHours(23, 59, 59, 999);
        return { startDate: startOfYear, endDate: endOfYear };
      }

      case "lastYear": {
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
        lastYearEnd.setHours(23, 59, 59, 999);
        return { startDate: lastYearStart, endDate: lastYearEnd };
      }

      default:
        return null;
    }
  }

  async invalidateCache(pattern: string = "*"): Promise<void> {
    if (!this.redis || !this.cacheEnabled) return;
    try {
      await this.redis.deleteByPattern(this.getCacheKey(pattern));
    } catch {
      return;
    }
  }

  async invalidateCacheByPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.deleteByPattern(pattern);
    } catch {
      return;
    }
  }

  async bulkDeleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.createQueryBuilder()
      .delete()
      .from(this.metadata.target)
      .whereInIds(ids)
      .execute();
    await this.invalidateCache();
    return result.affected ?? 0;
  }

  async findById(
    id: string | number,
    relations?: string[],
    select?: string[],
  ): Promise<T | null> {
    const cacheKey = this.cacheKeys.findById(id, relations);

    const cached = await this.getFromCache<T>(cacheKey);

    if (cached) return cached;

    const result = await this.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
      relations: relations,
      select: select,
    });

    if (result) {
      await this.setCache(cacheKey, result);
    }

    return result || null;
  }

  async findByIds(
    ids: (string | number)[],
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    const cacheKey = this.cacheKeys.findByIds(ids);
    const cached = await this.getFromCache<T[]>(cacheKey);

    if (cached) return cached;

    const results = await this.find({
      ...options,
      where: { id: In(ids) } as unknown as FindOptionsWhere<T>,
    });

    await this.setCache(cacheKey, results);
    return results;
  }

  async findPaginated({
    options = {},
    page = 1,
    limit = 10,
    search,
    dateFilter,
    customize,
  }: FilterOptions<T> & {
    customize?: (queryBuilder: SelectQueryBuilder<T>) => void;
  }): Promise<PaginatedResponse<T>> {
    const needsQueryBuilder =
      !!customize ||
      (search && search.trim() && this.getSearchFields().length > 0) ||
      (options.where &&
        typeof options.where === "object" &&
        Object.keys(options.where).length > 0) ||
      (dateFilter && dateFilter.trim());

    if (needsQueryBuilder) {
      const queryBuilder = this.createQueryBuilder(this.getAlias());
      let hasWhereCondition = false;

      if (dateFilter && dateFilter.trim()) {
        const dateRange = this.parseDateFilter(dateFilter.trim());
        if (dateRange) {
          const dateFields = this.getDateFields();
          if (dateFields.length > 0) {
            const dateConditions: string[] = [];
            const dateParams: Record<string, any> = {};

            dateFields.forEach((field, index) => {
              const startParam = `dateStart_${index}`;
              const endParam = `dateEnd_${index}`;
              const condition = `${this.getAlias()}.${field} BETWEEN :${startParam} AND :${endParam}`;
              dateConditions.push(condition);
              dateParams[startParam] = dateRange.startDate;
              dateParams[endParam] = dateRange.endDate;
            });

            if (dateConditions.length > 0) {
              queryBuilder.where(
                `(${dateConditions.join(" OR ")})`,
                dateParams,
              );
              hasWhereCondition = true;
            }
          }
        }
      }

      if (search && search.trim()) {
        const searchFields = this.getSearchFields();
        if (searchFields.length > 0) {
          const searchConditions: string[] = [];
          const searchParams: Record<string, any> = {};

          searchFields.forEach((field, index) => {
            const paramName = `search_${index}`;
            const condition = this.getCaseInsensitiveCondition(
              field,
              paramName,
            );
            searchConditions.push(condition);
            searchParams[paramName] = `%${search.trim()}%`;
          });

          if (searchConditions.length > 0) {
            if (hasWhereCondition) {
              queryBuilder.andWhere(
                `(${searchConditions.join(" OR ")})`,
                searchParams,
              );
            } else {
              queryBuilder.where(
                `(${searchConditions.join(" OR ")})`,
                searchParams,
              );
              hasWhereCondition = true;
            }
          }
        }
      }

      if (
        options.where &&
        typeof options.where === "object" &&
        Object.keys(options.where).length > 0
      ) {
        hasWhereCondition = this.applyOptionsWhere(
          queryBuilder,
          options.where as Record<string, unknown>,
          hasWhereCondition,
        );
      }

      if (
        options.relations &&
        Array.isArray(options.relations) &&
        options.relations.length > 0
      ) {
        const rootAlias = this.getAlias();
        const relationAliasMap: Record<string, string> = {};
        const sortedRelations = (options.relations as string[]).sort((a, b) => {
          const aDepth = a.split(".").length;
          const bDepth = b.split(".").length;
          return aDepth - bDepth;
        });

        sortedRelations.forEach((relation: string) => {
          const parts = relation.split(".");
          const alias = parts[parts.length - 1];
          const joinPath = relation.includes(".")
            ? `${relationAliasMap[parts.slice(0, -1).join(".")]}.${alias}`
            : `${rootAlias}.${relation}`;
          relationAliasMap[relation] = alias;
          queryBuilder.leftJoinAndSelect(joinPath, alias);
        });
      }

      if (options.order) {
        Object.keys(options.order).forEach((key) => {
          if (!this.isSortableKey(key)) {
            this.logUnknownFilterKey(key);
            return;
          }
          queryBuilder.addOrderBy(
            `${this.getAlias()}.${key}`,
            options.order![key] as "ASC" | "DESC",
          );
        });
      }

      customize?.(queryBuilder);

      queryBuilder.skip((page - 1) * limit).take(limit);

      const [data, total] = await queryBuilder.getManyAndCount();

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      };
    } else {
      const [data, total] = await this.findAndCount({
        ...(options as FindManyOptions<T>),
        skip: (page - 1) * limit,
        take: limit,
        relations: options.relations as string[],
      });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      };
    }
  }

  override async save<E extends DeepPartial<T>>(
    entity: E,
    options?: SaveOptions,
  ): Promise<E & T> {
    const isUpdate = !!(entity as any).id;
    const result = await super.save(entity, options);
    await this.setCache(this.cacheKeys.findById(result.id), result);
    await this.invalidateCache();
    this.audit(isUpdate ? "update" : "create", String(result.id ?? ""));
    return result;
  }

  override async update(
    id: string | number,
    entity: QueryDeepPartialEntity<T>,
  ): Promise<UpdateResult> {
    const result = await super.update(id, entity);

    if (this.redis && this.cacheEnabled) {
      await this.redis.del(this.getCacheKey(this.cacheKeys.findById(id))).catch(() => undefined);
    }
    await this.invalidateCache();
    this.audit("update", String(id));
    return result;
  }

  async updateEntity(id: any, entity: Partial<T>): Promise<T | null> {
    const existingEntity = await this.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!existingEntity) {
      return null;
    }

    Object.assign(existingEntity, entity);
    return await this.save(existingEntity);
  }

  protected supportsSoftDelete(): boolean {
    return !!this.metadata.deleteDateColumn;
  }

  override async delete(
    id: string | number,
    where?: FindOptionsWhere<T>,
  ): Promise<any> {
    const entity = where
      ? await this.findOne({ where })
      : await this.findById(id);

    if (!entity) {
      throw new NotFoundError(
        where
          ? `${this.metadata.targetName} not found`
          : `${this.metadata.targetName} with id ${id} not found`,
      );
    }

    const entityId = String((entity as any).id ?? id);

    const result = this.supportsSoftDelete()
      ? await super.softRemove(entity)
      : await super.remove(entity);

    await this.invalidateCache();
    this.audit("delete", entityId);
    return result;
  }

  async saveMany<E extends DeepPartial<T>>(
    entities: E[],
    options?: SaveOptions,
  ): Promise<(E & T)[]> {
    const result = await super.save(entities, options);
    await this.invalidateCache();
    this.audit("create");
    return result;
  }

  protected getAlias(): string {
    return this.metadata.targetName.toLowerCase();
  }

  private getCaseInsensitiveCondition(
    field: string,
    paramName: string,
  ): string {
    const databaseType = this.manager.connection.options.type;

    const qualifiedField = field.includes(".")
      ? field
      : `${this.getAlias()}.${field}`;

    switch (databaseType) {
      case "postgres":
        return `${qualifiedField} ILIKE :${paramName}`;
      case "mysql":
      case "mariadb":
        return `LOWER(${qualifiedField}) LIKE LOWER(:${paramName})`;
      case "sqlite":
        return `${qualifiedField} LIKE :${paramName} COLLATE NOCASE`;
      default:
        return `LOWER(${qualifiedField}) LIKE LOWER(:${paramName})`;
    }
  }

  private isFindOperator(value: unknown): value is FindOperator<unknown> {
    return value instanceof FindOperator;
  }

  private buildFindOperatorSql(
    column: string,
    operator: FindOperator<unknown>,
    paramName: string,
  ): { condition: string; params: Record<string, unknown> } {
    const type = operator.type;
    const opValue = operator.value;

    switch (type) {
      case "in":
        if (!Array.isArray(opValue) || opValue.length === 0) {
          return { condition: "1=0", params: {} };
        }
        return {
          condition: `${column} IN (:...${paramName})`,
          params: { [paramName]: opValue },
        };
      case "not": {
        if (opValue instanceof FindOperator && opValue.type === "in") {
          return {
            condition: `${column} NOT IN (:...${paramName})`,
            params: { [paramName]: opValue.value },
          };
        }
        return {
          condition: `${column} != :${paramName}`,
          params: { [paramName]: opValue },
        };
      }
      case "lessThan":
        return {
          condition: `${column} < :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "lessThanOrEqual":
        return {
          condition: `${column} <= :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "moreThan":
        return {
          condition: `${column} > :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "moreThanOrEqual":
        return {
          condition: `${column} >= :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "between": {
        const [from, to] = opValue as [unknown, unknown];
        return {
          condition: `${column} BETWEEN :${paramName}_from AND :${paramName}_to`,
          params: {
            [`${paramName}_from`]: from,
            [`${paramName}_to`]: to,
          },
        };
      }
      case "like":
        return {
          condition: `${column} LIKE :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "ilike":
        return {
          condition: `${column} ILIKE :${paramName}`,
          params: { [paramName]: opValue },
        };
      case "isNull":
        return { condition: `${column} IS NULL`, params: {} };
      default:
        return {
          condition: `${column} = :${paramName}`,
          params: { [paramName]: opValue },
        };
    }
  }

  private addWhereClause(
    queryBuilder: SelectQueryBuilder<T>,
    condition: string,
    params: Record<string, unknown>,
    hasWhereCondition: boolean,
  ): boolean {
    if (!hasWhereCondition) {
      queryBuilder.where(condition, params);
    } else {
      queryBuilder.andWhere(condition, params);
    }
    return true;
  }

  private applyWhereEntry(
    queryBuilder: SelectQueryBuilder<T>,
    key: string,
    value: unknown,
    paramName: string,
    hasWhereCondition: boolean,
  ): boolean {
    if (value === undefined || value === null) {
      return hasWhereCondition;
    }
    if (!this.isFindOperator(value) && value === "") {
      return hasWhereCondition;
    }

    if (key.includes(".")) {
      const [jsonField, jsonProperty] = key.split(".");
      const jsonColumn = `${this.getAlias()}.${jsonField}->>'${jsonProperty}'`;

      if (this.isFindOperator(value)) {
        const { condition, params } = this.buildFindOperatorSql(
          jsonColumn,
          value,
          paramName,
        );
        return this.addWhereClause(
          queryBuilder,
          condition,
          params,
          hasWhereCondition,
        );
      }

      const isStringField = this.isStringField(jsonField);

      if (isStringField) {
        const caseInsensitiveCondition = this.getJsonCaseInsensitiveCondition(
          jsonField,
          jsonProperty,
          paramName,
        );
        return this.addWhereClause(
          queryBuilder,
          caseInsensitiveCondition,
          { [paramName]: `%${value}%` },
          hasWhereCondition,
        );
      }

      const jsonCondition = this.getJsonExactCondition(
        jsonField,
        jsonProperty,
        paramName,
      );
      return this.addWhereClause(
        queryBuilder,
        jsonCondition,
        { [paramName]: value },
        hasWhereCondition,
      );
    }

    if (this.isFindOperator(value)) {
      const { condition, params } = this.buildFindOperatorSql(
        `${this.getAlias()}.${key}`,
        value,
        paramName,
      );
      return this.addWhereClause(
        queryBuilder,
        condition,
        params,
        hasWhereCondition,
      );
    }

    const isStringField = this.isStringField(key);

    if (isStringField) {
      const caseInsensitiveCondition = this.getCaseInsensitiveCondition(
        key,
        paramName,
      );
      return this.addWhereClause(
        queryBuilder,
        caseInsensitiveCondition,
        { [paramName]: `%${value}%` },
        hasWhereCondition,
      );
    }

    return this.addWhereClause(
      queryBuilder,
      `${this.getAlias()}.${key} = :${paramName}`,
      { [paramName]: value },
      hasWhereCondition,
    );
  }

  protected isSortableKey(key: string): boolean {
    return Boolean(this.metadata.findColumnWithPropertyName(key));
  }

  protected isFilterableKey(key: string): boolean {
    const root = key.split(".")[0];
    if (!root) return false;
    if (this.metadata.findColumnWithPropertyName(root)) return true;
    if (this.metadata.findRelationWithPropertyPath(root)) return true;
    return false;
  }

  private applyOptionsWhere(
    queryBuilder: SelectQueryBuilder<T>,
    where: Record<string, unknown>,
    hasWhereCondition: boolean,
  ): boolean {
    const whereKeys = Object.keys(where);

    for (let index = 0; index < whereKeys.length; index++) {
      const key = whereKeys[index];
      const value = where[key];

      if (!this.isFilterableKey(key)) {
        this.logUnknownFilterKey(key);
        continue;
      }

      hasWhereCondition = this.applyWhereEntry(
        queryBuilder,
        key,
        value,
        `param${index}`,
        hasWhereCondition,
      );
    }

    return hasWhereCondition;
  }

  private logUnknownFilterKey(key: string): void {
    try {
      console.warn(
        `[${this.metadata.targetName}] Ignoring unknown filter "${key}" — it is not a column or relation on this entity.`,
      );
    } catch {
      return;
    }
  }

  private isStringField(fieldName: string): boolean {
    try {
      const metadata = this.metadata;
      const column = metadata.findColumnWithPropertyName(fieldName);

      if (!column) {
        return true;
      }

      const stringTypes = [
        "varchar",
        "text",
        "char",
        "string",
        "character varying",
      ];
      const columnType = String(column.type).toLowerCase();
      return stringTypes.includes(columnType);
    } catch {
      return true;
    }
  }

  private getJsonCaseInsensitiveCondition(
    jsonField: string,
    jsonProperty: string,
    paramName: string,
  ): string {
    const databaseType = this.manager.connection.options.type;

    switch (databaseType) {
      case "postgres":
        return `${this.getAlias()}.${jsonField}->>'${jsonProperty}' ILIKE :${paramName}`;
      case "mysql":
      case "mariadb":
        return `LOWER(JSON_UNQUOTE(JSON_EXTRACT(${this.getAlias()}.${jsonField}, '$.${jsonProperty}'))) LIKE LOWER(:${paramName})`;
      case "sqlite":
        return `json_extract(${this.getAlias()}.${jsonField}, '$.${jsonProperty}') LIKE :${paramName} COLLATE NOCASE`;
      default:
        return `LOWER(${this.getAlias()}.${jsonField}->>'${jsonProperty}') LIKE LOWER(:${paramName})`;
    }
  }

  private getJsonExactCondition(
    jsonField: string,
    jsonProperty: string,
    paramName: string,
  ): string {
    const databaseType = this.manager.connection.options.type;

    switch (databaseType) {
      case "postgres":
        return `${this.getAlias()}.${jsonField}->>'${jsonProperty}' = :${paramName}`;
      case "mysql":
      case "mariadb":
        return `JSON_UNQUOTE(JSON_EXTRACT(${this.getAlias()}.${jsonField}, '$.${jsonProperty}')) = :${paramName}`;
      case "sqlite":
        return `json_extract(${this.getAlias()}.${jsonField}, '$.${jsonProperty}') = :${paramName}`;
      default:
        return `${this.getAlias()}.${jsonField}->>'${jsonProperty}' = :${paramName}`;
    }
  }

  async exportData(
    options: FindManyOptions<T>,
    dateFilter?: string,
  ): Promise<T[]> {
    const hasJsonbFilters =
      options.where &&
      typeof options.where === "object" &&
      Object.keys(options.where).some((key) => key.includes("."));

    const hasDateFilter = dateFilter && dateFilter.trim();

    if (hasJsonbFilters || hasDateFilter) {
      const queryBuilder = this.createQueryBuilder(this.getAlias());
      let hasWhereCondition = false;

      if (hasDateFilter) {
        const dateRange = this.parseDateFilter(dateFilter!.trim());
        if (dateRange) {
          const dateFields = this.getDateFields();
          if (dateFields.length > 0) {
            const dateConditions: string[] = [];
            const dateParams: Record<string, any> = {};

            dateFields.forEach((field, index) => {
              const startParam = `dateStart_${index}`;
              const endParam = `dateEnd_${index}`;
              const condition = `${this.getAlias()}.${field} BETWEEN :${startParam} AND :${endParam}`;
              dateConditions.push(condition);
              dateParams[startParam] = dateRange.startDate;
              dateParams[endParam] = dateRange.endDate;
            });

            if (dateConditions.length > 0) {
              queryBuilder.where(
                `(${dateConditions.join(" OR ")})`,
                dateParams,
              );
              hasWhereCondition = true;
            }
          }
        }
      }

      if (options.where && typeof options.where === "object") {
        this.applyOptionsWhere(
          queryBuilder,
          options.where as Record<string, unknown>,
          hasWhereCondition,
        );
      }

      if (
        options.relations &&
        Array.isArray(options.relations) &&
        options.relations.length > 0
      ) {
        const rootAlias = this.getAlias();
        const relationAliasMap: Record<string, string> = {};
        const sortedRelations = (options.relations as string[]).sort((a, b) => {
          const aDepth = a.split(".").length;
          const bDepth = b.split(".").length;
          return aDepth - bDepth;
        });
        sortedRelations.forEach((relation: string) => {
          const parts = relation.split(".");
          const alias = parts[parts.length - 1];
          const joinPath = relation.includes(".")
            ? `${relationAliasMap[parts.slice(0, -1).join(".")]}.${alias}`
            : `${rootAlias}.${relation}`;
          relationAliasMap[relation] = alias;
          queryBuilder.leftJoinAndSelect(joinPath, alias);
        });
      }

      if (options.order) {
        Object.keys(options.order).forEach((key) => {
          if (!this.isSortableKey(key)) {
            this.logUnknownFilterKey(key);
            return;
          }
          queryBuilder.addOrderBy(
            `${this.getAlias()}.${key}`,
            options.order![key] as "ASC" | "DESC",
          );
        });
      }

      return await queryBuilder.getMany();
    } else {
      const data = await this.find(options);
      return data;
    }
  }
}
