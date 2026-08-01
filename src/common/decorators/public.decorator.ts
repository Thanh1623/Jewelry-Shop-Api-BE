import { SetMetadata } from '@nestjs/common';

/**
 * Decorator để đánh dấu endpoint là public
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
