import { Context } from 'hydrooj';
import { apply as registerHandlers } from './handler';
import { apply as initializeModel } from './model';

export async function apply(ctx: Context) {
    await initializeModel(ctx);
    registerHandlers(ctx);
}
