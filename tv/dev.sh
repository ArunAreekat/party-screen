#!/bin/bash
cd "$(dirname "$0")"
source ~/.nvm/nvm.sh
exec ./node_modules/.bin/vite --port 3000 --host
