"""
style_loader.py — style_preset.json 로드 모듈

styles/ 디렉토리에서 프리셋을 로드하고, 사용 가능한 프리셋 목록을 반환한다.
"""

import json
import os
from typing import Dict, Any, List


_DEFAULT_STYLES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "styles")
# 환경변수 또는 기본 경로
STYLES_DIR = os.environ.get("HWFLOW_STYLES_DIR", _DEFAULT_STYLES_DIR)


def set_styles_dir(path: str):
    """외부에서 styles 디렉토리를 지정한다."""
    global STYLES_DIR
    STYLES_DIR = path


def load_style(name: str) -> Dict[str, Any]:
    """
    스타일 프리셋을 이름으로 로드한다.

    Args:
        name: 프리셋 이름 (예: "공문서_표준") 또는 JSON 파일 경로

    Returns:
        스타일 설정 딕셔너리
    """
    # 직접 경로가 주어진 경우
    if os.path.isfile(name):
        with open(name, "r", encoding="utf-8") as f:
            return json.load(f)

    # .json 확장자 추가
    if not name.endswith(".json"):
        name = name + ".json"

    path = os.path.join(STYLES_DIR, name)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"스타일 프리셋을 찾을 수 없습니다: {path}")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_styles() -> List[Dict[str, str]]:
    """
    사용 가능한 스타일 프리셋 목록을 반환한다.

    Returns:
        [{"name": "공문서_표준", "description": "행정기관 공문서 표준 스타일"}, ...]
    """
    styles = []
    if not os.path.isdir(STYLES_DIR):
        return styles

    for fname in sorted(os.listdir(STYLES_DIR)):
        if fname.endswith(".json"):
            path = os.path.join(STYLES_DIR, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                meta = data.get("meta", {})
                styles.append({
                    "name": meta.get("name", fname.replace(".json", "")),
                    "description": meta.get("description", ""),
                    "file": fname,
                })
            except (json.JSONDecodeError, IOError):
                continue
    return styles
