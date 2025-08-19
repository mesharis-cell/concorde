import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  id: string;
  role?: 'admin' | 'user';
  eventId?: string;
  type: 'access' | 'refresh' | 'magic';
}

export class JwtService {
  static sign(payload: JwtPayload, expiresIn?: string): string {
    return jwt.sign(
      payload,
      env.JWT_SECRET,
      { 
        expiresIn: expiresIn || env.JWT_EXPIRES_IN,
        issuer: 'event-concierge',
        audience: 'event-concierge-api',
      } as any
    );
  }

  static verify(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'event-concierge',
        audience: 'event-concierge-api',
      }) as JwtPayload;
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static generateMagicLinkToken(userId: string, eventId: string): string {
    return this.sign(
      { 
        id: userId, 
        eventId, 
        role: 'user',
        type: 'magic' 
      }, 
      env.MAGIC_LINK_EXPIRES_IN
    );
  }

  static generateUserAccessToken(userId: string, eventId: string): string {
    return this.sign(
      { 
        id: userId, 
        eventId, 
        role: 'user',
        type: 'access' 
      }
    );
  }

  static generateAdminAccessToken(adminId: string): string {
    return this.sign(
      { 
        id: adminId, 
        role: 'admin',
        type: 'access' 
      }
    );
  }
}