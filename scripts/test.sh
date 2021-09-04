#!/usr/bin/env bash

set -e
cd `dirname "$0"`
cd ..

rm -rf target
./node_modules/.bin/imploder --tsconfig tsconfig.json --profile release
./node_modules/.bin/imploder --tsconfig tsconfig.json --profile test
node target/test.js --tsconfig-path-for-toolbox-transformer ./test_project/tsconfig.json