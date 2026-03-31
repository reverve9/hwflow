#!/bin/bash
# bundle_js.sh — JS 엔진 + 스타일을 앱 번들 Resources에 복사
# Xcode Build Phase: Run Script에서 사용

set -e

RESOURCES_DIR="${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
PROJECT_ROOT="${SRCROOT}"

echo "[bundle_js] Copying hwflow_engine.js to Resources..."
cp "${PROJECT_ROOT}/js-engine/dist/hwflow_engine.js" "${RESOURCES_DIR}/"

echo "[bundle_js] Copying styles to Resources..."
mkdir -p "${RESOURCES_DIR}/styles"
cp "${PROJECT_ROOT}/styles/"*.json "${RESOURCES_DIR}/styles/"

echo "[bundle_js] Done."
