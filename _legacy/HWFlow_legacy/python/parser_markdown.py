"""
parser_markdown.py — 마크다운 텍스트를 중간표현(IR)으로 변환

지원 문법:
  # 제목        → heading1
  ## 제목       → heading2
  ### 제목      → heading3
  #### 제목     → heading4
  일반 텍스트   → body
  **텍스트**    → emphasis (bold run)
  | 표 |        → table
  - 목록        → body (bullet prefix 유지)

한국식 번호 매기기 (Claude 출력물에서 흔히 사용):
  I. / II.      → heading1
  1. / 2.       → heading2  (마크다운 순서 목록과 구분: 줄 시작이고 뒤에 내용이 바로 옴)
  가. / 나.     → heading3
  1) / 2)       → heading4
"""

import re
from typing import List, Dict, Any


# ─── 한국식 번호 패턴 ────────────────────────────────────
ROMAN_RE = re.compile(r'^((?:I{1,3}|IV|V(?:I{0,3})?|IX|X{0,3}))\.\s+(.+)$')
KR_NUM_RE = re.compile(r'^(\d+)\.\s+(.+)$')
KR_GA_RE = re.compile(r'^([가-힣])\.\s+(.+)$')
KR_PAREN_RE = re.compile(r'^(\d+)\)\s+(.+)$')

# 한글 가나다 순서 (heading3 번호매기기 감지용)
_HANGUL_GA = "가나다라마바사아자차카타파하"

# 마크다운 표 구분선
TABLE_SEP_RE = re.compile(r'^\|?\s*[-:]+[-| :]*$')

# Bold 패턴
BOLD_RE = re.compile(r'\*\*(.+?)\*\*')


def parse_markdown(text: str) -> List[Dict[str, Any]]:
    """마크다운 텍스트를 IR 블록 리스트로 변환한다."""
    lines = text.split('\n')
    blocks: List[Dict[str, Any]] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 빈 줄 스킵
        if not stripped:
            i += 1
            continue

        # 표 감지
        if _is_table_line(stripped) and i + 1 < len(lines):
            table_lines = [stripped]
            j = i + 1
            while j < len(lines) and (_is_table_line(lines[j].strip()) or TABLE_SEP_RE.match(lines[j].strip())):
                table_lines.append(lines[j].strip())
                j += 1
            if len(table_lines) >= 2:
                blocks.append(_parse_table(table_lines))
                i = j
                continue

        # 마크다운 헤딩
        if stripped.startswith('#'):
            level = 0
            for ch in stripped:
                if ch == '#':
                    level += 1
                else:
                    break
            if 1 <= level <= 4:
                heading_text = stripped[level:].strip()
                style = f"heading{level}"
                blocks.append({"type": style, "runs": _parse_inline(heading_text)})
                i += 1
                continue

        # 한국식 번호 매기기
        m = ROMAN_RE.match(stripped)
        if m:
            blocks.append({"type": "heading1", "runs": _parse_inline(stripped)})
            i += 1
            continue

        m = KR_GA_RE.match(stripped)
        if m and m.group(1) in _HANGUL_GA:
            blocks.append({"type": "heading3", "runs": _parse_inline(stripped)})
            i += 1
            continue

        m = KR_PAREN_RE.match(stripped)
        if m:
            blocks.append({"type": "heading4", "runs": _parse_inline(stripped)})
            i += 1
            continue

        m = KR_NUM_RE.match(stripped)
        if m:
            blocks.append({"type": "heading2", "runs": _parse_inline(stripped)})
            i += 1
            continue

        # 일반 본문
        blocks.append({"type": "body", "runs": _parse_inline(stripped)})
        i += 1

    return blocks


def _parse_inline(text: str) -> List[Dict[str, Any]]:
    """인라인 마크다운(**bold**)을 파싱하여 run 리스트로 변환한다."""
    runs = []
    last_end = 0

    for m in BOLD_RE.finditer(text):
        # bold 앞의 일반 텍스트
        if m.start() > last_end:
            runs.append({"text": text[last_end:m.start()], "bold": False})
        # bold 텍스트
        runs.append({"text": m.group(1), "bold": True})
        last_end = m.end()

    # 나머지 텍스트
    if last_end < len(text):
        runs.append({"text": text[last_end:], "bold": False})

    if not runs:
        runs.append({"text": text, "bold": False})

    return runs


def _is_table_line(line: str) -> bool:
    """파이프(|)로 시작하거나 파이프를 포함하는 표 행인지 확인."""
    return '|' in line and not TABLE_SEP_RE.match(line)


def _parse_table(lines: List[str]) -> Dict[str, Any]:
    """표 라인들을 파싱하여 table IR 블록으로 변환한다."""
    rows = []
    has_header = False

    for idx, line in enumerate(lines):
        # 구분선 스킵
        if TABLE_SEP_RE.match(line):
            if idx == 1:
                has_header = True
            continue

        cells = _split_table_row(line)
        row = [{"runs": _parse_inline(cell.strip())} for cell in cells]
        rows.append(row)

    return {"type": "table", "rows": rows, "has_header": has_header}


def _split_table_row(line: str) -> List[str]:
    """표 행을 셀 단위로 분리한다."""
    # 앞뒤 파이프 제거
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    return line.split('|')
