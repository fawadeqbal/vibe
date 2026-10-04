import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Opt a route out of the global JWT guard. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
