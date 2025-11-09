import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';

export const GetWsUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const client: Socket = ctx.switchToWs().getClient();
    const user = client.data?.user;

    if (!user) return null;

    return data ? user[data] : user;
  },
);
