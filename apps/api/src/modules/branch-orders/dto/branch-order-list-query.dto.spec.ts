import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  BRANCH_ORDER_MAX_LIMIT,
  BranchOrderListQueryDto,
} from './branch-order-list-query.dto';

/**
 * These tests exercise the DTO the way a real request does - a raw query string put through
 * `plainToInstance` and then validated. Calling the service with real numbers cannot catch
 * a missing transform, because that is the only path a production request never takes.
 */
function validate(query: Record<string, unknown>): string[] {
  const dto = plainToInstance(BranchOrderListQueryDto, query);
  return validateSync(dto).map((error) => error.property);
}

describe('BranchOrderListQueryDto', () => {
  it('accepts page and limit sent as query strings', () => {
    /**
     * Regression: the DTO declared @IsInt() with no @Transform. The global ValidationPipe
     * runs with `transform: true` but without implicit conversion, so "2" never became 2
     * and every real paginated branch-order request was rejected with 400 - while the
     * service unit tests kept passing because they were handed actual numbers.
     */
    expect(validate({ page: '2', limit: '25' })).toEqual([]);

    const dto = plainToInstance(BranchOrderListQueryDto, { page: '2', limit: '25' });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
  });

  it('defaults both to undefined when omitted or blank', () => {
    const omitted = plainToInstance(BranchOrderListQueryDto, {});
    expect(omitted.page).toBeUndefined();
    expect(omitted.limit).toBeUndefined();

    /** An empty query value must not become 0, which @Min(1) would then reject. */
    const blank = plainToInstance(BranchOrderListQueryDto, { page: '', limit: '' });
    expect(blank.page).toBeUndefined();
    expect(blank.limit).toBeUndefined();
    expect(validate({ page: '', limit: '' })).toEqual([]);
  });

  it('rejects a non-numeric page or limit', () => {
    expect(validate({ page: 'abc' })).toContain('page');
    expect(validate({ limit: 'ten' })).toContain('limit');
  });

  it('rejects a page below one and a limit above the cap', () => {
    expect(validate({ page: '0' })).toContain('page');
    expect(validate({ limit: String(BRANCH_ORDER_MAX_LIMIT + 1) })).toContain('limit');
  });

  it('still rejects an unknown status', () => {
    expect(validate({ status: 'NOT_A_STATUS' })).toContain('status');
  });
});
