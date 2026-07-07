// Ported to TS from https://github.com/springernature/hasbin/tree/master
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - TODO: fix types in this file
import { stat, statSync } from 'fs';
import { join, delimiter } from 'path';
import async from 'async';

export function hasbin(bin: string, done: (result: boolean) => void) {
  async.some(getPaths(bin), fileExists, done);
}

export function hasbinSync(bin: string) {
  return getPaths(bin).some(fileExistsSync);
}

function hasbinAll(bins: string[], done: (result: boolean) => void) {
  async.every(bins, hasbin.async, done);
}

function hasbinAllSync(bins: string[]) {
  return bins.every(hasbin.sync);
}

function hasbinSome(bins: string[], done: (result: boolean) => void) {
  async.some(bins, hasbin.async, done);
}

function hasbinSomeSync(bins: string[]) {
  return bins.some(hasbin.sync);
}

function hasbinFirst(bins: string[], done: (result: boolean) => void) {
  async.detect(bins, hasbin.async, function (result) {
    done(result || false);
  });
}

function hasbinFirstSync(bins: string[]) {
  const matched = bins.filter(hasbin.sync);
  return matched.length ? matched[0] : false;
}

function getPaths(bin: string) {
  const envPath = process.env.PATH || '';
  const envExt = process.env.PATHEXT || '';
  return envPath
    .replace(/["]+/g, '')
    .split(delimiter)
    .map(function (chunk) {
      return envExt.split(delimiter).map(function (ext) {
        return join(chunk, bin + ext);
      });
    })
    .reduce(function (a, b) {
      return a.concat(b);
    });
}

export function fileExists(filePath: string, done: (result: boolean) => void) {
  // eslint-disable-next-line func-names, consistent-return, @typescript-eslint/no-shadow
  stat(filePath, function (error, stat) {
    if (error) {
      return done(false);
    }
    done(stat.isFile());
  });
}

function fileExistsSync(filePath: string) {
  try {
    return statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}
