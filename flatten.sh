#!/usr/bin/env bash

if [ -d flats ]; then
  rm -rf flats
fi

mkdir -p flats

./node_modules/.bin/truffle-flattener contracts/KeyHolder.sol > flats/KeyHolder_flat.sol
./node_modules/.bin/truffle-flattener contracts/ClaimHolder.sol > flats/ClaimHolder_flat.sol
./node_modules/.bin/truffle-flattener contracts/Counter.sol > flats/Counter_flat.sol
