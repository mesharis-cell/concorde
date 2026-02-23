import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
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
  checkInBaseUrl?: string;
}

interface CheckInPayload {
  type: 'checkin';
  userId: string;
  eventId: string;
  nonce: string;
}

interface CheckInConsumeResult {
  success: boolean;
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  userId: string;
  eventId: string;
}

interface NameParts {
  fullName: string;
  firstName: string;
  lastName: string;
}

type JsonRecord = Record<string, unknown>;

interface PassKitConfig {
  apiKey: string | undefined;
  apiSecret: string | undefined;
  apiBase: string;
  productionId: string | undefined;
  templateId: string | undefined;
  issuerId: string | undefined;
  legacyBaseUrl: string;
}

interface PassKitPostOptions {
  allowNotFound?: boolean;
}

interface PassKitPostResult {
  ok: boolean;
  status: number;
  bodyText: string;
  data: unknown;
}

export class WalletService {
  private static getCheckInExpiresAt(): Date {
    return new Date(Date.now() + env.WALLET_PASS_TTL_HOURS * 60 * 60 * 1000);
  }

  private static getCheckInSignerSecret(): string {
    return env.JWT_SECRET;
  }

  private static resolveCheckInBaseUrl(checkInBaseUrl?: string): string {
    const fallback = env.APP_URL.replace(/\/$/, '');
    const candidate = (checkInBaseUrl || fallback).trim();

    try {
      return new URL(candidate).origin;
    } catch {
      return fallback;
    }
  }

  private static parsePassReferenceId(reference: string): {
    userId: string;
    eventId: string;
  } | null {
    const trimmedReference = reference.trim();
    const match = trimmedReference.match(
      /^user-([a-fA-F0-9]{24})-event-([a-fA-F0-9]{24})$/
    );

    if (!match) {
      return null;
    }

    return {
      userId: match[1],
      eventId: match[2],
    };
  }

  private static async markUserCheckedIn(
    userId: string,
    eventId: string
  ): Promise<CheckInConsumeResult> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        eventId,
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

  private static isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static extractResponseLines(text: string): unknown[] {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter((item): item is unknown => item !== null);
  }

