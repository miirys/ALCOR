import type { promises, PathLike } from 'node:fs';
import { createInterfaceId } from '@gitlab/needle';

import { PromiseFsClient } from 'isomorphic-git';

export interface ExtendedPromiseFsClient extends PromiseFsClient {
  promises: PromiseFsClient['promises'] & {
    readFile: typeof promises.readFile;
    writeFile: typeof promises.writeFile;
    unlink: typeof promises.unlink;
    readdir: typeof promises.readdir;
    mkdir: typeof promises.mkdir;
    rmdir: typeof promises.rmdir;
    stat: typeof promises.stat;
    lstat: typeof promises.lstat;
    access?: typeof promises.access;
    readlink?: typeof promises.readlink;
    symlink?: typeof promises.symlink;
    chmod?: typeof promises.chmod;
    readFileFirstBytes: (path: PathLike, length: number) => Promise<string>;
  };
}

export interface FsClient extends ExtendedPromiseFsClient {}

export const FsClient = createInterfaceId<FsClient>('FsClient');
