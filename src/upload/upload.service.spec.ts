import { ConfigService } from '@nestjs/config';

import { UploadService } from './upload.service';

describe('UploadService.buildImageResponse', () => {
  const file = { filename: 'abc123.jpg' } as Express.Multer.File;

  it('builds an absolute URL from PUBLIC_BASE_URL and the stored filename', () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    } as unknown as ConfigService;
    const service = new UploadService(mockConfigService);

    const actualResult = service.buildImageResponse(file);

    expect(actualResult).toEqual({
      url: 'http://localhost:3000/uploads/abc123.jpg',
    });
  });

  it('strips a trailing slash from PUBLIC_BASE_URL to avoid double slashes', () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('https://api.example.com/'),
    } as unknown as ConfigService;
    const service = new UploadService(mockConfigService);

    const actualResult = service.buildImageResponse(file);

    expect(actualResult).toEqual({
      url: 'https://api.example.com/uploads/abc123.jpg',
    });
  });
});
