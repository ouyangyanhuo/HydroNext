import { Context } from 'hydrooj';
import { apply as registerHandlers } from './handler';
import { initialize } from './model';

export async function apply(ctx: Context) {
    await initialize(ctx);
    registerHandlers(ctx);
}
