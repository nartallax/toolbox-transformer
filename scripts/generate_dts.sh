#!/bin/bash
set -e
cd `dirname "$0"`
cd ..

TMP_DTS_FILE="$2.tmp"
./node_modules/.bin/dts-bundle-generator -o "$2" --project tsconfig.json --no-banner "$1"
sed 's/export [*] from.*//g' "$2" | sed 's/export [{][}].*//g' > $TMP_DTS_FILE
mv $TMP_DTS_FILE "$2"