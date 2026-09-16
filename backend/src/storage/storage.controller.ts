import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { pipeline } from 'stream/promises';
import { Public } from '../common/decorators/public.decorator';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  // The expiring signature grants access only to the object in the link.
  @Public()
  @Get('download')
  async download(@Query('token') token: string, @Res() response: Response) {
    const file = await this.storage.download(token);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', 'attachment');
    response.setHeader('Content-Length', file.size);
    response.setHeader('Cache-Control', 'private, no-store');
    await pipeline(file.stream, response);
  }
}
