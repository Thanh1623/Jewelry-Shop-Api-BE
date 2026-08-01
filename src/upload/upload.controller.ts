import {
  Controller,
  FileTypeValidator,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { Roles } from '../common/decorators/roles.decorator';
import type { UploadImageResponse } from './upload.service';
import { UploadService } from './upload.service';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = /^image\/(jpeg|png|webp)$/;

// Avoid Express.Multer.File in decorated params (TS1272 + emitDecoratorMetadata)
interface UploadedImageFile {
  filename: string;
}

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Roles(UserRole.SALE, UserRole.CUSTOMER)
  @ApiConsumes('multipart/form-data')
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, callback) =>
          callback(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
    }),
  )
  uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_MIME_TYPES }),
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
        ],
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: UploadedImageFile,
  ): UploadImageResponse {
    return this.uploadService.buildImageResponse(file);
  }
}
