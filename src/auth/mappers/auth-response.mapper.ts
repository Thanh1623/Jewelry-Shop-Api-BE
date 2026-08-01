import { UserRole } from '@prisma/client';

export interface AuthUserResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUserResponse;
}

export function mapUserToAuthResponse(user: {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
}): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone ?? null,
    role: user.role,
  };
}
