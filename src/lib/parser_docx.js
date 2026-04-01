/**
 * parser_docx.js — .docx 파일을 중간표현(IR)으로 변환
 *
 * fflate로 ZIP 해제, fast-xml-parser로 XML 파싱.
 * python-docx 대체.
 *
 * Word 스타일 → IR 매핑:
 *   Heading 1  → heading1
 *   Heading 2  → heading2
 *   Heading 3  → heading3
 *   Heading 4  → heading4
 *   Normal     → body
 *   Table      → table
 */

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { base64ToUint8Array } from './utils.js';

// Word 스타일 ID/이름 → IR 타입 매핑
const STYLE_MAP = {
  'Heading1': 'heading1',
  'Heading2': 'heading2',
  'Heading3': 'heading3',
  'Heading4': 'heading4',
  'Heading 1': 'heading1',
  'Heading 2': 'heading2',
  'Heading 3': 'heading3',
  'Heading 4': 'heading4',
  'Title': 'heading1',
  'Subtitle': 'heading2',
  'Normal': 'body',
  'BodyText': 'body',
  'Body Text': 'body',
  'ListParagraph': 'body',
  'List Paragraph': 'body',
  // 한글 스타일명
  '제목 1': 'heading1',
  '제목 2': 'heading2',
  '제목 3': 'heading3',
  '제목 4': 'heading4',
  '본문': 'body',
};

// fast-xml-parser 설정
const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  preserveOrder: false,
  trimValues: false,
  isArray: (name) => ['w:p', 'w:r', 'w:tr', 'w:tc', 'w:t', 'w:tbl'].includes(name),
};


/**
 * .docx 파일(base64)을 파싱하여 IR 블록 리스트를 반환한다.
 * @param {string} base64Data - base64 인코딩된 docx 파일
 * @returns {Array<Object>} IR 블록 리스트
 */
export function parseDocx(base64Data) {
  const zipData = base64ToUint8Array(base64Data);
  const files = unzipSync(zipData);

  // word/document.xml 추출
  const docXmlBytes = files['word/document.xml'];
  if (!docXmlBytes) return [];

  const decoder = _getDecoder();
  const docXmlStr = decoder(docXmlBytes);

  // word/theme/theme1.xml에서 테마 폰트 추출
  const themeFonts = { major: {}, minor: {} };
  const themeBytes = files['word/theme/theme1.xml'];
  if (themeBytes) {
    _parseThemeFonts(decoder(themeBytes), themeFonts);
  }

  // word/styles.xml에서 스타일 ID → 이름/속성 매핑 구축
  const styleIdToName = {};
  const styleIdToProps = {};
  const docDefaults = {};
  const stylesXmlBytes = files['word/styles.xml'];
  if (stylesXmlBytes) {
    _buildStyleIdMap(decoder(stylesXmlBytes), styleIdToName, styleIdToProps, docDefaults, themeFonts);
  }

  const orderedBlocks = _parseBodyOrdered(docXmlStr, styleIdToName, styleIdToProps, docDefaults);
  return orderedBlocks;
}


/**
 * preserveOrder 모드로 body를 파싱하여 요소 순서를 유지한다.
 */
