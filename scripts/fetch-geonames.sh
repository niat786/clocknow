#!/usr/bin/env bash
# Downloads the GeoNames files citygen needs into data/raw (git-ignored).
# Data: GeoNames (geonames.org), CC BY 4.0. Credit is shown in the site footer and on /about/data.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
cd data/raw
base=https://download.geonames.org/export/dump
curl -fsSL -o cities15000.zip "$base/cities15000.zip"
unzip -o -q cities15000.zip cities15000.txt
rm -f cities15000.zip
curl -fsSL -o admin1CodesASCII.txt "$base/admin1CodesASCII.txt"
curl -fsSL -o countryInfo.txt "$base/countryInfo.txt"
wc -l cities15000.txt admin1CodesASCII.txt countryInfo.txt
