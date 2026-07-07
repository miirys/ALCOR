import { Injectable } from '@gitlab/needle';
import { FsClient, ExtendedPromiseFsClient } from './fs_client';

const notImplemented = async () => {
  throw new Error('Not implemented');
};

@Injectable(FsClient, [])
export class EmptyFsClient implements FsClient {
  promises: ExtendedPromiseFsClient['promises'] = {
    readFile: notImplemented,
    writeFile: notImplemented,
    unlink: notImplemented,
    readdir: notImplemented,
    mkdir: notImplemented,
    rmdir: notImplemented,
    stat: notImplemented,
    lstat: notImplemented,
    readFileFirstBytes: notImplemented,
  };
}
