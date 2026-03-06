#!/bin/bash
cd "$(dirname "$0")"
source ~/.nvm/nvm.sh
exec node server.js
