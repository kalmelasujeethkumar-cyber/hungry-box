import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that pins the realtime namespace CORS policy to the same
 * CORS_ORIGINS list the HTTP server uses, instead of reflecting any origin.
 */
export class HungryBoxIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly corsOrigins: string[] | undefined,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // socket.io declares option fields as required even though the server
    // falls back to defaults; spread + cast keeps this to a `cors` override.
    return super.createIOServer(port, {
      ...(options ?? {}),
      cors: this.corsOrigins ? { origin: this.corsOrigins, credentials: true } : { origin: false },
    } as ServerOptions);
  }
}
