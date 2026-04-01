/**
 * parser_hwpx.js — .hwpx 파일을 중간표현(IR)으로 변환
 *
 * HWPX = ZIP(fflate) + XML(fast-xml-parser)
 * header.xml → 폰트/스타일 정의
 * content.hpf → 멀티섹션 경로 (manifest)
 * sectionN.xml → 본문 단락/표
 *
 * 표 2-pass 빌드, cellSpan 태그 참조:
 *   korean-law-mcp (github.com/chrisryugj/korean-law-mcp)
 */

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

const FONT_NAME_MAP = {
  '함초롬바탕': 'HCR Batang',
  '함초롬돋움': 'HCR Dotum',
};
function browserFontName(name) {
  return FONT_NAME_MAP[name] || name;
}

const xmlOpts = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  preserveOrder: true,
};

/**
 * .hwpx 파일(ArrayBuffer)을 파싱하여 IR 블록 리스트를 반환
 */
export function parseHwpx(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const decoder = new TextDecoder('utf-8');

  // 1. header.xml → 폰트/charPr/paraPr 매핑
  const headerBytes = files['Contents/header.xml'];
  const header = headerBytes ? _parseHeader(decoder.decode(headerBytes)) : {};

  // 2. 멀티섹션 경로 탐색
  const sectionPaths = _resolveSectionPaths(files, decoder);
  if (sectionPaths.length === 0) return [];

  // 3. 모든 섹션 파싱
  const blocks = [];
  for (const path of sectionPaths) {
    const bytes = files[path];
    if (!bytes) continue;
    blocks.push(..._parseSection(decoder.decode(bytes), header));
  }
  return blocks;
}

// ─── 멀티섹션 경로 탐색 ────────────────────────────────

function _resolveSectionPaths(files, decoder) {
  const manifestPaths = ['Contents/content.hpf', 'content.hpf'];
  for (const mp of manifestPaths) {
    const bytes = files[mp];
    if (!bytes) continue;
    try {
      const paths = _parseSectionPathsFromManifest(decoder.decode(bytes));
      if (paths.length > 0) return paths;
    } catch { /* fallback */ }
  }

  // fallback: sectionN.xml 직접 탐색
  const sectionFiles = Object.keys(files)
    .filter(f => /[Ss]ection\d+\.xml$/.test(f))
    .sort();
  if (sectionFiles.length > 0) return sectionFiles;

  if (files['Contents/section0.xml']) return ['Contents/section0.xml'];
  return [];
}

function _parseSectionPathsFromManifest(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    preserveOrder: true,
  });
  const parsed = parser.parse(xml);
  const items = [];
  const spineRefs = [];
  _walkManifest(parsed, items, spineRefs);

  const idToHref = new Map();
  for (const item of items) {
    let href = item.href;
    if (href && !href.startsWith('Contents/') && !href.startsWith('/'))
      href = 'Contents/' + href;
    if (item.id) idToHref.set(item.id, href);
  }

  if (spineRefs.length > 0) {
    const ordered = spineRefs.map(ref => idToHref.get(ref)).filter(Boolean);
    if (ordered.length > 0) return ordered;
  }

  return Array.from(idToHref.entries())
    .filter(([id]) => /^s/i.test(id) || id.toLowerCase().includes('section'))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, href]) => href);
}

function _walkManifest(nodes, items, spineRefs) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node['item'] !== undefined) {
      const attrs = node[':@'] || {};
      const id = attrs['@_id'] || '';
      const href = attrs['@_href'] || '';
      const mediaType = attrs['@_media-type'] || '';
      if (href && (id.toLowerCase().includes('section') || /^s\d/i.test(id) || mediaType.includes('xml')))
        items.push({ id, href });
    }
    if (node['itemref'] !== undefined) {
      const attrs = node[':@'] || {};
      const idref = attrs['@_idref'] || '';
      if (idref) spineRefs.push(idref);
    }
    for (const key of Object.keys(node)) {
      if (key === ':@') continue;
      if (Array.isArray(node[key])) _walkManifest(node[key], items, spineRefs);
    }
  }
}

// ─── header.xml 파싱 ────────────────────────────────────

