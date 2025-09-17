import { prisma } from '../config/database.js';
import { EmailService } from './email.js';
import { JwtService } from '../utils/jwt.js';

export interface OTPRequest {
  userId: string;
  eventId: string;
  userEmail: string;
  channel: 'email' | 'sms';
}

export interface OTPValidation {
  otpId: string;
  otpCode: string;
}

export interface OTPResult {
  success: boolean;
  otpId?: string;
  message?: string;
  error?: string;
  retryAfter?: number; // seconds until user can retry
}

export interface ValidationResult {
  success: boolean;
  token?: string;
  userData?: any;
  error?: string;
  attemptsRemaining?: number;
}

interface ChannelProvider {
  send(userEmail: string, otpCode: string, eventId: string): Promise<{ success: boolean; error?: string }>;
}

class EmailChannelProvider implements ChannelProvider {
  async send(userEmail: string, otpCode: string, eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get event details for branding
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { name: true, shortName: true }
      });

      const eventName = event?.name || 'Event';
      
      const result = await EmailService.sendEmail(
        userEmail,
        {
          subject: `Your ${eventName} verification code: ${otpCode}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Your Verification Code</h2>
              <p>Hello,</p>
              <p>Your verification code for ${eventName} is:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; margin: 20px 0;">
                ${otpCode}
              </div>
              <p><strong>This code will expire in 10 minutes.</strong></p>
              <p>If you didn't request this code, please ignore this email.</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
            </div>
          `,
        }
      );

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

class SMSChannelProvider implements ChannelProvider {
  async send(userEmail: string, otpCode: string, eventId: string): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement SMS provider (Twilio, AWS SNS, etc.)
    // For now, return not implemented
    return { 
      success: false, 
      error: 'SMS channel not implemented yet. Please use email for now.' 
    };
  }
}

export class OTPService {
  private static channelProviders: Record<string, ChannelProvider> = {
    email: new EmailChannelProvider(),
    sms: new SMSChannelProvider(),
  };

