#!/bin/sh
set -eu
if ! command -v xcodebuild >/dev/null 2>&1; then
    printf '%s\n' 'Apple Xcode runtime unavailable. Continue portable work; do not claim native capture acceptance.'
    exit 2
fi
xcodebuild -version
xcrun --find swift
swift --version
printf '%s\n' 'Environment only: this does not compile an app or prove device access. Use the actual implemented scheme and physical target for native acceptance.'
