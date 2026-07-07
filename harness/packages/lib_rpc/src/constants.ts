import { z } from 'zod';

export const NO_PARAMS = z.undefined();
export type NO_PARAMS = z.infer<typeof NO_PARAMS>;

export const NO_RESPONSE = z.void();
export type NO_RESPONSE = z.infer<typeof NO_RESPONSE>;
