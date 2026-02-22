import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

interface WalletRequestInput {
  userId: string;
  eventId: string;
  email: string;
  formResponses?: unknown;
}

interface CheckInQrInput {
  userId: string;
  eventId: string;
}

interface CheckInPayload {
  type: 'checkin';
  userId: string;
  eventId: string;
  nonce: string;
}

export class WalletService {
  private static getCheckInExpiresAt(): Date {
    return new Date(Date.now() + env.WALLET_PASS_TTL_HOURS * 60 * 60 * 1000);
  }

  private static getCheckInSignerSecret(): string {
    return env.JWT_SECRET;
  }

  private static extractName(formResponses?: unknown): string {
    const responses = Array.isArray(formResponses) ? formResponses : [];
    const firstName = responses.find((entry: any) => entry?.fieldName === 'firstName')?.value || '';
    const lastName = responses.find((entry: any) => entry?.fieldName === 'lastName')?.value || '';
    return `${firstName} ${lastName}`.trim();
  }

  // [V1] PassKit-backed wallet pass generation service (Task 2.6.2).
  static async getOrCreateWalletPass(input: WalletRequestInput): Promise<{
    googleWalletUrl: string;
    passReferenceId: string;
    expiresAt: string;
  }> {
    const passReferenceId = `user-${input.userId}-event-${input.eventId}`;
    const expiresAt = this.getCheckInExpiresAt().toISOString();

    const hasPasskitConfig =
      Boolean(env.PASSKIT_API_KEY) &&
      Boolean(env.PASSKIT_TEMPLATE_ID) &&
      Boolean(env.PASSKIT_ISSUER_ID);

    if (!hasPasskitConfig) {
      if (!env.DEMO_MODE) {
        throw new Error('PassKit credentials are missing. Configure PASSKIT_* env vars.');
      }

      // [V1] Deterministic demo fallback URL when PassKit trial credentials are not yet configured.
      return {
        googleWalletUrl: `${env.APP_URL.replace(/\/$/, '')}/wallet-demo/${passReferenceId}`,
        passReferenceId,
        expiresAt,
      };
    }

    const passkitEndpoint = `${env.PASSKIT_BASE_URL.replace(/\/$/, '')}/passes`;
    const payload = {
      templateId: env.PASSKIT_TEMPLATE_ID,
      issuerId: env.PASSKIT_ISSUER_ID,
      externalId: passReferenceId,
      person: {
        email: input.email,
        fullName: this.extractName(input.formResponses),
      },
      metadata: {
        eventId: input.eventId,
        userId: input.userId,
      },
      validUntil: expiresAt,
    };

    const response = await fetch(passkitEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PASSKIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`PassKit request failed (${response.status}): ${responseBody}`);
    }

    const body = (await response.json()) as any;
    const googleWalletUrl =
      body?.googleWalletUrl ||
      body?.google_wallet_url ||
      body?.links?.googleWallet ||
      body?.googleWallet?.url;

    if (!googleWalletUrl) {
      throw new Error('PassKit response missing Google Wallet URL');
    }

    return {
      googleWalletUrl,
      passReferenceId: body?.passReferenceId || body?.id || passReferenceId,
      expiresAt: body?.expiresAt || expiresAt,
    };
  }

  static async generateCheckInQr(input: CheckInQrInput): Promise<{
    qrPayloadUrl: string;
    token: string;
    expiresAt: string;
  }> {
    const expiresAt = this.getCheckInExpiresAt();
    const payload: CheckInPayload = {
      type: 'checkin',
      userId: input.userId,
      eventId: input.eventId,
      nonce: crypto.randomUUID(),
    };

    const token = jwt.sign(payload, this.getCheckInSignerSecret(), {
      expiresIn: `${env.WALLET_PASS_TTL_HOURS}h`,
      issuer: 'savvio-concorde-checkin',
      audience: 'savvio-concorde-demo',
    });

    const qrPayloadUrl = `${env.APP_URL.replace(/\/$/, '')}/api/v1/public/check-in/consume?token=${encodeURIComponent(token)}`;

    return {
      qrPayloadUrl,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  static async consumeCheckInToken(token: string): Promise<{
    success: boolean;
    alreadyCheckedIn: boolean;
    checkedInAt: string;
    userId: string;
    eventId: string;
  }> {
    const payload = jwt.verify(token, this.getCheckInSignerSecret(), {
      issuer: 'savvio-concorde-checkin',
      audience: 'savvio-concorde-demo',
    }) as CheckInPayload;

    if (payload.type !== 'checkin') {
      throw new Error('Invalid check-in payload type');
    }

    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        eventId: payload.eventId,
        active: true,
      },
      select: {
        id: true,
        eventId: true,
        checkedIn: true,
        checkedInAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found for check-in payload');
    }

    if (user.checkedIn) {
      return {
        success: true,
        alreadyCheckedIn: true,
        checkedInAt: (user.checkedInAt || new Date()).toISOString(),
        userId: user.id,
        eventId: user.eventId,
      };
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        checkedIn: true,
        checkedInAt: now,
      },
    });

    return {
      success: true,
      alreadyCheckedIn: false,
      checkedInAt: now.toISOString(),
      userId: user.id,
      eventId: user.eventId,
    };
  }
}
