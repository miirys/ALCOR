#!/bin/bash

# This script is used by vscode debug to launch some of the terminals app. See launch_debug_terminal.ts for more details.

# kill -9 $PPID helps closing some of the terminals after the script execution
node --inspect-brk=127.0.0.1:9229 ../dist/index.js ; kill -9 $PPID