function _parseBodyOrdered(docXmlStr, styleIdToName, styleIdToProps, docDefaults) {
  const parser = new XMLParser({
    ...xmlParserOptions,
    preserveOrder: true,
  });
  const ordered = parser.parse(docXmlStr);

  const docNode = _findOrdered(ordered, 'w:document');
  if (!docNode) return [];
  const bodyNode = _findOrdered(docNode['w:document'], 'w:body');
  if (!bodyNode) return [];

  const blocks = [];
  const bodyChildren = bodyNode['w:body'] || [];

  for (const child of bodyChildren) {
    if (child['w:p'] !== undefined) {
      const block = _parseParagraphOrdered(child, styleIdToName, styleIdToProps, docDefaults);
      if (block) blocks.push(block);
    } else if (child['w:tbl'] !== undefined) {
      const block = _parseTableOrdered(child, styleIdToName);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

function _findOrdered(arr, tagName) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (item[tagName] !== undefined) return item;
  }
  return null;
}

function _parseParagraphOrdered(pNode, styleIdToName, styleIdToProps, docDefaults) {
  const pChildren = pNode['w:p'] || [];
  let irType = 'body';
  let styleId = '';
  let align = null;
  let indentLeft = 0;
  let spaceBefore = 0;
  let spaceAfter = 0;
  let lineHeight = 0;
  let pprFont = null;
  let pprSize = 0;
  let pprBold = false;
  const runs = [];
  let hasImage = false;

  for (const child of pChildren) {
    if (child['w:pPr'] !== undefined) {
      const pPrChildren = child['w:pPr'] || [];
      // 스타일
      const pStyleNode = _findOrdered(pPrChildren, 'w:pStyle');
      if (pStyleNode) {
        const attrs = pStyleNode[':@'] || {};
        styleId = attrs['@_w:val'] || '';
        irType = _mapStyle(styleId, styleIdToName);
      }
      // 정렬 (w:jc)
      const jcNode = _findOrdered(pPrChildren, 'w:jc');
      if (jcNode) {
        const val = (jcNode[':@'] || {})['@_w:val'] || '';
        const map = { left: 'left', center: 'center', right: 'right', both: 'justify', justify: 'justify' };
        align = map[val] || null;
      }
      // 들여쓰기 (w:ind)
      const indNode = _findOrdered(pPrChildren, 'w:ind');
      if (indNode) {
        const attrs = indNode[':@'] || {};
        const left = parseInt(attrs['@_w:left'] || '0', 10);
        if (left) indentLeft = left * 5;
      }
      // 단락 간격 (w:spacing)
      const spNode = _findOrdered(pPrChildren, 'w:spacing');
      if (spNode) {
        const attrs = spNode[':@'] || {};
        const before = parseInt(attrs['@_w:before'] || '0', 10);
        const after = parseInt(attrs['@_w:after'] || '0', 10);
        if (before) spaceBefore = before * 5;
        if (after) spaceAfter = after * 5;
        // 줄간격: w:line (1/240 pt 단위), w:lineRule
        const line = parseInt(attrs['@_w:line'] || '0', 10);
        if (line) {
          const lineRule = attrs['@_w:lineRule'] || 'auto';
          if (lineRule === 'auto') {
            lineHeight = Math.round(line / 240 * 100);
          }
        }
      }
      // 단락 기본 런 속성 (w:rPr in pPr)
      const rPrNode = _findOrdered(pPrChildren, 'w:rPr');
      if (rPrNode) {
        const rPrChildren = rPrNode['w:rPr'] || [];
        const extracted = _extractRunStyle(rPrChildren);
        if (extracted.font) pprFont = extracted.font;
        if (extracted.size) pprSize = extracted.size;
        if (extracted.bold) pprBold = true;
      }
    } else if (child['w:r'] !== undefined) {
      // 이미지 감지 (w:r 내 w:drawing 또는 w:pict)
      const rChildren = child['w:r'] || [];
      const hasDrawing = rChildren.some(rc =>
        rc['w:drawing'] !== undefined || rc['w:pict'] !== undefined
      );
      if (hasDrawing) {
        hasImage = true;
      } else {
        const run = _parseRunOrdered(child);
        if (run) runs.push(run);
      }
    }
  }

  if (hasImage && runs.length === 0) {
    return { type: 'image', runs: [{ text: '이미지', bold: false }] };
  }

  // 원본 스타일 구성: 단락 rPr → 런 → styles.xml → docDefaults 순으로 fallback
  const firstRun = runs[0];
  const sp = (styleIdToProps || {})[styleId] || {};
  const dd = docDefaults || {};
  const origFont = pprFont || (firstRun && firstRun._font) || sp.font || dd.font || null;
  const origSize = pprSize || (firstRun && firstRun._size) || sp.size || dd.size || 0;
  const origBold = pprBold || (firstRun && firstRun.bold) || sp.bold || false;
  const origAlign = align || sp.align || null;
  const origLineHeight = lineHeight || sp.lineHeight || dd.lineHeight || 0;
  const origSpaceBefore = spaceBefore || sp.spaceBefore || dd.spaceBefore || 0;
  const origSpaceAfter = spaceAfter || sp.spaceAfter || dd.spaceAfter || 0;
  const origIndentLeft = indentLeft || sp.indentLeft || 0;

  // 런에서 내부 필드 제거
  for (const r of runs) { delete r._font; delete r._size; }

  const result = { type: irType, runs: runs.length > 0 ? runs : [{ text: '', bold: false }] };
  if (origAlign) result.align = origAlign;
  if (origIndentLeft) result.indent_left_hwpunit = origIndentLeft;
  if (origSpaceBefore) result.space_before_hwpunit = origSpaceBefore;
  if (origSpaceAfter) result.space_after_hwpunit = origSpaceAfter;

  // 원본 스타일
  const os = {};
  if (origFont) os.font = origFont;
  if (origSize) os.size_pt = origSize;
  os.bold = origBold;
  if (origAlign) os.align = origAlign;
  if (origLineHeight) os.line_height_percent = origLineHeight;
  if (origIndentLeft) os.indent_left_hwpunit = origIndentLeft;
  if (origSpaceBefore) os.space_before_hwpunit = origSpaceBefore;
  if (origSpaceAfter) os.space_after_hwpunit = origSpaceAfter;
  if (origFont || origSize) result.originalStyle = os;

  return result;
}

function _parseRunOrdered(rNode) {
  const rChildren = rNode['w:r'] || [];
  let bold = false;
  let italic = false;
  let underline = false;
  let color = null;
  let font = null;
  let size = 0;
  let text = '';

  for (const child of rChildren) {
    if (child['w:rPr'] !== undefined) {
      const rPrChildren = child['w:rPr'] || [];
      const extracted = _extractRunStyle(rPrChildren);
      bold = extracted.bold;
      italic = extracted.italic;
      underline = extracted.underline;
      color = extracted.color;
      font = extracted.font;
      size = extracted.size;
    } else if (child['w:t'] !== undefined) {
      const tContent = child['w:t'];
      if (Array.isArray(tContent)) {
        for (const t of tContent) {
          if (typeof t === 'string') text += t;
          else if (t['#text'] !== undefined) text += t['#text'];
        }
      } else if (typeof tContent === 'string') {
        text += tContent;
      } else if (tContent && tContent['#text'] !== undefined) {
        text += tContent['#text'];
      }
    }
  }

  if (!text) return null;
  const run = { text, bold };
  if (italic) run.italic = italic;
  if (underline) run.underline = underline;
  if (color) run.color = color;
  if (font) run._font = font;
  if (size) run._size = size;
  return run;
}

/** w:rPr 자식 노드에서 폰트/크기/굵기 등 추출 */
function _extractRunStyle(rPrChildren) {
  let bold = false, italic = false, underline = false, color = null, font = null, size = 0;
  for (const prop of rPrChildren) {
    if (prop['w:b'] !== undefined) bold = true;
    if (prop['w:i'] !== undefined) italic = true;
    if (prop['w:u'] !== undefined) underline = true;
    if (prop['w:color'] !== undefined) {
      const attrs = prop[':@'] || {};
      const val = attrs['@_w:val'];
      if (val && val !== 'auto') color = '#' + val;
    }
    if (prop['w:rFonts'] !== undefined) {
      const attrs = prop[':@'] || {};
      font = attrs['@_w:eastAsia'] || attrs['@_w:ascii'] || attrs['@_w:hAnsi'] || null;
    }
    if (prop['w:sz'] !== undefined) {
      const attrs = prop[':@'] || {};
      const val = parseInt(attrs['@_w:val'] || '0', 10);
      if (val) size = val / 2; // half-points → pt
    }
  }
  return { bold, italic, underline, color, font, size };
}

function _parseTableOrdered(tblNode, styleIdToName) {
  const tblChildren = tblNode['w:tbl'] || [];
  const rows = [];

  // tblGrid에서 열 너비 추출 (dxa 단위)
  const colWidths = [];
  const gridNode = _findOrdered(tblChildren, 'w:tblGrid');
  if (gridNode) {
    for (const gc of (gridNode['w:tblGrid'] || [])) {
      if (gc['w:gridCol'] !== undefined) {
        const w = parseInt((gc[':@'] || {})['@_w:w'] || '0', 10);
        colWidths.push(w);
      }
    }
  }
  const totalGridWidth = colWidths.reduce((a, b) => a + b, 0);

  for (const child of tblChildren) {
    if (child['w:tr'] !== undefined) {
      const trChildren = child['w:tr'] || [];
      const cells = [];
      let gridIdx = 0;

      for (const tcNode of trChildren) {
        if (tcNode['w:tc'] !== undefined) {
          const cell = _parseCellOrdered(tcNode, styleIdToName);
          // dxa 기반 너비 계산 (pct가 없을 때)
          if (!cell.widthPct && totalGridWidth > 0 && gridIdx < colWidths.length) {
            const span = cell.colspan || 1;
            let cellW = 0;
            for (let s = 0; s < span && gridIdx + s < colWidths.length; s++) {
              cellW += colWidths[gridIdx + s];
            }
            cell.widthPct = Math.round(cellW / totalGridWidth * 1000) / 10;
          }
          gridIdx += cell.colspan || 1;
          cells.push(cell);
        }
      }

      if (cells.length > 0) rows.push(cells);
    }
  }

  // 첫 행이 헤더인지 추정 (첫 행의 모든 run이 bold)
  let hasHeader = false;
  if (rows.length > 0) {
    const firstRow = rows[0];
    hasHeader = firstRow.every(cell => {
      const contentRuns = (cell.runs || []).filter(r => (r.text || '').trim());
      return contentRuns.length === 0 || contentRuns.every(r => r.bold);
    });
  }

  return { type: 'table', rows, has_header: hasHeader };
}

function _parseCellOrdered(tcNode, styleIdToName) {
  const tcChildren = tcNode['w:tc'] || [];
  const runs = [];
  let widthPct = 0;
  let gridSpan = 1;

  for (const child of tcChildren) {
    if (child['w:tcPr'] !== undefined) {
      const tcPrChildren = child['w:tcPr'] || [];
      // 셀 너비 (w:tcW)
      const tcW = _findOrdered(tcPrChildren, 'w:tcW');
      if (tcW) {
        const attrs = tcW[':@'] || {};
        const type = attrs['@_w:type'] || '';
        const w = parseInt(attrs['@_w:w'] || '0', 10);
        if (type === 'pct' && w > 0) {
          widthPct = Math.round(w / 50) // Word pct는 1/50% 단위
        } else if (type === 'dxa' && w > 0) {
          widthPct = 0; // dxa는 절대값, 나중에 tblW 대비 계산
        }
      }
      // gridSpan (셀 병합)
      const gsNode = _findOrdered(tcPrChildren, 'w:gridSpan');
      if (gsNode) {
        gridSpan = parseInt((gsNode[':@'] || {})['@_w:val'] || '1', 10);
      }
    } else if (child['w:p'] !== undefined) {
      if (runs.length > 0) {
        runs.push({ text: '\n', bold: false });
      }
      const pChildren = child['w:p'] || [];
      for (const pChild of pChildren) {
        if (pChild['w:r'] !== undefined) {
          const run = _parseRunOrdered(pChild);
          if (run) runs.push(run);
        }
      }
    }
  }

  if (runs.length === 0) {
    runs.push({ text: '', bold: false });
  }

  const cell = { runs };
  if (widthPct > 0) cell.widthPct = widthPct;
  if (gridSpan > 1) cell.colspan = gridSpan;
  return cell;
}


/** theme1.xml에서 major/minor 폰트 추출 */
function _parseThemeFonts(themeXml, out) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });
  const parsed = parser.parse(themeXml);
  const fontScheme = _dig(parsed, 'theme', 'themeElements', 'fontScheme');
  if (!fontScheme) return;
  for (const key of ['majorFont', 'minorFont']) {
    const node = fontScheme[key];
    if (!node) continue;
    const target = key === 'majorFont' ? out.major : out.minor;
    // ea (East Asian) 폰트
    if (node.ea) target.ea = node.ea['@_typeface'] || '';
    // latin 폰트
    if (node.latin) target.latin = node.latin['@_typeface'] || '';
  }
}