function _parseHeader(xml) {
  const parser = new XMLParser(xmlOpts);
  const parsed = parser.parse(xml);

  const head = _findTag(parsed, 'head');
  if (!head) return {};

  const headChildren = head['head'] || [];
  const refList = _findTag(headChildren, 'refList');
  if (!refList) return {};
  const refChildren = refList['refList'] || [];

  // 폰트 목록
  const fonts = {};
  const fontfacesNode = _findTag(refChildren, 'fontfaces');
  if (fontfacesNode) {
    const ffChildren = fontfacesNode['fontfaces'] || [];
    for (const ff of ffChildren) {
      if (ff['fontface'] === undefined) continue;
      const lang = (ff[':@'] || {})['@_lang'];
      if (lang !== 'HANGUL') continue;
      const fontNodes = ff['fontface'] || [];
      for (const fn of fontNodes) {
        if (fn['font'] !== undefined) {
          const attrs = fn[':@'] || {};
          const id = parseInt(attrs['@_id'] || '0', 10);
          fonts[id] = attrs['@_face'] || '';
        }
      }
    }
  }

  // charPr 목록
  const charPrs = {};
  const charPropsNode = _findTag(refChildren, 'charProperties');
  if (charPropsNode) {
    const cpChildren = charPropsNode['charProperties'] || [];
    for (const cp of cpChildren) {
      if (cp['charPr'] === undefined) continue;
      const attrs = cp[':@'] || {};
      const id = parseInt(attrs['@_id'] || '0', 10);
      const height = parseInt(attrs['@_height'] || '1000', 10);
      const bold = (cp['charPr'] || []).some(c => c['bold'] !== undefined);
      const fontRefNode = _findTag(cp['charPr'] || [], 'fontRef');
      const fontId = fontRefNode ? parseInt((fontRefNode[':@'] || {})['@_hangul'] || '0', 10) : 0;
      charPrs[id] = { font: fonts[fontId] || '', size_pt: Math.round(height / 100), bold };
    }
  }

  // paraPr 목록
  const paraPrs = {};
  const paraPropsNode = _findTag(refChildren, 'paraProperties');
  if (paraPropsNode) {
    const ppChildren = paraPropsNode['paraProperties'] || [];
    for (const pp of ppChildren) {
      if (pp['paraPr'] === undefined) continue;
      const attrs = pp[':@'] || {};
      const id = parseInt(attrs['@_id'] || '0', 10);
      const ppInner = pp['paraPr'] || [];

      let align = 'justify', indent = 0, spaceBefore = 0, spaceAfter = 0, lineHeight = 160;

      const alignNode = _findTag(ppInner, 'align');
      if (alignNode) {
        const a = ((alignNode[':@'] || {})['@_horizontal'] || '').toLowerCase();
        const map = { left: 'left', center: 'center', right: 'right', justify: 'justify' };
        align = map[a] || 'justify';
      }
      const marginNode = _findTag(ppInner, 'margin');
      if (marginNode) {
        const mc = marginNode['margin'] || [];
        const left = _findTag(mc, 'left');
        if (left) indent = parseInt((left[':@'] || {})['@_value'] || '0', 10);
        const prev = _findTag(mc, 'prev');
        if (prev) spaceBefore = parseInt((prev[':@'] || {})['@_value'] || '0', 10);
        const next = _findTag(mc, 'next');
        if (next) spaceAfter = parseInt((next[':@'] || {})['@_value'] || '0', 10);
      }
      const lsNode = _findTag(ppInner, 'lineSpacing');
      if (lsNode) {
        const lsAttrs = lsNode[':@'] || {};
        const type = lsAttrs['@_type'] || 'PERCENT';
        const val = parseInt(lsAttrs['@_value'] || '160', 10);
        if (type === 'PERCENT') lineHeight = val;
      }

      paraPrs[id] = { align, indent, spaceBefore, spaceAfter, lineHeight };
    }
  }

  return { fonts, charPrs, paraPrs };
}

// ─── 섹션 파싱 (기존 직접 순회 방식) ───────────────────

function _parseSection(xml, header) {
  const parser = new XMLParser(xmlOpts);
  const parsed = parser.parse(xml);

  const sec = _findTag(parsed, 'sec');
  if (!sec) return [];

  const blocks = [];
  const secChildren = sec['sec'] || [];
  _walkChildren(secChildren, blocks, header);
  return blocks;
}

/**
 * 자식 노드를 순회하며 단락과 표를 추출.
 * hp:tbl이 sec 직접 자식일 수도 있고, p > run 안에 있을 수도 있음.
 */
function _walkChildren(children, blocks, header) {
  for (const child of children) {
    if (child['p'] !== undefined) {
      // p 안에 tbl이 있을 수 있으므로 먼저 확인
      const pChildren = child['p'] || [];
      let hasTbl = false;
      for (const pc of pChildren) {
        if (pc['run'] !== undefined) {
          const runChildren = pc['run'] || [];
          for (const rc of runChildren) {
            if (rc['tbl'] !== undefined) {
              hasTbl = true;
              const block = _parseTable(rc, header);
              if (block) blocks.push(block);
            }
          }
        }
      }
      // 표가 없는 단락이거나, 표와 텍스트가 함께 있는 경우 텍스트도 추출
      const block = _parseParagraph(child, header);
      if (block) blocks.push(block);
    } else if (child['tbl'] !== undefined) {
      const block = _parseTable(child, header);
      if (block) blocks.push(block);
    }
  }
}

