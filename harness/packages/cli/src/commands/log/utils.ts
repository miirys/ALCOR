import path from 'path';
import os from 'os';

export const getCliLogDir = () => {
  return path.join(os.tmpdir(), 'gitlab-duo-cli');
};