/** 테마 참조를 실제 폰트명으로 변환 */
function _resolveThemeFont(rFonts, themeFonts) {
  if (!rFonts) return null;
  // 직접 폰트명 먼저
  const direct = rFonts['@_w:eastAsia'] || rFonts['@_w:ascii'] || rFonts['@_w:hAnsi'];
  if (direct) return direct;
  // 테마 참조 해석
  const eaTheme = rFonts['@_w:eastAsiaTheme'] || '';
  const asciiTheme = rFonts['@_w:asciiTheme'] || '';
  if (eaTheme.includes('major')) return themeFonts.major.ea || themeFonts.major.latin || null;
  if (eaTheme.includes('minor')) return themeFonts.minor.ea || themeFonts.minor.latin || null;
  if (asciiTheme.includes('major')) return themeFonts.major.latin || null;
  if (asciiTheme.includes('minor')) return themeFonts.minor.latin || null;
  return null;
}

/**
 * word/styles.xml에서 스타일 ID → 이름 매핑 + 스타일 속성(폰트/크기/줄간격) 추출
 */
function _buildStyleIdMap(stylesXml, nameMap, propsMap, docDefaults, themeFonts) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    isArray: (name) => ['w:style'].includes(name),
  });
  const parsed = parser.parse(stylesXml);

  // 문서 기본값 (w:docDefaults)
  const dd = _dig(parsed, 'w:styles', 'w:docDefaults');
  if (dd) {
    const rPrDef = _dig(dd, 'w:rPrDefault', 'w:rPr');
    if (rPrDef) {
      const rFonts = rPrDef['w:rFonts'];
      docDefaults.font = _resolveThemeFont(rFonts, themeFonts);
      const sz = rPrDef['w:sz'];
      if (sz && sz['@_w:val']) docDefaults.size = parseInt(sz['@_w:val'], 10) / 2;
    }
    const pPrDef = _dig(dd, 'w:pPrDefault', 'w:pPr');
    if (pPrDef) {
      const sp = pPrDef['w:spacing'];
      if (sp) {
        const line = parseInt(sp['@_w:line'] || '0', 10);
        const lineRule = sp['@_w:lineRule'] || 'auto';
        if (line && lineRule === 'auto') docDefaults.lineHeight = Math.round(line / 240 * 100);
        const before = parseInt(sp['@_w:before'] || '0', 10);
        const after = parseInt(sp['@_w:after'] || '0', 10);
        if (before) docDefaults.spaceBefore = before * 5;
        if (after) docDefaults.spaceAfter = after * 5;
      }
    }
  }

  const styles = _dig(parsed, 'w:styles', 'w:style') || [];
  for (const style of styles) {
    const id = style['@_w:styleId'] || '';
    const nameNode = style['w:name'];
    const name = nameNode ? (nameNode['@_w:val'] || '') : '';
    if (id && name) nameMap[id] = name;

    // 스타일 속성 추출 (rPr, pPr)
    const props = {};
    const rPr = style['w:rPr'];
    if (rPr) {
      const rFonts = rPr['w:rFonts'];
      props.font = _resolveThemeFont(rFonts, themeFonts);
      const sz = rPr['w:sz'];
      if (sz && sz['@_w:val']) props.size = parseInt(sz['@_w:val'], 10) / 2;
      if (rPr['w:b'] !== undefined) props.bold = true;
    }
    const pPr = style['w:pPr'];
    if (pPr) {
      const jc = pPr['w:jc'];
      if (jc) {
        const val = jc['@_w:val'] || '';
        const map = { left: 'left', center: 'center', right: 'right', both: 'justify', justify: 'justify' };
        if (map[val]) props.align = map[val];
      }
      const sp = pPr['w:spacing'];
      if (sp) {
        const line = parseInt(sp['@_w:line'] || '0', 10);
        const lineRule = sp['@_w:lineRule'] || 'auto';
        if (line && lineRule === 'auto') props.lineHeight = Math.round(line / 240 * 100);
        const before = parseInt(sp['@_w:before'] || '0', 10);
        const after = parseInt(sp['@_w:after'] || '0', 10);
        if (before) props.spaceBefore = before * 5;
        if (after) props.spaceAfter = after * 5;
      }
      const ind = pPr['w:ind'];
      if (ind) {
        const left = parseInt(ind['@_w:left'] || '0', 10);
        if (left) props.indentLeft = left * 5;
      }
    }
    // font/size/spacing 없으면 docDefaults에서 가져오기
    if (!props.font && docDefaults.font) props.font = docDefaults.font;
    if (!props.size && docDefaults.size) props.size = docDefaults.size;
    if (!props.lineHeight && docDefaults.lineHeight) props.lineHeight = docDefaults.lineHeight;
    if (id && Object.keys(props).length > 0) propsMap[id] = props;
  }
}


