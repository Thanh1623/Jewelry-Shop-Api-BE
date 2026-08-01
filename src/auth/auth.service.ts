import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PUBLIC_REGISTER_ROLE, RegisterDto } from './dto/register.dto';
import {
  AuthResponse,
  AuthUserResponse,
  mapUserToAuthResponse,
} from './mappers/auth-response.mapper';

const BCRYPT_ROUNDS = 12;

/** Auth + demo seed for shop users */

interface DemoUserSeed {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
}

const DEMO_USERS: DemoUserSeed[] = [
  {
    email: 'sale@jewelry.local',
    password: 'Sale123456!',
    fullName: 'Nhân viên bán hàng',
    role: UserRole.SALE,
  },
  {
    email: 'customer@jewelry.local',
    password: 'Customer123456!',
    fullName: 'Khách hàng demo',
    phone: '0901234567',
    role: UserRole.CUSTOMER,
  },
];

const authUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
} as const;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.configService.get<string>('SEED_DEMO') !== 'true') {
      return;
    }
    await this.seedDemoUsers();
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng.');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone?.trim() || null,
        role: PUBLIC_REGISTER_ROLE,
      },
      select: authUserSelect,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...authUserSelect, passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return this.buildAuthResponse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    });
  }

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại.');
    }
    return mapUserToAuthResponse(user);
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: UserRole;
  }): AuthResponse {
    const payload: JwtPayloadUser = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: mapUserToAuthResponse(user),
    };
  }

  private async seedDemoUsers(): Promise<void> {
    for (const demoUser of DEMO_USERS) {
      const existing = await this.prisma.user.findUnique({
        where: { email: demoUser.email },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      const passwordHash = await bcrypt.hash(demoUser.password, BCRYPT_ROUNDS);
      await this.prisma.user.create({
        data: {
          email: demoUser.email,
          passwordHash,
          fullName: demoUser.fullName,
          phone: demoUser.phone ?? null,
          role: demoUser.role,
        },
      });
      this.logger.log(`Seeded demo user: ${demoUser.email}`);
    }
  }
}
