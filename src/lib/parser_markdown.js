/**
 * parser_markdown.js — 마크다운 텍스트를 중간표현(IR)으로 변환
 *
 * 지원 문법:
 *   # 제목        → heading1
 *   ## 제목       → heading2
 *   ### 제목      → heading3
 *   #### 제목     → heading4
 *   일반 텍스트   → body
 *   **텍스트**    → emphasis (bold run)
 *   | 표 |        → table
 *   - 목록        → body (bullet prefix 유지)
 *
 * 한국식 번호 매기기:
 *   I. / II.      → heading1
 *   1. / 2.       → heading2
 *   가. / 나.     → heading3
 *   1) / 2)       → heading4
 */

// ─── 한국식 번호 패턴 ─────────────────────────────────────
const ROMAN_RE = /^((?:I{1,3}|IV|V(?:I{0,3})?|IX|X{0,3}))\.\s+(.+)$/;
const KR_NUM_RE = /^(\d+)\.\s+(.+)$/;
const KR_GA_RE = /^([가-힣])\.\s+(.+)$/;
const KR_PAREN_RE = /^(\d+)\)\s+(.+)$/;

// 한글 가나다 순서 (heading3 번호매기기 감지용)
const _HANGUL_GA = '가나다라마바사아자차카타파하';

// 마크다운 표 구분선
const TABLE_SEP_RE = /^\|?\s*[-:]+[-| :]*$/;

// 이미지 패턴
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

// Bold 패턴
const BOLD_RE = /\*\*(.+?)\*\*/g;


/**
 * 마크다운 텍스트를 IR 블록 리스트로 변환한다.
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // 빈 줄 스킵
    if (!stripped) {
      i++;
      continue;
    }

    // 표 감지
    if (_isTableLine(stripped) && i + 1 < lines.length) {
      const tableLines = [stripped];
      let j = i + 1;
      while (j < lines.length && (_isTableLine(lines[j].trim()) || TABLE_SEP_RE.test(lines[j].trim()))) {
        tableLines.push(lines[j].trim());
        j++;
      }
      if (tableLines.length >= 2) {
        blocks.push(_parseTable(tableLines));
        i = j;
        continue;
      }
    }

    // 이미지 감지
    const imgMatch = stripped.match(IMAGE_RE);
    if (imgMatch) {
      blocks.push({ type: 'image', runs: [{ text: imgMatch[1] || '이미지', bold: false }], image_alt: imgMatch[1], image_src: imgMatch[2] });
      i++;
      continue;
    }

    // 마크다운 헤딩
    if (stripped.startsWith('#')) {
      let level = 0;
      for (const ch of stripped) {
        if (ch === '#') level++;
        else break;
      }
      if (level >= 1 && level <= 4) {
        const headingText = stripped.slice(level).trim();
        const style = `heading${level}`;
        blocks.push({ type: style, runs: _parseInline(headingText) });
        i++;
        continue;
      }
    }

    // 한국식 번호 매기기
    let m = stripped.match(ROMAN_RE);
    if (m) {
      blocks.push({ type: 'heading1', runs: _parseInline(stripped) });
      i++;
      continue;
    }

    m = stripped.match(KR_GA_RE);
    if (m && _HANGUL_GA.includes(m[1])) {
      blocks.push({ type: 'heading3', runs: _parseInline(stripped) });
      i++;
      continue;
    }

    m = stripped.match(KR_PAREN_RE);
    if (m) {
      blocks.push({ type: 'heading4', runs: _parseInline(stripped) });
      i++;
      continue;
    }

    m = stripped.match(KR_NUM_RE);
    if (m) {
      blocks.push({ type: 'heading2', runs: _parseInline(stripped) });
      i++;
      continue;
    }

    // 일반 본문
    blocks.push({ type: 'body', runs: _parseInline(stripped) });
    i++;
  }

  return blocks;
}


/**
 * 인라인 마크다운(**bold**)을 파싱하여 run 리스트로 변환한다.
 */
function _parseInline(text) {
  const runs = [];
  let lastEnd = 0;

  // Reset lastIndex for global regex
  BOLD_RE.lastIndex = 0;

  let m;
  while ((m = BOLD_RE.exec(text)) !== null) {
    // bold 앞의 일반 텍스트
    if (m.index > lastEnd) {
      runs.push({ text: text.slice(lastEnd, m.index), bold: false });
    }
    // bold 텍스트
    runs.push({ text: m[1], bold: true });
    lastEnd = m.index + m[0].length;
  }

  // 나머지 텍스트
  if (lastEnd < text.length) {
    runs.push({ text: text.slice(lastEnd), bold: false });
  }

  if (runs.length === 0) {
    runs.push({ text: text, bold: false });
  }

  return runs;
}


/**
 * 파이프(|)로 시작하거나 파이프를 포함하는 표 행인지 확인.
 */
function _isTableLine(line) {
  return line.includes('|') && !TABLE_SEP_RE.test(line);
}


/**
 * 표 라인들을 파싱하여 table IR 블록으로 변환한다.
 */
function _parseTable(lines) {
  const rows = [];
  let hasHeader = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // 구분선 스킵
    if (TABLE_SEP_RE.test(line)) {
      if (idx === 1) {
        hasHeader = true;
      }
      continue;
    }

    const cells = _splitTableRow(line);
    const row = cells.map(cell => ({ runs: _parseInline(cell.trim()) }));
    rows.push(row);
  }

  return { type: 'table', rows, has_header: hasHeader };
}


/**
 * 표 행을 셀 단위로 분리한다.
 */
function _splitTableRow(line) {
  // 앞뒤 파이프 제거
  if (line.startsWith('|')) line = line.slice(1);
  if (line.endsWith('|')) line = line.slice(0, -1);
  return line.split('|');
}
