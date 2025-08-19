import twilio from 'twilio';
import { env } from '../config/env.js';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  static async sendTemplate(
    to: string,
    templateName: string,
    variables: Record<string, string> = {}
  ): Promise<WhatsAppResult> {
    try {
      // Ensure the phone number is in international format
      const phoneNumber = to.startsWith('+') ? to : `+${to}`;
      
      const message = await client.messages.create({
        from: env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${phoneNumber}`,
        contentSid: templateName,
        contentVariables: JSON.stringify(variables),
      });

      return {
        success: true,
        messageId: message.sid,
      };
    } catch (error: any) {
      console.error('Failed to send WhatsApp message:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async sendWelcomeMessage(
    phoneNumber: string,
    variables: {
      firstName: string;
      eventName: string;
    }
  ): Promise<WhatsAppResult> {
    // Template: welcome_template
    // Variables: firstName, eventName
    return this.sendTemplate(phoneNumber, 'welcome_template', variables);
  }

  static async sendGroupAssignmentMessage(
    phoneNumber: string,
    variables: {
      firstName: string;
      eventName: string;
      groupName: string;
      itineraryLink: string;
    }
  ): Promise<WhatsAppResult> {
    // Template: assignment_ready_template  
    // Variables: firstName, eventName, groupName, itineraryLink
    return this.sendTemplate(phoneNumber, 'assignment_ready_template', variables);
  }

  static async sendActivityUpdateMessage(
    phoneNumber: string,
    variables: {
      firstName: string;
      activityTitle: string;
      updateDetails: string;
      itineraryLink: string;
    }
  ): Promise<WhatsAppResult> {
    // Template: activity_update_template
    // Variables: firstName, activityTitle, updateDetails, itineraryLink
    return this.sendTemplate(phoneNumber, 'activity_update_template', variables);
  }

  static async sendAnnouncementMessage(
    phoneNumber: string,
    variables: {
      firstName: string;
      eventName: string;
      announcementText: string;
    }
  ): Promise<WhatsAppResult> {
    // Template: announcement_template
    // Variables: firstName, eventName, announcementText
    return this.sendTemplate(phoneNumber, 'announcement_template', variables);
  }

  // Helper method to validate phone number format
  static validatePhoneNumber(phoneNumber: string): boolean {
    // Basic international phone number validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  // Helper method to format phone number
  static formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Add + if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  // Method to check if a template exists (useful for validation)
  static async validateTemplate(templateName: string): Promise<boolean> {
    try {
      // This would typically involve checking with Twilio's API
      // For now, we'll assume templates exist if they match our expected names
      const validTemplates = [
        'welcome_template',
        'assignment_ready_template', 
        'activity_update_template',
        'announcement_template'
      ];
      
      return validTemplates.includes(templateName);
    } catch (error) {
      return false;
    }
  }
}