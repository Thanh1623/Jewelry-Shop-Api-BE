import { UserRole } from '@prisma/client';

export interface JwtPayloadUser {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
}
