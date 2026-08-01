import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const serverOptions: ServerOptions = {
      ...options,
      cors: {
        origin: this.corsOrigins,
        credentials: true,
      },
    };
    return super.createIOServer(port, serverOptions);
  }
}
