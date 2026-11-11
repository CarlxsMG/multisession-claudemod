#!/bin/bash
# Copies the shop project every case works on into the run's working directory.
cp -r "$(dirname "${BASH_SOURCE[0]}")/../../fixture/shop/." .
