import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../types/auth-user';

/** `@CurrentUser() me: AuthUser` (or `@CurrentUser('id') userId: string`). */
export const CurrentUser = createParamDecorator((field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const user = ctx.getType() === 'ws' ? ctx.switchToWs().getClient().data?.user : ctx.switchToHttp().getRequest().user;
  return field ? user?.[field] : user;
});
