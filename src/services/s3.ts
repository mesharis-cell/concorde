import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface PresignedUrlResult {
  success: boolean;
  uploadUrl?: string;
  fileUrl?: string;
  key?: string;
  error?: string;
}

export class S3Service {
  private static readonly BUCKET = env.AWS_S3_BUCKET;
  private static readonly CDN_URL = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`;

  static async uploadFile(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = 'uploads'
  ): Promise<UploadResult> {
    try {
      const key = `${folder}/${uuidv4()}-${fileName}`;
      
      const command = new PutObjectCommand({
        Bucket: this.BUCKET,
        Key: key,
        Body: file,
        ContentType: contentType,
        ACL: 'public-read',
      });

      await s3Client.send(command);

      const url = `${this.CDN_URL}/${key}`;

      return {
        success: true,
        url,
        key,
      };
    } catch (error: any) {
      console.error('Failed to upload file to S3:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async uploadActivityImage(
    file: Buffer,
    fileName: string,
    contentType: string,
    eventId: string,
    activityId?: string
  ): Promise<UploadResult> {
    const folder = `events/${eventId}/activities${activityId ? `/${activityId}` : ''}`;
    return this.uploadFile(file, fileName, contentType, folder);
  }

  static async uploadEventAsset(
    file: Buffer,
    fileName: string,
    contentType: string,
    eventId: string
  ): Promise<UploadResult> {
    const folder = `events/${eventId}/assets`;
    return this.uploadFile(file, fileName, contentType, folder);
  }

  static async deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.BUCKET,
        Key: key,
      });

      await s3Client.send(command);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete file from S3:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async generatePresignedUploadUrl(
    fileName: string,
    contentType: string,
    folder: string = 'uploads',
    expiresIn: number = 3600 // 1 hour
  ): Promise<PresignedUrlResult> {
    try {
      const key = `${folder}/${uuidv4()}-${fileName}`;
      
      const command = new PutObjectCommand({
        Bucket: this.BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
      const fileUrl = `${this.CDN_URL}/${key}`;

      return {
        success: true,
        uploadUrl,
        fileUrl,
        key,
      };
    } catch (error: any) {
      console.error('Failed to generate presigned URL:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async generatePresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600 // 1 hour
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.BUCKET,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });

      return {
        success: true,
        url,
      };
    } catch (error: any) {
      console.error('Failed to generate presigned download URL:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Helper method to extract S3 key from URL
  static extractKeyFromUrl(url: string): string | null {
    try {
      // Handle both CloudFront and direct S3 URLs
      if (url.includes(this.CDN_URL)) {
        return url.replace(`${this.CDN_URL}/`, '');
      }
      
      // Handle other S3 URL formats
      const s3UrlPatterns = [
        new RegExp(`https://${this.BUCKET}\\.s3\\.${env.AWS_REGION}\\.amazonaws\\.com/(.+)`),
        new RegExp(`https://s3\\.${env.AWS_REGION}\\.amazonaws\\.com/${this.BUCKET}/(.+)`),
      ];

      for (const pattern of s3UrlPatterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1] ?? null;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // Helper method to validate file type for activity images
  static isValidImageType(contentType: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ];
    return allowedTypes.includes(contentType.toLowerCase());
  }

  // Helper method to validate file size
  static isValidFileSize(sizeInBytes: number, maxSizeInMB: number = 10): boolean {
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    return sizeInBytes <= maxSizeInBytes;
  }
}