// ─── 단락 파싱 ──────────────────────────────────────────

function _parseParagraph(pNode, header) {
  const attrs = pNode[':@'] || {};
  const paraPrId = parseInt(attrs['@_paraPrIDRef'] || '0', 10);
  const pChildren = pNode['p'] || [];

  const runs = [];
  let firstCharPr = null;

  for (const child of pChildren) {
    if (child['run'] !== undefined) {
      const runAttrs = child[':@'] || {};
      const charPrId = parseInt(runAttrs['@_charPrIDRef'] || '0', 10);
      if (firstCharPr === null) firstCharPr = charPrId;
      const runChildren = child['run'] || [];
      if (runChildren.some(c => c['secPr'] !== undefined)) continue;
      if (runChildren.some(c => c['ctrl'] !== undefined)) continue;
      const tNode = _findTag(runChildren, 't');
      if (tNode) {
        const text = _extractText(tNode);
        if (text) {
          const cpr = header.charPrs?.[charPrId];
          runs.push({ text, bold: cpr?.bold || false });
        }
      }
    }
  }

  const fullText = runs.map(r => r.text).join('');
  if (!fullText.trim() && runs.length <= 1) return null;

  const cpr = header.charPrs?.[firstCharPr];
  const ppr = header.paraPrs?.[paraPrId];
  let type = 'body';
  if (cpr) {
    if (cpr.size_pt >= 15 && cpr.bold) type = 'heading1';
    else if (cpr.size_pt >= 13 && cpr.bold) type = 'heading2';
    else if (cpr.size_pt >= 12 && cpr.bold) type = 'heading3';
    else if (cpr.size_pt >= 11 && cpr.bold) type = 'heading4';
  }

  const result = { type, runs: runs.length > 0 ? runs : [{ text: '', bold: false }] };
  if (ppr) {
    if (ppr.align) result.align = ppr.align;
    if (ppr.indent) result.indent_left_hwpunit = ppr.indent;
    if (ppr.spaceBefore) result.space_before_hwpunit = ppr.spaceBefore;
    if (ppr.spaceAfter) result.space_after_hwpunit = ppr.spaceAfter;
  }

  const os = {};
  if (cpr?.font) os.font = browserFontName(cpr.font);
  if (cpr?.size_pt) os.size_pt = cpr.size_pt;
  if (cpr) os.bold = cpr.bold;
  if (ppr?.align) os.align = ppr.align;
  if (ppr?.lineHeight) os.line_height_percent = ppr.lineHeight;
  if (ppr?.indent) os.indent_left_hwpunit = ppr.indent;
  if (ppr?.spaceBefore) os.space_before_hwpunit = ppr.spaceBefore;
  if (ppr?.spaceAfter) os.space_after_hwpunit = ppr.spaceAfter;
  if (Object.keys(os).length > 0) result.originalStyle = os;

  return result;
}

// ─── 표 파싱 + 2-pass 빌드 ─────────────────────────────

function _parseTable(tblNode, header) {
  const tblChildren = tblNode['tbl'] || [];
  const rawRows = [];

  for (const child of tblChildren) {
    if (child['tr'] !== undefined) {
      const trChildren = child['tr'] || [];
      const cells = [];
      for (const tcNode of trChildren) {
        if (tcNode['tc'] !== undefined) {
          cells.push(_parseCell(tcNode, header));
        }
      }
      if (cells.length > 0) rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) return { type: 'table', rows: [], has_header: false };

  // 2-pass 빌드 (korean-law-mcp 참조)
  return _buildTable(rawRows);
}

/** 2-pass 테이블 빌드 — colSpan/rowSpan 정확한 배치 */
function _buildTable(rawRows) {
  const numRows = rawRows.length;

  // Pass 1: maxCols 계산
  const tempOccupied = Array.from({ length: numRows }, () => Array(50).fill(false));
  let maxCols = 0;

  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    for (const cell of rawRows[rowIdx]) {
      while (colIdx < 50 && tempOccupied[rowIdx][colIdx]) colIdx++;
      if (colIdx >= 50) break;
      const cs = cell.colspan || 1;
      const rs = cell.rowspan || 1;
      for (let r = rowIdx; r < Math.min(rowIdx + rs, numRows); r++) {
        for (let c = colIdx; c < Math.min(colIdx + cs, 50); c++) {
          tempOccupied[r][c] = true;
        }
      }
      colIdx += cs;
      if (colIdx > maxCols) maxCols = colIdx;
    }
  }

  if (maxCols === 0) return { type: 'table', rows: [], has_header: false };

  // Pass 2: 실제 배치
  const occupied = Array.from({ length: numRows }, () => Array(maxCols).fill(false));
  const grid = Array.from({ length: numRows }, () =>
    Array.from({ length: maxCols }, () => ({
      runs: [{ text: '', bold: false }],
      align: 'left', valign: 'center', bgColor: null,
      colspan: 1, rowspan: 1, merged: true,
    }))
  );

  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    let cellIdx = 0;

    while (colIdx < maxCols && cellIdx < rawRows[rowIdx].length) {
      while (colIdx < maxCols && occupied[rowIdx][colIdx]) colIdx++;
      if (colIdx >= maxCols) break;

      const cell = rawRows[rowIdx][cellIdx];
      const cs = cell.colspan || 1;
      const rs = cell.rowspan || 1;

      grid[rowIdx][colIdx] = { ...cell, merged: false };

      for (let r = rowIdx; r < Math.min(rowIdx + rs, numRows); r++) {
        for (let c = colIdx; c < Math.min(colIdx + cs, maxCols); c++) {
          occupied[r][c] = true;
        }
      }
      colIdx += cs;
      cellIdx++;
    }
  }

  // 헤더 추정: 첫 행의 모든 셀이 bold
  let hasHeader = false;
  if (grid.length > 0) {
    hasHeader = grid[0].every(cell => {
      if (cell.merged) return true;
      const contentRuns = (cell.runs || []).filter(r => (r.text || '').trim());
      return contentRuns.length === 0 || contentRuns.every(r => r.bold);
    });
  }

  return { type: 'table', rows: grid, has_header: hasHeader };
}

