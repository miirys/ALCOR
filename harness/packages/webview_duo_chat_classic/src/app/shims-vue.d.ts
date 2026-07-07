/* eslint-disable unicorn/filename-case */

// Every time we import a module with the name *.vue (wildcards are supported),
// then don't actually do it - instead treat it as if it had these contents"
declare module '*.vue' {
  import Vue from 'vue';

  // eslint-disable-next-line import/no-default-export
  export default Vue;
}
