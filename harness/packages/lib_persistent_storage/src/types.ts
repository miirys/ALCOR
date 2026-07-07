import { z } from 'zod';
import { globalSettingSchema, clientSettingSchema, SelectedProjectSettingSchema } from './schemas';

export type GlobalSettings = {
  [K in keyof typeof globalSettingSchema]: z.infer<(typeof globalSettingSchema)[K]>;
};

export type ClientSettings = {
  [K in keyof typeof clientSettingSchema]: z.infer<(typeof clientSettingSchema)[K]>;
};

export type SelectedProjectSetting = z.infer<typeof SelectedProjectSettingSchema>;
