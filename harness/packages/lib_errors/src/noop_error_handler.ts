import { Injectable } from '@gitlab/needle';
import { ErrorHandler } from './error_handler';

@Injectable(ErrorHandler, [])
export class NoopErrorHandler implements ErrorHandler {
  handleError() {}
}
