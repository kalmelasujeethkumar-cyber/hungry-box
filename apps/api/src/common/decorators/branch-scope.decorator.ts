import { SetMetadata } from '@nestjs/common';

export const BRANCH_SCOPE_KEY = 'branchScopeParam';

export const BranchScope = (param: string) => SetMetadata(BRANCH_SCOPE_KEY, param);
