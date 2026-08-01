import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushSubscription, UserRole } from '@prisma/client';
import * as webpush from 'web-push';

import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

function decodeUrlBase64Length(value: string): number {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').length;
}

export interface SalePushPayload {
  title: string;
  body: string;
  sessionId?: string;
  kind?: 'customer_message' | 'craftsman_reply' | 'new_session';
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey?: string;
  private readonly vapidConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>(
      'VAPID_SUBJECT',
      'mailto:demo@jewelry.local',
    );

    this.vapidPublicKey = publicKey;
    this.vapidConfigured = Boolean(publicKey && privateKey);

    if (this.vapidConfigured) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn('VAPID keys are not configured — web push is disabled.');
    }
  }

  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.vapidPublicKey ?? '' };
  }

  subscribe(
    userId: string,
    dto: SubscribeDto,
  ): Promise<Pick<PushSubscription, 'id' | 'endpoint' | 'createdAt'>> {
    const p256dhBytes = decodeUrlBase64Length(dto.keys.p256dh);
    const authBytes = decodeUrlBase64Length(dto.keys.auth);
    if (p256dhBytes !== 65 || authBytes !== 16) {
      throw new BadRequestException(
        `Push keys không hợp lệ (p256dh=${p256dhBytes}B, auth=${authBytes}B). Bật lại thông báo trên trình duyệt.`,
      );
    }

    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      select: { id: true, endpoint: true, createdAt: true },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /** Notify all SALE staff who subscribed to web push. */
  async notifySales(payload: SalePushPayload): Promise<void> {
    if (!this.vapidConfigured) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { user: { role: UserRole.SALE } },
    });
    if (subscriptions.length === 0) {
      return;
    }

    const body = JSON.stringify(payload);
    await Promise.all(
      subscriptions.map((subscription) => this.sendAndPrune(subscription, body)),
    );
  }

  private async sendAndPrune(
    subscription: PushSubscription,
    payload: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    } catch (error) {
      const statusCode =
        error instanceof webpush.WebPushError ? error.statusCode : undefined;
      const message = (error as Error).message;
      this.logger.warn(
        `Push failed for subscription ${subscription.id}: ${message}`,
      );
      const shouldPrune =
        statusCode === 404 ||
        statusCode === 410 ||
        /p256dh|auth/i.test(message);
      if (shouldPrune) {
        await this.prisma.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => undefined);
      }
    }
  }
}
