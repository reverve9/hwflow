"""
mapper.py — 파서 결과 + 스타일 → hwpx_writer 호출

파서(markdown/docx)에서 나온 IR 블록 리스트를 받아,
스타일 설정과 결합하여 HwpxWriter로 .hwpx 파일을 생성한다.
"""

from typing import List, Dict, Any
from style_loader import load_style
from hwpx_writer import HwpxWriter


def convert(ir_blocks: List[Dict[str, Any]], style_name: str,
            output_path: str, title: str = ""):
    """
    IR 블록 리스트를 .hwpx 파일로 변환한다.

    Args:
        ir_blocks: 파서에서 생성된 중간표현 블록 리스트
        style_name: 스타일 프리셋 이름 또는 경로
        output_path: 출력 .hwpx 파일 경로
        title: 문서 제목 (메타데이터용)
    """
    style_config = load_style(style_name)
    writer = HwpxWriter(style_config, title=title)
    writer.write(ir_blocks, output_path)
