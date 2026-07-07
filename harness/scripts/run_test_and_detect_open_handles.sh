#!/bin/bash

# Use `pipefail` to ensure the script exits if any command in the pipe fails
# Otherwise `tee` will always return a success code and the jest failure will never be surfaced
set -o pipefail
output=$(bun run test:unit -- --colors 2>&1 | tee /dev/stderr)
jest_exit_code=$?

if echo "$output" | grep -q -- "--detectOpenHandles"; then
  RED='\033[31m'
  NC='\033[0m' # No Color
  echo -e "${RED}Open handles detected - failing build. Run your tests locally with 'bun run test:unit -- --detectOpenHandles'${NC}"
  exit 1
fi

echo "Jest exited with code $jest_exit_code"
exit "$jest_exit_code"
