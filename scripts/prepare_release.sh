#!/bin/bash

set -e
cd `dirname "$0"`
cd ..

./scripts/eslint.sh

rm -rf ./target
./node_modules/.bin/imploder --tsconfig tsconfig.json --profile release
scripts/generate_dts.sh "ts/src/entrypoint.ts" "target/toolbox-transformer.d.ts"
cp ./package.json ./target/
cp ./LICENSE ./target/
cp ./README.md ./target/