function _mapStyle(styleId, styleIdToName) {
  // 먼저 ID로 직접 매핑
  if (STYLE_MAP[styleId]) return STYLE_MAP[styleId];
  // ID → 이름으로 변환 후 매핑
  const name = styleIdToName[styleId] || '';
  if (STYLE_MAP[name]) return STYLE_MAP[name];
  return 'body';
}


function _dig(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}


function _getDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder('utf-8');
    return (bytes) => decoder.decode(bytes);
  }
  // 수동 UTF-8 디코딩 (JSCore 폴리필)
  return (bytes) => {
    let str = '';
    let i = 0;
    while (i < bytes.length) {
      let c = bytes[i];
      if (c < 0x80) { str += String.fromCharCode(c); i++; }
      else if (c < 0xE0) { str += String.fromCharCode(((c & 0x1F) << 6) | (bytes[i+1] & 0x3F)); i += 2; }
      else if (c < 0xF0) { str += String.fromCharCode(((c & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F)); i += 3; }
      else {
        const cp = ((c & 0x07) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F);
        str += String.fromCodePoint(cp);
        i += 4;
      }
    }
    return str;
  };
}


/**
 * .docx 파일(base64)의 스타일 정보를 반환한다 (인스펙터용).
 * @param {string} base64Data
 * @returns {Array<Object>} 스타일 정보 리스트
 */
export function getDocxStyleReport(base64Data) {
  // 간소화 버전: parseDocx 호출 후 각 블록의 타입 정보만 반환
  const blocks = parseDocx(base64Data);
  return blocks.map(b => ({
    type: b.type,
    ir_mapping: b.type,
    text_preview: b.type === 'table'
      ? `[표 ${(b.rows || []).length}행]`
      : (b.runs || []).map(r => r.text || '').join('').slice(0, 50),
  }));
}
