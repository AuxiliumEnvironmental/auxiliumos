#!/usr/bin/env bash
set -euo pipefail
spatial_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$spatial_root"
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo 'Apple SDK compilation requires an authorized Mac with Xcode 26 or newer. No Apple compilation occurred.' >&2
  exit 2
fi
python3 capacitor/prepare.py
xcodebuild -version
xcodebuild -resolvePackageDependencies \
  -project capacitor/ios/AuxiliumSpatial.xcodeproj -scheme AuxiliumSpatial
xcodebuild build \
  -project capacitor/ios/AuxiliumSpatial.xcodeproj -scheme AuxiliumSpatial \
  -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath capacitor/.build-device \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  DEVELOPMENT_TEAM=''
