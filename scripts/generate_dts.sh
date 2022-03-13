#!/bin/bash
set -e
cd `dirname "$0"`
cd ..

TMP_DTS_FILE="$2.tmp"
./node_modules/.bin/dts-bundle-generator -o "$2" --project tsconfig.json --no-banner "$1"
# note that we explicitly dropping @types/node here; we don't really need them in our typings
# dts-bundle-generator for some reason thinks that we use RelativeIndexable<T>
sed 's/export [*] from.*//g' "$2" | sed 's/export [{][}].*//g' | sed 's/\/\/\/ <reference types="node" \/>/ /' > "$TMP_DTS_FILE"

mv $TMP_DTS_FILE "$2"