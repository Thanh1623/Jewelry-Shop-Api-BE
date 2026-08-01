import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UploadImageResponse {
  url: string;
}

interface StoredUploadFile {
  filename: string;
}

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {}

  buildImageResponse(file: StoredUploadFile): UploadImageResponse {
    const baseUrl = this.configService.get<string>(
      'PUBLIC_BASE_URL',
      'http://localhost:3000',
    );
    return { url: `${baseUrl.replace(/\/$/, '')}/uploads/${file.filename}` };
  }
}