// ─── 셀 파싱 ────────────────────────────────────────────

function _parseCell(tcNode, header) {
  const tcChildren = tcNode['tc'] || [];
  const runs = [];
  let colspan = 1, rowspan = 1;

  // cellSpan 태그 (korean-law-mcp 참조)
  const cellSpanNode = _findTag(tcChildren, 'cellSpan');
  if (cellSpanNode) {
    const attrs = cellSpanNode[':@'] || {};
    const cs = parseInt(attrs['@_colSpan'] || '1', 10);
    const rs = parseInt(attrs['@_rowSpan'] || '1', 10);
    if (cs > 0) colspan = cs;
    if (rs > 0) rowspan = rs;
  }

  // cellAddr에서도 시도
  const cellAddrNode = _findTag(tcChildren, 'cellAddr');
  if (cellAddrNode) {
    const attrs = cellAddrNode[':@'] || {};
    const cs = parseInt(attrs['@_colSpan'] || '0', 10);
    const rs = parseInt(attrs['@_rowSpan'] || '0', 10);
    if (cs > 1) colspan = cs;
    if (rs > 1) rowspan = rs;
  }

  // tc 속성
  const tcAttrs = tcNode[':@'] || {};
  if (tcAttrs['@_colSpan']) colspan = Math.max(colspan, parseInt(tcAttrs['@_colSpan'], 10));
  if (tcAttrs['@_rowSpan']) rowspan = Math.max(rowspan, parseInt(tcAttrs['@_rowSpan'], 10));

  // cellPr에서 span
  let bgColor = null;
  const cellPrNode = _findTag(tcChildren, 'cellPr');
  if (cellPrNode) {
    const cpAttrs = cellPrNode[':@'] || {};
    if (cpAttrs['@_colSpan']) colspan = Math.max(colspan, parseInt(cpAttrs['@_colSpan'], 10));
    if (cpAttrs['@_rowSpan']) rowspan = Math.max(rowspan, parseInt(cpAttrs['@_rowSpan'], 10));
  }

  // 셀 내 단락 — tc > p 또는 tc > subList > p 모두 탐색
  const pNodes = [];
  for (const child of tcChildren) {
    if (child['p'] !== undefined) {
      pNodes.push(child);
    } else if (child['subList'] !== undefined) {
      const subChildren = child['subList'] || [];
      for (const sc of subChildren) {
        if (sc['p'] !== undefined) pNodes.push(sc);
      }
    }
  }
  for (const pNode of pNodes) {
    if (runs.length > 0) runs.push({ text: '\n', bold: false });
    const pBlock = _parseParagraph(pNode, header);
    if (pBlock && pBlock.runs) {
      for (const r of pBlock.runs) runs.push(r);
    }
  }

  if (runs.length === 0) runs.push({ text: '', bold: false });
  return { runs, align: 'left', valign: 'center', bgColor, colspan, rowspan };
}

// ─── 유틸 ───────────────────────────────────────────────

function _findTag(arr, tagName) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (item[tagName] !== undefined) return item;
  }
  return null;
}

function _extractText(tNode) {
  const content = tNode['t'];
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === 'string') return c;
      if (c['#text'] !== undefined) return c['#text'];
      return '';
    }).join('');
  }
  if (content && content['#text'] !== undefined) return content['#text'];
  return '';
}