  private static parsePassKitResponseBody(text: string): unknown {
    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      const lines = this.extractResponseLines(text);
      if (lines.length > 0) {
        return lines;
      }
      return { raw: text };
    }
  }

  private static getPassKitConfig(): PassKitConfig {
    return {
      apiKey: env.PASSKIT_API_KEY,
      apiSecret: env.PASSKIT_API_SECRET,
      apiBase: (env.PASSKIT_API_BASE || 'https://api.pub1.passkit.io').replace(
        /\/$/,
        ''
      ),
      productionId: env.PASSKIT_PRODUCTION_ID,
      templateId: env.PASSKIT_TEMPLATE_ID,
      issuerId: env.PASSKIT_ISSUER_ID,
      legacyBaseUrl: env.PASSKIT_BASE_URL.replace(/\/$/, ''),
    };
  }

  private static getAuthHeaderCandidates(
    requestUrl: string,
    method: 'POST',
    bodyString: string,
    apiKey: string,
    apiSecret?: string
  ): Array<Record<string, string>> {
    const headers: Array<Record<string, string>> = [];
    const normalizedPath = (() => {
      const url = new URL(requestUrl);
      return `${url.pathname}${url.search}`;
    })();

    if (apiSecret) {
      const now = Math.floor(Date.now() / 1000);
      const issuedAt = now - 5;
      const requestSignature = createHash('sha256')
        .update(bodyString)
        .digest('hex');

      const jwtPayload: Record<string, string | number> = {
        uid: apiKey,
        key: apiKey,
        iat: issuedAt,
        exp: now + 300,
        method,
        url: normalizedPath,
        signature: requestSignature,
      };

      const signedToken = jwt.sign(jwtPayload, apiSecret, {
        algorithm: 'HS256',
      });

      headers.push({ Authorization: signedToken });
      headers.push({ Authorization: `Bearer ${signedToken}` });
    }

    headers.push({ Authorization: `Bearer ${apiKey}` });
    headers.push({ Authorization: apiKey });

    return headers;
  }

  private static extractName(formResponses?: unknown): NameParts {
    const responses = Array.isArray(formResponses)
      ? formResponses.filter(this.isRecord)
      : [];

    const getValue = (fieldName: string): string => {
      const entry = responses.find(
        (response) => response.fieldName === fieldName
      );
      const value = entry?.value;
      return typeof value === 'string' ? value.trim() : '';
    };

    const firstName = getValue('firstName');
    const lastName = getValue('lastName');
    const fallbackName = getValue('name');
    const fullName = `${firstName} ${lastName}`.trim() || fallbackName;

    return {
      fullName,
      firstName,
      lastName,
    };
  }

  private static extractPassKitResultRows(data: unknown): JsonRecord[] {
    const rows: JsonRecord[] = [];

    const pushIfRecord = (value: unknown): void => {
      if (this.isRecord(value)) {
        rows.push(value);
      }
    };

    if (Array.isArray(data)) {
      for (const item of data) {
        if (this.isRecord(item) && this.isRecord(item.result)) {
          rows.push(item.result);
        } else {
          pushIfRecord(item);
        }
      }
      return rows;
    }

    if (this.isRecord(data) && this.isRecord(data.result)) {
      rows.push(data.result);
      return rows;
    }

    pushIfRecord(data);
    return rows;
  }

  private static extractGoogleWalletUrl(data: unknown): string | null {
    const records = this.extractPassKitResultRows(data);

    for (const record of records) {
      const directKeys = [
        'googleWalletUrl',
        'google_wallet_url',
        'googlePayURL',
        'url',
      ] as const;

      for (const key of directKeys) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate;
        }
      }

      const passes = record.passes;
      if (Array.isArray(passes)) {
        for (const pass of passes) {
          if (!this.isRecord(pass)) continue;
          const candidate =
            pass.googlePayURL ||
            pass.googleWalletUrl ||
            pass.google_wallet_url ||
            pass.url;
          if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate;
          }
        }
      }

      if (this.isRecord(record.links)) {
        const linksCandidate = record.links.googleWallet;
        if (
          typeof linksCandidate === 'string' &&
          linksCandidate.trim().length > 0
        ) {
          return linksCandidate;
        }
      }

      if (this.isRecord(record.googleWallet)) {
        const walletCandidate = record.googleWallet.url;
        if (
          typeof walletCandidate === 'string' &&
          walletCandidate.trim().length > 0
        ) {
          return walletCandidate;
        }
      }
    }

    return null;
  }

  private static extractPassKitId(data: unknown): string | null {
    const records = this.extractPassKitResultRows(data);
    for (const record of records) {
      const candidate = record.id || record.passReferenceId;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return null;
  }

  private static extractStreamFirstId(data: unknown): string | null {
    const rows = this.extractPassKitResultRows(data);
    for (const row of rows) {
      if (typeof row.id === 'string' && row.id.trim().length > 0) {
        return row.id;
      }
    }
    return null;
  }

  private static async passKitPost(
    requestUrl: string,
    body: Record<string, unknown>,
    apiKey: string,
    apiSecret?: string,
    options: PassKitPostOptions = {}
  ): Promise<PassKitPostResult> {
    const bodyString = JSON.stringify(body);
    const authHeaders = this.getAuthHeaderCandidates(
      requestUrl,
      'POST',
      bodyString,
      apiKey,
      apiSecret
    );
    const errors: string[] = [];

    for (const authHeader of authHeaders) {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...authHeader,
        },
        body: bodyString,
      });

      const bodyText = await response.text();
      const parsed = this.parsePassKitResponseBody(bodyText);

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          bodyText,
          data: parsed,
        };
      }

      if (options.allowNotFound && response.status === 404) {
        return {
          ok: false,
          status: response.status,
          bodyText,
          data: parsed,
        };
      }

      const headerLabel = authHeader.Authorization.startsWith('PKAuth')
        ? 'PKAuth'
        : authHeader.Authorization.startsWith('Bearer')
          ? 'Bearer'
          : 'Raw';
      errors.push(`${headerLabel} -> ${response.status}: ${bodyText}`);

      if (response.status !== 401 && response.status !== 403) {
        throw new Error(
          `PassKit request failed (${response.status}): ${bodyText}`
        );
      }
    }

    throw new Error(
      `PassKit authorization failed after all auth strategies: ${errors.join(
        ' | '
      )}`
    );
  }

  private static async createLegacyTemplatePass(
    config: PassKitConfig,
    input: WalletRequestInput,
    passReferenceId: string,
    expiresAt: string
  ): Promise<{ googleWalletUrl: string; passReferenceId: string; expiresAt: string }> {
    if (!config.apiKey || !config.templateId || !config.issuerId) {
      throw new Error(
        'Legacy PassKit flow requires PASSKIT_API_KEY, PASSKIT_TEMPLATE_ID, PASSKIT_ISSUER_ID.'
      );
    }

    const requestUrl = `${config.legacyBaseUrl}/passes`;
    const nameParts = this.extractName(input.formResponses);
    const payload = {
      templateId: config.templateId,
      issuerId: config.issuerId,
      externalId: passReferenceId,
      person: {
        email: input.email,
        fullName: nameParts.fullName,
      },
      metadata: {
        eventId: input.eventId,
        userId: input.userId,
      },
      validUntil: expiresAt,
    };

    const response = await this.passKitPost(
      requestUrl,
      payload,
      config.apiKey,
      config.apiSecret
    );

    const googleWalletUrl = this.extractGoogleWalletUrl(response.data);
    if (!googleWalletUrl) {
      throw new Error('PassKit legacy response missing Google Wallet URL');
    }

    return {
      googleWalletUrl,
      passReferenceId: this.extractPassKitId(response.data) || passReferenceId,
      expiresAt,
    };
  }

  private static async resolveEventTicketTypeId(
    config: PassKitConfig
  ): Promise<string> {
    if (!config.apiKey || !config.productionId) {
      throw new Error(
        'PASSKIT_API_KEY and PASSKIT_PRODUCTION_ID are required for ticket type resolution.'
      );
    }

    const requestUrl = `${config.apiBase}/eventTickets/ticketTypes/${config.productionId}`;
    const response = await this.passKitPost(
      requestUrl,
      {},
      config.apiKey,
      config.apiSecret
    );

    const ticketTypeId = this.extractStreamFirstId(response.data);
    if (!ticketTypeId) {
      throw new Error(
        'PassKit did not return any ticket type for the configured production.'
      );
    }
    return ticketTypeId;
  }

  private static async resolveEventId(config: PassKitConfig): Promise<string> {
    if (!config.apiKey || !config.productionId) {
      throw new Error(
        'PASSKIT_API_KEY and PASSKIT_PRODUCTION_ID are required for event resolution.'
      );
    }

    const requestUrl = `${config.apiBase}/eventTickets/events/list`;
    const response = await this.passKitPost(
      requestUrl,
      { productionId: config.productionId },
      config.apiKey,
      config.apiSecret
    );

    const eventId = this.extractStreamFirstId(response.data);
    if (!eventId) {
      throw new Error(
        'PassKit did not return any event for the configured production.'
      );
    }
    return eventId;
  }

  private static async createOrGetEventTicketPass(
    config: PassKitConfig,
    input: WalletRequestInput,
    passReferenceId: string,
    expiresAt: string
  ): Promise<{ googleWalletUrl: string; passReferenceId: string; expiresAt: string }> {
    if (!config.apiKey || !config.productionId) {
      throw new Error(
        'PASSKIT_API_KEY and PASSKIT_PRODUCTION_ID are required for Event Tickets integration.'
      );
    }

    const passRequestBody: Record<string, unknown> = {
      ticketNumber: {
        productionId: config.productionId,
        ticketNumber: passReferenceId,
      },
      format: ['GOOGLE_URL'],
    };

    const passRequestUrl = `${config.apiBase}/eventTickets/pass`;
    const passLookup = await this.passKitPost(
      passRequestUrl,
      passRequestBody,
      config.apiKey,
      config.apiSecret,
      { allowNotFound: true }
    );

    const existingGoogleWalletUrl = this.extractGoogleWalletUrl(passLookup.data);
    if (existingGoogleWalletUrl) {
      return {
        googleWalletUrl: existingGoogleWalletUrl,
        passReferenceId,
        expiresAt,
      };
    }

    if (passLookup.status !== 404) {
      throw new Error(
        `PassKit pass lookup did not return a usable Google Wallet URL: ${passLookup.bodyText}`
      );
    }

    const ticketTypeId = await this.resolveEventTicketTypeId(config);
    const eventId = await this.resolveEventId(config);
    const nameParts = this.extractName(input.formResponses);

    const issueTicketRequestUrl = `${config.apiBase}/eventTickets/ticket`;
    const issueTicketBody: Record<string, unknown> = {
      eventId,
      ticketTypeId,
      ticketNumber: passReferenceId,
      orderNumber: passReferenceId,
      person: {
        forename: nameParts.firstName,
        surname: nameParts.lastName,
        displayName: nameParts.fullName || input.email,
        emailAddress: input.email,
      },
      metaData: {
        localEventId: input.eventId,
        localUserId: input.userId,
      },
      expiryDate: expiresAt,
    };

    await this.passKitPost(
      issueTicketRequestUrl,
      issueTicketBody,
      config.apiKey,
      config.apiSecret
    );

    const postIssueLookup = await this.passKitPost(
      passRequestUrl,
      passRequestBody,
      config.apiKey,
      config.apiSecret
    );

    const googleWalletUrl = this.extractGoogleWalletUrl(postIssueLookup.data);
    if (!googleWalletUrl) {
      throw new Error(
        'PassKit ticket issued but Google Wallet URL was not returned.'
      );
    }

    return {
      googleWalletUrl,
      passReferenceId,
      expiresAt,
    };
  }

  // [V1/V2] PassKit-backed wallet pass generation service.
  static async getOrCreateWalletPass(input: WalletRequestInput): Promise<{
    googleWalletUrl: string;
    passReferenceId: string;
    expiresAt: string;
  }> {
    const passReferenceId = `user-${input.userId}-event-${input.eventId}`;
    const expiresAt = this.getCheckInExpiresAt().toISOString();
    const passKitConfig = this.getPassKitConfig();

    const hasLegacyConfig = Boolean(
      passKitConfig.apiKey &&
        passKitConfig.templateId &&
        passKitConfig.issuerId
    );
    const hasEventTicketConfig = Boolean(
      passKitConfig.apiKey &&
        passKitConfig.productionId &&
        passKitConfig.apiBase
    );

    if (hasLegacyConfig) {
      return this.createLegacyTemplatePass(
        passKitConfig,
        input,
        passReferenceId,
        expiresAt
      );
    }

    if (hasEventTicketConfig) {
      return this.createOrGetEventTicketPass(
        passKitConfig,
        input,
        passReferenceId,
        expiresAt
      );
    }

    throw new Error(
      'PassKit credentials are missing. Configure either legacy PASSKIT_TEMPLATE_ID/PASSKIT_ISSUER_ID or Event Tickets PASSKIT_PRODUCTION_ID credentials.'
    );
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
      nonce: randomUUID(),
    };

    const token = jwt.sign(payload, this.getCheckInSignerSecret(), {
      expiresIn: `${env.WALLET_PASS_TTL_HOURS}h`,
      issuer: 'savvio-concorde-checkin',
      audience: 'savvio-concorde-demo',
    });

    const checkInBaseUrl = this.resolveCheckInBaseUrl(input.checkInBaseUrl);
    const qrPayloadUrl = `${checkInBaseUrl}/api/v1/public/check-in/consume?token=${encodeURIComponent(token)}`;

    return {
      qrPayloadUrl,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  static async consumeCheckInToken(token: string): Promise<CheckInConsumeResult> {
    const payload = jwt.verify(token, this.getCheckInSignerSecret(), {
      issuer: 'savvio-concorde-checkin',
      audience: 'savvio-concorde-demo',
    }) as CheckInPayload;

    if (payload.type !== 'checkin') {
      throw new Error('Invalid check-in payload type');
    }

    return this.markUserCheckedIn(payload.userId, payload.eventId);
  }

  static async consumeCheckInReference(
    reference: string
  ): Promise<CheckInConsumeResult> {
    const parsedReference = this.parsePassReferenceId(reference);
    if (!parsedReference) {
      throw new Error('Invalid check-in pass reference');
    }

    return this.markUserCheckedIn(
      parsedReference.userId,
      parsedReference.eventId
    );
  }
}
