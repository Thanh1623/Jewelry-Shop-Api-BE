import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      response
        .status(status)
        .json(
          typeof exceptionResponse === 'string'
            ? { statusCode: status, message: exceptionResponse }
            : exceptionResponse,
        );
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaResponse = this.mapPrismaError(exception);
      response.status(prismaResponse.statusCode).json(prismaResponse);
      return;
    }

    this.logger.error(exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      error: 'Internal Server Error',
    });
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    error: string;
  } {
    if (error.code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        message: 'Dữ liệu đã tồn tại.',
        error: 'Conflict',
      };
    }

    if (error.code === 'P2003') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Thao tác không hợp lệ do ràng buộc dữ liệu.',
        error: 'Bad Request',
      };
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Không thể xử lý yêu cầu với dữ liệu hiện tại.',
      error: 'Bad Request',
    };
  }
}
