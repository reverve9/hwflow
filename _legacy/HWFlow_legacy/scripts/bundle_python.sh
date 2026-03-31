#!/bin/bash
# HWFlow Python 번들링 스크립트 (PyInstaller 방식)
# Xcode Build Phase "Run Script"에서 호출
# hwflow_engine (standalone binary) + styles를 앱 번들에 복사

set -e

RESOURCES_DIR="${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
PROJECT_ROOT="${SRCROOT}"
ENGINE_DIR="${PROJECT_ROOT}/dist/hwflow_engine"

echo "[HWFlow Bundle] Resources: ${RESOURCES_DIR}"

# 1. hwflow_engine 존재 확인
if [ ! -f "${ENGINE_DIR}/hwflow_engine" ]; then
    echo "[HWFlow Bundle] ERROR: hwflow_engine not found at ${ENGINE_DIR}"
    echo "[HWFlow Bundle] Run: .venv/bin/pyinstaller --onedir --name hwflow_engine python/main.py"
    exit 1
fi

# 2. hwflow_engine 디렉토리 전체 복사 (바이너리 + _internal 라이브러리)
ENGINE_DEST="${RESOURCES_DIR}/hwflow_engine"
rm -rf "${ENGINE_DEST}"
cp -R "${ENGINE_DIR}" "${ENGINE_DEST}"
echo "[HWFlow Bundle] hwflow_engine copied"

# 3. Styles 복사
STYLES_DEST="${RESOURCES_DIR}/styles"
rm -rf "${STYLES_DEST}"
mkdir -p "${STYLES_DEST}"
cp "${PROJECT_ROOT}/styles/"*.json "${STYLES_DEST}/"
echo "[HWFlow Bundle] Styles copied"

# 4. 코드사인 (공증용)
SIGN_IDENTITY="${EXPANDED_CODE_SIGN_IDENTITY:-${CODE_SIGN_IDENTITY}}"

if [ -n "${SIGN_IDENTITY}" ] && [ "${SIGN_IDENTITY}" != "-" ]; then
    echo "[HWFlow Bundle] Signing with: ${SIGN_IDENTITY}"

    # _internal 내 모든 .so, .dylib 서명
    find "${ENGINE_DEST}" \( -name "*.so" -o -name "*.dylib" \) -type f | while read -r lib; do
        codesign --force --sign "${SIGN_IDENTITY}" --options runtime --timestamp "${lib}" 2>/dev/null \
            && echo "[HWFlow Bundle] Signed: $(basename ${lib})" \
            || echo "[HWFlow Bundle] Sign skip: $(basename ${lib})"
    done

    # hwflow_engine 바이너리 자체 서명
    codesign --force --sign "${SIGN_IDENTITY}" --options runtime --timestamp \
        "${ENGINE_DEST}/hwflow_engine" \
        && echo "[HWFlow Bundle] Signed: hwflow_engine" \
        || echo "[HWFlow Bundle] Sign failed: hwflow_engine"
else
    echo "[HWFlow Bundle] WARNING: No signing identity"
fi

# 5. 크기 확인
TOTAL=$(du -sh "${ENGINE_DEST}" 2>/dev/null | awk '{print $1}')
echo "[HWFlow Bundle] Done. Engine: ~${TOTAL}"
