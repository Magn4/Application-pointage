import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus } from '@prisma/client';
import Redis from 'ioredis';
import { CurrentUserContext } from './types';
import { redisOptions } from '../config/redis';

type CachedTenant = {
  id: string;
  status: TenantStatus;
};

@Injectable()
export class AuthContextCacheService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private readonly ttlSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.ttlSeconds = Math.max(5, Number(this.config.get<string>('AUTH_CONTEXT_CACHE_TTL_SECONDS') ?? 30));
    const enabled = this.readBoolean('AUTH_CONTEXT_CACHE_ENABLED', true);

    this.client = enabled
      ? new Redis({
          ...redisOptions(this.config),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        })
      : null;

    this.client?.on('error', () => undefined);
  }

  async onModuleDestroy() {
    this.client?.disconnect();
  }

  async getUser(userId: string) {
    return this.getJson<CurrentUserContext>(this.userKey(userId));
  }

  async setUser(user: CurrentUserContext) {
    await this.setJson(this.userKey(user.userId), user);
  }

  async getTenant(tenantId: string) {
    return this.getJson<CachedTenant>(this.tenantKey(tenantId));
  }

  async setTenant(tenant: CachedTenant) {
    await this.setJson(this.tenantKey(tenant.id), tenant);
  }

  async clearUser(userId: string) {
    await this.deleteKey(this.userKey(userId));
  }

  async clearTenant(tenantId: string) {
    await this.deleteKey(this.tenantKey(tenantId));
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const client = await this.readyClient();
    if (!client) return null;

    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async setJson(key: string, value: unknown) {
    const client = await this.readyClient();
    if (!client) return;

    try {
      await client.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch {
      // Cache misses must never block authenticated requests.
    }
  }

  private async deleteKey(key: string) {
    const client = await this.readyClient();
    if (!client) return;

    try {
      await client.del(key);
    } catch {
      // Best-effort invalidation.
    }
  }

  private async readyClient() {
    if (!this.client || this.client.status === 'end') return null;

    if (this.client.status === 'wait') {
      try {
        await this.client.connect();
      } catch {
        return null;
      }
    }

    return this.client.status === 'ready' ? this.client : null;
  }

  private userKey(userId: string) {
    return `auth:user:${userId}`;
  }

  private tenantKey(tenantId: string) {
    return `auth:tenant:${tenantId}`;
  }

  private readBoolean(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    if (value == null) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