  /**
   * Generate a 4-digit OTP code
   */
  private static generateOTPCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Check rate limiting for OTP requests
   * Max 3 requests in 5 minutes per email
   */
  private static async checkRateLimit(userEmail: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const recentOTPs = await prisma.userOTP.count({
      where: {
        userEmail,
        createdAt: { gte: fiveMinutesAgo }
      }
    });

    if (recentOTPs >= 3) {
      // Find the oldest OTP in the window to calculate retry time
      const oldestOTP = await prisma.userOTP.findFirst({
        where: {
          userEmail,
          createdAt: { gte: fiveMinutesAgo }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (oldestOTP) {
        const retryAfter = Math.ceil((oldestOTP.createdAt.getTime() + 5 * 60 * 1000 - Date.now()) / 1000);
        return { allowed: false, retryAfter: Math.max(0, retryAfter) };
      }
    }

    return { allowed: true };
  }

  /**
   * Clean up expired OTPs (called before creating new ones)
   */
  private static async cleanupExpiredOTPs(): Promise<void> {
    await prisma.userOTP.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });
  }

  /**
   * Request OTP - generates and sends OTP via specified channel
   */
  static async requestOTP(request: OTPRequest): Promise<OTPResult> {
    try {
      // Clean up expired OTPs first
      await this.cleanupExpiredOTPs();

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(request.userEmail);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: 'Too many OTP requests. Please try again later.',
          retryAfter: rateLimitCheck.retryAfter
        };
      }

      // Validate channel
      const channelProvider = this.channelProviders[request.channel];
      if (!channelProvider) {
        return {
          success: false,
          error: `Unsupported channel: ${request.channel}`
        };
      }

      // Generate OTP code
      const otpCode = this.generateOTPCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Create OTP record
      const otpRecord = await prisma.userOTP.create({
        data: {
          userId: request.userId,
          eventId: request.eventId,
          userEmail: request.userEmail,
          channel: request.channel,
          otpCode,
          expiresAt
        }
      });

      // Send OTP via channel
      const sendResult = await channelProvider.send(request.userEmail, otpCode, request.eventId);
      
      if (!sendResult.success) {
        // Clean up the OTP record if sending failed
        await prisma.userOTP.delete({ where: { id: otpRecord.id } });
        return {
          success: false,
          error: sendResult.error || 'Failed to send OTP'
        };
      }

      return {
        success: true,
        otpId: otpRecord.id,
        message: `OTP sent via ${request.channel}`
      };

    } catch (error: any) {
      console.error('OTP request failed:', error);
      return {
        success: false,
        error: 'Failed to process OTP request'
      };
    }
  }

  /**
   * Validate OTP and return JWT token
   */
  static async validateOTP(validation: OTPValidation): Promise<ValidationResult> {
    try {
      // Find the OTP record
      const otpRecord = await prisma.userOTP.findUnique({
        where: { id: validation.otpId },
        include: {
          user: {
            include: {
              event: true,
            }
          }
        }
      });

      if (!otpRecord) {
        return {
          success: false,
          error: 'Invalid OTP ID'
        };
      }

      // Check if already verified
      if (otpRecord.verified) {
        return {
          success: false,
          error: 'OTP already used'
        };
      }

      // Check if expired
      if (otpRecord.expiresAt < new Date()) {
        return {
          success: false,
          error: 'OTP expired'
        };
      }

      // Check attempts (max 3 attempts per OTP)
      if (otpRecord.attempts >= 3) {
        return {
          success: false,
          error: 'Too many failed attempts'
        };
      }

      // Validate OTP code
      if (otpRecord.otpCode !== validation.otpCode) {
        // Increment attempts
        await prisma.userOTP.update({
          where: { id: validation.otpId },
          data: { attempts: otpRecord.attempts + 1 }
        });

        const attemptsRemaining = 3 - (otpRecord.attempts + 1);
        return {
          success: false,
          error: 'Invalid OTP code',
          attemptsRemaining
        };
      }

      // Mark OTP as verified
      await prisma.userOTP.update({
        where: { id: validation.otpId },
        data: { 
          verified: true,
          verifiedAt: new Date()
        }
      });

      // Update user's last login
      await prisma.user.update({
        where: { id: otpRecord.userId },
        data: { lastLoginAt: new Date() }
      });

      // Generate 7-day JWT token
      const token = JwtService.generateGuestAccessToken(otpRecord.userId, otpRecord.eventId);

      // Prepare user data for response
      const userData = {
        id: otpRecord.user.id,
        eventId: otpRecord.user.eventId,
        profile: otpRecord.user.profile,
        communication: otpRecord.user.communication,
        assigned: otpRecord.user.assigned,
        groupId: otpRecord.user.groupId,
        group: otpRecord.user.group,
        flight: otpRecord.user.flight,
        accommodation: otpRecord.user.accommodation,
        requirements: otpRecord.user.requirements,
        merchandiseSize: otpRecord.user.merchandiseSize,
        emergencyContact: otpRecord.user.emergencyContact,
        event: {
          id: otpRecord.user.event.id,
          name: otpRecord.user.event.name,
          shortName: otpRecord.user.event.shortName
        }
      };

      return {
        success: true,
        token,
        userData
      };

    } catch (error: any) {
      console.error('OTP validation failed:', error);
      return {
        success: false,
        error: 'Failed to validate OTP'
      };
    }
  }

  /**
   * Add a new channel provider (for extensibility)
   */
  static addChannelProvider(channel: string, provider: ChannelProvider): void {
    this.channelProviders[channel] = provider;
  }

  /**
   * Get supported channels
   */
  static getSupportedChannels(): string[] {
    return Object.keys(this.channelProviders);
  }

  /**
   * Clean up old OTP records (call this periodically)
   */
  static async cleanupOldOTPs(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    await prisma.userOTP.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } }, // Expired
          { verified: true, verifiedAt: { lt: oneDayAgo } }, // Verified and old
          { createdAt: { lt: oneDayAgo } } // Very old
        ]
      }
    });
  }
}