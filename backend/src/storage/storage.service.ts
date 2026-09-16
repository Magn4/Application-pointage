import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET') ?? 'pointage360';
    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost',
      port: Number(this.config.get<string>('MINIO_PORT') ?? 9000),
      useSSL: this.readBoolean('MINIO_USE_SSL', false),
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
      secretKey: this.config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin',
    });
  }

  documentKey(tenantId: string, category: 'leave' | 'employees' | 'exports', filename: string) {
    return `${tenantId}/${category}/${Date.now()}-${filename}`;
  }

  async putObject(key: string, stream: Readable, size: number, metadata?: Record<string, string>) {
    await this.ensureBucket();
    return this.client.putObject(this.bucket, key, stream, size, metadata);
  }

  async presignedGetObject(key: string, expirySeconds: number) {
    await this.ensureBucket();
    if (this.readBoolean('STORAGE_PROXY_DOWNLOADS', false)) {
      const payload = Buffer.from(JSON.stringify({ key, exp: Math.floor(Date.now() / 1000) + expirySeconds })).toString('base64url');
      return `/api/storage/download?token=${payload}.${this.signDownload(payload)}`;
    }
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async download(token: string) {
    if (typeof token !== 'string' || token.length > 8192) throw new ForbiddenException('Invalid download link');
    const parts = token.split('.');
    if (parts.length !== 2) throw new ForbiddenException('Invalid download link');
    const [payload, signature] = parts as [string, string];
    const expected = Buffer.from(this.signDownload(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ForbiddenException('Invalid download link');
    }
    let data: { key: string; exp: number };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (!data || typeof data.key !== 'string' || !data.key || !Number.isSafeInteger(data.exp) || data.exp <= Date.now() / 1000) {
        throw new Error('Expired');
      }
    } catch {
      throw new ForbiddenException('Invalid or expired download link');
    }
    const stat = await this.client.statObject(this.bucket, data.key);
    const stream = await this.client.getObject(this.bucket, data.key);
    return { stream, size: stat.size };
  }

  private signDownload(payload: string) {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required for download links');
    return createHmac('sha256', secret).update(`storage-download:${payload}`).digest('base64url');
  }

  async check() {
    await this.ensureBucket();
  }

  private ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
          await this.client.makeBucket(this.bucket, 'us-east-1');
        }
      })().catch((error) => {
        this.bucketReady = undefined;
        throw error;
      });
    }
    return this.bucketReady;
  }

  private readBoolean(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    if (value == null) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
