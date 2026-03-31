/**
 * hwpx_writer.js — HWPX (ZIP + XML) 직접 생성 모듈
 *
 * 중간표현(IR) 리스트를 받아 한글에서 열 수 있는 .hwpx 파일을 생성한다.
 * fflate로 ZIP 생성, JavaScriptCore 호환.
 */

import { zipSync } from 'fflate';
import { mmToHwpunit, ptToHeight, randomId, escapeXml, encodeUTF8 } from './utils.js';

// ─── 네임스페이스 ──────────────────────────────────────────
const NAMESPACES = {
  ha: 'http://www.hancom.co.kr/hwpml/2011/app',
  hp: 'http://www.hancom.co.kr/hwpml/2011/paragraph',
  hp10: 'http://www.hancom.co.kr/hwpml/2016/paragraph',
  hs: 'http://www.hancom.co.kr/hwpml/2011/section',
  hc: 'http://www.hancom.co.kr/hwpml/2011/core',
  hh: 'http://www.hancom.co.kr/hwpml/2011/head',
  hhs: 'http://www.hancom.co.kr/hwpml/2011/history',
  hm: 'http://www.hancom.co.kr/hwpml/2011/master-page',
  hpf: 'http://www.hancom.co.kr/schema/2011/hpf',
  dc: 'http://purl.org/dc/elements/1.1/',
  opf: 'http://www.idpf.org/2007/opf/',
  ooxmlchart: 'http://www.hancom.co.kr/hwpml/2016/ooxmlchart',
  hwpunitchar: 'http://www.hancom.co.kr/hwpml/2016/HwpUnitChar',
  epub: 'http://www.idpf.org/2007/ops',
  config: 'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
};

const NS_ATTRS = Object.entries(NAMESPACES).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ');


export class HwpxWriter {
  constructor(styleConfig, title = '') {
    this.style = styleConfig;
    this.title = title || '문서';
    this.fonts = this._collectFonts();
    this._charPrs = [];
    this._paraPrs = [];
    this._borderFills = [];
    this._charPrMap = {};
    this._paraPrMap = {};
    this._dynamicBfCache = {};
    this._buildStyleRefs();
  }

  // ─── 폰트 수집 ─────────────────────────────────────────
  _collectFonts() {
    const fonts = new Set();
    const ps = this.style.paragraph_styles || {};
    for (const sty of Object.values(ps)) {
      if (sty.font) fonts.add(sty.font);
    }
    if (fonts.size === 0) fonts.add('함초롬바탕');
    return [...fonts].sort();
  }

  _fontId(fontName) {
    const idx = this.fonts.indexOf(fontName);
    return idx >= 0 ? idx : 0;
  }

  // ─── 스타일 참조 빌드 ──────────────────────────────────
  _buildStyleRefs() {
    this._dynamicBfCache = {};
    // borderFill: 0=없음(id=1), 1=투명(id=2), 2=테이블헤더(id=3), 3=셀테두리(id=4)
    this._borderFills = [
      this._makeBorderFill(1, 'NONE'),
      this._makeBorderFill(2, 'NONE', 'none'),
      this._makeBorderFill(3, 'SOLID', (this.style.colors || {}).table_head || '#D8D8D8'),
      this._makeBorderFill(4, 'SOLID'),
    ];

    const ps = this.style.paragraph_styles || {};
    const styleOrder = ['body', 'heading1', 'heading2', 'heading3', 'heading4',
                        'table_header', 'table_body'];

    // charPr 빌드
    this._charPrMap = {};
    this._charPrs = [];

    for (const styleName of styleOrder) {
      const sty = ps[styleName] || ps.body || {};
      const cprId = this._charPrs.length;
      this._charPrs.push({
        id: cprId,
        height: ptToHeight(sty.size_pt || 10),
        bold: sty.bold || false,
        font_id: this._fontId(sty.font || '함초롬바탕'),
        color: sty.color || '#000000',
        border_fill_id: 2,
      });
      this._charPrMap[styleName] = cprId;
    }

    // emphasis용 charPr (body 크기 + bold)
    const bodySty = ps.body || {};
    const empId = this._charPrs.length;
    this._charPrs.push({
      id: empId,
      height: ptToHeight(bodySty.size_pt || 10),
      bold: true,
      font_id: this._fontId(bodySty.font || '함초롬바탕'),
      color: '#000000',
      border_fill_id: 2,
    });
    this._charPrMap.emphasis = empId;

    // paraPr 빌드
    this._paraPrMap = {};
    this._paraPrs = [];
    const alignMap = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFY' };

    for (const styleName of styleOrder) {
      const sty = ps[styleName] || ps.body || {};
      const pprId = this._paraPrs.length;
      this._paraPrs.push({
        id: pprId,
        align: alignMap[sty.align || 'justify'] || 'JUSTIFY',
        indent_left: sty.indent_left_hwpunit || 0,
        space_before: sty.space_before_hwpunit || 0,
        space_after: sty.space_after_hwpunit || 0,
        line_height: sty.line_height_percent || 160,
      });
      this._paraPrMap[styleName] = pprId;
    }
  }

  // ─── borderFill XML ────────────────────────────────────
  _makeBorderFill(bfId, border, faceColor, borders) {
    const defaultWidth = border === 'SOLID' ? '0.12 mm' : '0.1 mm';
    let xml = `<hh:borderFill id="${bfId}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">`;
    xml += '<hh:slash type="NONE" Crooked="0" isCounter="0"/>';
    xml += '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>';
    for (const side of ['left', 'right', 'top', 'bottom']) {
      if (borders && borders[side]) {
        const s = borders[side];
        let sideType = s.type || border;
        if (sideType === 'HIDDEN') sideType = 'NONE';
        xml += `<hh:${side}Border type="${sideType}" width="${s.width || defaultWidth}" color="#000000"/>`;
      } else {
        xml += `<hh:${side}Border type="${border}" width="${defaultWidth}" color="#000000"/>`;
      }
    }
    xml += '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>';
    if (faceColor) {
      const hatch = faceColor !== 'none' ? '#C0FFFFFF' : '#999999';
      xml += `<hc:fillBrush><hc:winBrush faceColor="${faceColor}" hatchColor="${hatch}" alpha="0"/></hc:fillBrush>`;
    }
    xml += '</hh:borderFill>';
    return xml;
  }

  _getOrCreateBorderFill(faceColor, borders) {
    const key = (faceColor || '') + '|' + JSON.stringify(borders || {});
    if (this._dynamicBfCache[key] !== undefined) return this._dynamicBfCache[key];
    const bfId = this._borderFills.length + 1;
    let borderType = 'SOLID';
    if (borders) {
      const allNone = ['top', 'bottom', 'left', 'right'].every(s => {
        const t = (borders[s] || {}).type || 'SOLID';
        return t === 'NONE' || t === 'HIDDEN';
      });
      if (allNone) borderType = 'NONE';
    }
    this._borderFills.push(this._makeBorderFill(bfId, borderType, faceColor, borders));
    this._dynamicBfCache[key] = bfId;
    return bfId;
  }

  _getOrCreateCellPpr(align) {
    const alignUpper = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFY' }[align] || 'LEFT';
    const cacheKey = `_cell_${alignUpper}`;
    if (this._paraPrMap[cacheKey] !== undefined) return this._paraPrMap[cacheKey];
    const pprId = this._paraPrs.length;
    this._paraPrs.push({
      id: pprId,
      align: alignUpper,
      indent_left: 0,
      space_before: 0,
      space_after: 0,
      line_height: ((this.style.paragraph_styles || {}).table_body || {}).line_height_percent || 150,
    });
    this._paraPrMap[cacheKey] = pprId;
    return pprId;
  }

  // ─── charPr XML ────────────────────────────────────────
  _charprXml(cpr) {
    const fid = cpr.font_id;
    const langs = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
    const fontRefs = langs.map(l => `${l}="${fid}"`).join(' ');
    const boldTag = cpr.bold ? '<hh:bold/>' : '';
    return (
      `<hh:charPr id="${cpr.id}" height="${cpr.height}" ` +
      `textColor="${cpr.color || '#000000'}" shadeColor="none" ` +
      `useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="${cpr.border_fill_id}">` +
      `<hh:fontRef ${fontRefs}/>` +
      `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
      `<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
      `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
      `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
      boldTag +
      `<hh:underline type="NONE" shape="SOLID" color="#000000"/>` +
      `<hh:strikeout shape="NONE" color="#000000"/>` +
      `<hh:outline type="NONE"/>` +
      `<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>` +
      `</hh:charPr>`
    );
  }

  // ─── paraPr XML ────────────────────────────────────────
  _paraprXml(ppr) {
    return (
      `<hh:paraPr id="${ppr.id}" tabPrIDRef="0" condense="0" ` +
      `fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
      `<hh:align horizontal="${ppr.align}" vertical="BASELINE"/>` +
      `<hh:heading type="NONE" idRef="0" level="0"/>` +
      `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" ` +
      `widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
      `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
      `<hh:margin>` +
      `<hc:intent value="0" unit="HWPUNIT"/>` +
      `<hc:left value="${ppr.indent_left}" unit="HWPUNIT"/>` +
      `<hc:right value="0" unit="HWPUNIT"/>` +
      `<hc:prev value="${ppr.space_before}" unit="HWPUNIT"/>` +
      `<hc:next value="${ppr.space_after}" unit="HWPUNIT"/>` +
      `</hh:margin>` +
      `<hh:lineSpacing type="PERCENT" value="${ppr.line_height}" unit="HWPUNIT"/>` +
      `<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" ` +
      `offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
      `</hh:paraPr>`
    );
  }

  // ─── 파일 생성 진입점 ──────────────────────────────────
  write(irBlocks) {
    // section을 먼저 생성 → 동적 borderFill/paraPr 추가된 후 header 생성
    const sectionXml = this._sectionXml(irBlocks);
    const headerXml = this._headerXml();

    const files = {
      'mimetype': [encodeUTF8('application/hwp+zip'), { level: 0 }],
      'version.xml': encodeUTF8(this._versionXml()),
      'META-INF/container.xml': encodeUTF8(this._containerXml()),
      'META-INF/manifest.xml': encodeUTF8(this._manifestXml()),
      'META-INF/container.rdf': encodeUTF8(this._containerRdf()),
      'Contents/content.hpf': encodeUTF8(this._contentHpf()),
      'Contents/header.xml': encodeUTF8(headerXml),
      'Contents/section0.xml': encodeUTF8(sectionXml),
      'settings.xml': encodeUTF8(this._settingsXml()),
      'Preview/PrvText.txt': encodeUTF8(this._previewText(irBlocks)),
    };

    return zipSync(files);
  }

  // ─── 메타 XML 파일들 ───────────────────────────────────
  _versionXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" ' +
      'tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" ' +
      'os="10" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="12.0.0.0"/>'
    );
  }

  _containerXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" ' +
      'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">' +
      '<ocf:rootfiles>' +
      '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>' +
      '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>' +
      '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>' +
      '</ocf:rootfiles>' +
      '</ocf:container>'
    );
  }

  _manifestXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
    );
  }

  _containerRdf() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="">' +
      '<ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/>' +
      '</rdf:Description>' +
      '<rdf:Description rdf:about="Contents/header.xml">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/>' +
      '</rdf:Description>' +
      '<rdf:Description rdf:about="">' +
      '<ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/>' +
      '</rdf:Description>' +
      '<rdf:Description rdf:about="Contents/section0.xml">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/>' +
      '</rdf:Description>' +
      '<rdf:Description rdf:about="">' +
      '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/>' +
      '</rdf:Description>' +
      '</rdf:RDF>'
    );
  }

  _contentHpf() {
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      `<opf:package ${NS_ATTRS} version="" unique-identifier="" id="">` +
      '<opf:metadata>' +
      `<opf:title>${escapeXml(this.title)}</opf:title>` +
      '<opf:language>ko</opf:language>' +
      '<opf:meta name="creator" content="text">HWFlow</opf:meta>' +
      '<opf:meta name="subject" content="text"/>' +
      '<opf:meta name="description" content="text"/>' +
      '<opf:meta name="lastsaveby" content="text">HWFlow</opf:meta>' +
      `<opf:meta name="CreatedDate" content="text">${now}</opf:meta>` +
      `<opf:meta name="ModifiedDate" content="text">${now}</opf:meta>` +
      '<opf:meta name="keyword" content="text"/>' +
      '</opf:metadata>' +
      '<opf:manifest>' +
      '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
      '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
      '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>' +
      '</opf:manifest>' +
      '<opf:spine>' +
      '<opf:itemref idref="header" linear="yes"/>' +
      '<opf:itemref idref="section0" linear="yes"/>' +
      '</opf:spine>' +
      '</opf:package>'
    );
  }

  _settingsXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      `<ha:HWPApplicationSetting ${NS_ATTRS}>` +
      '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>' +
      '</ha:HWPApplicationSetting>'
    );
  }

  // ─── header.xml (스타일 정의) ──────────────────────────
  _headerXml() {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
    xml += `<hh:head ${NS_ATTRS} version="1.5" secCnt="1">`;
    xml += '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>';
    xml += '<hh:refList>';

    // fontfaces
    const fontCnt = this.fonts.length;
    xml += '<hh:fontfaces itemCnt="7">';
    for (const lang of ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']) {
      xml += `<hh:fontface lang="${lang}" fontCnt="${fontCnt}">`;
      for (let i = 0; i < this.fonts.length; i++) {
        xml += `<hh:font id="${i}" face="${escapeXml(this.fonts[i])}" type="TTF" isEmbedded="0"/>`;
      }
      xml += '</hh:fontface>';
    }
    xml += '</hh:fontfaces>';

    // borderFills
    xml += `<hh:borderFills itemCnt="${this._borderFills.length}">`;
    for (const bf of this._borderFills) xml += bf;
    xml += '</hh:borderFills>';

    // charProperties
    xml += `<hh:charProperties itemCnt="${this._charPrs.length}">`;
    for (const cpr of this._charPrs) xml += this._charprXml(cpr);
    xml += '</hh:charProperties>';

    // tabProperties
    xml += '<hh:tabProperties itemCnt="1">';
    xml += '<hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>';
    xml += '</hh:tabProperties>';

    xml += '<hh:numberings itemCnt="0"/>';
    xml += '<hh:bullets itemCnt="0"/>';

    // paraProperties
    xml += `<hh:paraProperties itemCnt="${this._paraPrs.length}">`;
    for (const ppr of this._paraPrs) xml += this._paraprXml(ppr);
    xml += '</hh:paraProperties>';

    // styles
    xml += '<hh:styles itemCnt="1">';
    xml += '<hh:style id="0" type="PARA" name="바탕글" engName="Normal" ' +
           'paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langIDRef="0" lockForm="0"/>';
    xml += '</hh:styles>';

    xml += '<hh:compatibleDocument targetProgram="HWP201X"/>';
    xml += '</hh:refList>';

    xml += '<hh:docOption>';
    xml += '<hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/>';
    xml += '</hh:docOption>';

    xml += '</hh:head>';
    return xml;
  }

  // ─── section0.xml (본문) ───────────────────────────────
  _sectionXml(irBlocks) {
    const page = this.style.page || {};
    const margin = page.margin || {};
    const pageW = mmToHwpunit(page.width_mm || 210);
    const pageH = mmToHwpunit(page.height_mm || 297);
    const mTop = mmToHwpunit(margin.top_mm || 20);
    const mBottom = mmToHwpunit(margin.bottom_mm || 15);
    const mLeft = mmToHwpunit(margin.left_mm || 15);
    const mRight = mmToHwpunit(margin.right_mm || 15);
    const mHeader = mmToHwpunit(page.header_height_mm || 15);
    const mFooter = mmToHwpunit(page.footer_height_mm || 15);

    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
    xml += `<hs:sec ${NS_ATTRS}>`;

    // 첫 번째 단락에 섹션 속성 포함
    const firstBlock = irBlocks[0] || { type: 'body', runs: [] };
    let firstStyle = firstBlock.type || 'body';
    if (firstStyle === 'table' || firstStyle === 'image') firstStyle = 'body';

    const pprId = this._paraPrMap[firstStyle] || 0;
    const cprId = this._charPrMap[firstStyle] || 0;

    xml += `<hp:p id="${randomId()}" paraPrIDRef="${pprId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`;
    xml += `<hp:run charPrIDRef="${cprId}">`;

    // secPr
    xml +=
      `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" ` +
      `tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" ` +
      `outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
      `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>` +
      `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
      `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" ` +
      `border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
      `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
      `<hp:pagePr landscape="WIDELY" width="${pageW}" height="${pageH}" gutterType="LEFT_ONLY">` +
      `<hp:margin header="${mHeader}" footer="${mFooter}" gutter="0" ` +
      `left="${mLeft}" right="${mRight}" top="${mTop}" bottom="${mBottom}"/>` +
      `</hp:pagePr>` +
      `<hp:footNotePr>` +
      `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/>` +
      `<hp:placement place="EACH_COLUMN" beneathText="0"/>` +
      `</hp:footNotePr>` +
      `<hp:endNotePr>` +
      `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/>` +
      `<hp:placement place="END_OF_DOCUMENT" beneathText="0"/>` +
      `</hp:endNotePr>` +
      `<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" ` +
      `headerInside="0" footerInside="0" fillArea="PAPER">` +
      `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>` +
      `</hp:pageBorderFill>` +
      `<hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" ` +
      `headerInside="0" footerInside="0" fillArea="PAPER">` +
      `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>` +
      `</hp:pageBorderFill>` +
      `<hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" ` +
      `headerInside="0" footerInside="0" fillArea="PAPER">` +
      `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>` +
      `</hp:pageBorderFill>` +
      `</hp:secPr>`;

    xml += '<hp:ctrl>';
    xml += '<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>';
    xml += '</hp:ctrl>';
    xml += '</hp:run>';

    // 첫 번째 블록 내용 (표가 아닌 경우에만)
    if (firstBlock.type !== 'table') {
      for (const run of (firstBlock.runs || [])) {
        const cprRef = this._getRunCharpr(firstStyle, run);
        xml += `<hp:run charPrIDRef="${cprRef}">`;
        xml += `<hp:t>${escapeXml(run.text || '')}</hp:t>`;
        xml += '</hp:run>';
      }
    }
    xml += '</hp:p>';

    // 나머지 블록들
    const startIdx = firstBlock.type === 'table' ? 0 : 1;
    for (let i = startIdx; i < irBlocks.length; i++) {
      const block = irBlocks[i];
      const blockType = block.type || 'body';
      if (blockType === 'table') {
        xml += this._tableXml(block);
      } else if (blockType === 'image') {
        // 이미지 플레이스홀더 — 빈 단락 + [이미지] 텍스트
        xml += this._paragraphXml({ type: 'body', runs: [{ text: '[이미지 위치]', bold: false }] });
      } else {
        xml += this._paragraphXml(block);
      }
    }

    xml += '</hs:sec>';
    return xml;
  }

  _getRunCharpr(styleName, run) {
    if (run.bold) return this._charPrMap.emphasis || 0;
    return this._charPrMap[styleName] || 0;
  }

  _paragraphXml(block) {
    const styleName = block.type || 'body';
    const pprId = this._paraPrMap[styleName] || 0;
    const cprId = this._charPrMap[styleName] || 0;
    const runs = block.runs || [];

    let xml = `<hp:p id="${randomId()}" paraPrIDRef="${pprId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`;
    if (runs.length === 0) {
      xml += `<hp:run charPrIDRef="${cprId}"/>`;
    } else {
      for (const run of runs) {
        const cprRef = this._getRunCharpr(styleName, run);
        xml += `<hp:run charPrIDRef="${cprRef}">`;
        xml += `<hp:t>${escapeXml(run.text || '')}</hp:t>`;
        xml += '</hp:run>';
      }
    }
    xml += '</hp:p>';
    return xml;
  }

  // ─── 표 XML ────────────────────────────────────────────
  _tableXml(block) {
    const rows = block.rows || [];
    const hasHeader = block.has_header !== undefined ? block.has_header : true;
    if (rows.length === 0) return '';

    const colCount = Math.max(...rows.map(r => r.length));
    const rowCount = rows.length;

    const ts = this.style.table_style || {};
    const cellMl = ts.cell_margin_left || 510;
    const cellMr = ts.cell_margin_right || 510;
    const cellMt = ts.cell_margin_top || 141;
    const cellMb = ts.cell_margin_bottom || 141;

    const page = this.style.page || {};
    const pageMargin = page.margin || {};
    const bodyWidth = mmToHwpunit(page.width_mm || 210) - mmToHwpunit(pageMargin.left_mm || 15) - mmToHwpunit(pageMargin.right_mm || 15);
    const colWidth = Math.floor(bodyWidth / colCount);
    const rowHeight = 1500;

    const bodyPpr = this._paraPrMap.body || 0;
    const bodyCpr = this._charPrMap.body || 0;

    let xml = `<hp:p id="${randomId()}" paraPrIDRef="${bodyPpr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`;
    xml += `<hp:run charPrIDRef="${bodyCpr}">`;

    const totalWidth = colWidth * colCount;
    const totalHeight = rowHeight * rowCount;

    xml +=
      `<hp:tbl id="${randomId()}" zOrder="0" numberingType="TABLE" ` +
      `textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" ` +
      `pageBreak="CELL" repeatHeader="1" ` +
      `rowCnt="${rowCount}" colCnt="${colCount}" cellSpacing="0" borderFillIDRef="4" noAdjust="0">` +
      `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" ` +
      `height="${totalHeight}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" ` +
      `holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" ` +
      `vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
      `<hp:inMargin left="${cellMl}" right="${cellMr}" top="${cellMt}" bottom="${cellMb}"/>`;

    const headerColor = (this.style.colors || {}).table_head || '#D8D8D8';

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const isHeaderRow = hasHeader && rIdx === 0;
      xml += '<hp:tr>';
      for (let cIdx = 0; cIdx < colCount; cIdx++) {
        const cell = cIdx < row.length ? row[cIdx] : {};

        // 병합에 의해 가려진 셀은 skip
        if (cell.merged) continue;

        const cs = cell.colspan || 1;
        const rs = cell.rowspan || 1;

        // 셀별 배경색 결정
        let cellBg = cell.bg_color || null;
        if (cellBg === null && isHeaderRow) cellBg = headerColor;

        // 셀별 테두리 결정
        const cellBorders = cell.borders || null;

        // 셀별 borderFill 동적 결정
        let bfRef;
        if (cellBg || cellBorders) {
          bfRef = this._getOrCreateBorderFill(cellBg, cellBorders);
        } else if (isHeaderRow) {
          bfRef = 3;
        } else {
          bfRef = 4;
        }

        // 셀별 정렬 결정
        const cellAlign = cell.align || null;
        const cellValign = (cell.valign || 'CENTER').toUpperCase();
        let cellPpr;
        if (cellAlign) {
          cellPpr = this._getOrCreateCellPpr(cellAlign);
        } else {
          const cellStyleKey = isHeaderRow ? 'table_header' : 'table_body';
          cellPpr = this._paraPrMap[cellStyleKey] || 0;
        }

        const cellStyleKey = isHeaderRow ? 'table_header' : 'table_body';
        const cellCpr = this._charPrMap[cellStyleKey] || 0;

        xml += `<hp:tc name="" header="${isHeaderRow ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bfRef}">`;
        xml += `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${cellValign}" ` +
               `linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`;
        xml += `<hp:p id="${randomId()}" paraPrIDRef="${cellPpr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`;

        let cellRuns = cell.runs || [];
        if (cellRuns.length === 0) {
          cellRuns = [{ text: cell.text || '', bold: cell.bold || false }];
        }
        for (const cr of cellRuns) {
          let crCpr = cellCpr;
          if (cr.bold && !isHeaderRow) {
            crCpr = this._charPrMap.emphasis || cellCpr;
          }
          xml += `<hp:run charPrIDRef="${crCpr}">`;
          xml += `<hp:t>${escapeXml(cr.text || '')}</hp:t>`;
          xml += '</hp:run>';
        }
        xml += '</hp:p>';
        xml += '</hp:subList>';
        xml += `<hp:cellAddr colAddr="${cIdx}" rowAddr="${rIdx}"/>`;
        xml += `<hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/>`;
        xml += `<hp:cellSz width="${colWidth * cs}" height="${rowHeight * rs}"/>`;
        xml += `<hp:cellMargin left="${cellMl}" right="${cellMr}" top="${cellMt}" bottom="${cellMb}"/>`;
        xml += '</hp:tc>';
      }
      xml += '</hp:tr>';
    }

    xml += '</hp:tbl>';
    xml += '</hp:run>';
    xml += '</hp:p>';
    return xml;
  }

  // ─── Preview ───────────────────────────────────────────
  _previewText(irBlocks) {
    const lines = [];
    for (const block of irBlocks) {
      if (block.type === 'table') {
        for (const row of (block.rows || [])) {
          const cellTexts = row.map(cell => {
            const runs = cell.runs || [];
            return runs.length > 0
              ? runs.map(r => r.text || '').join('')
              : (cell.text || '');
          });
          lines.push(cellTexts.join('\t'));
        }
      } else {
        const texts = (block.runs || []).map(r => r.text || '');
        lines.push(texts.join(''));
      }
    }
    return lines.join('\n');
  }
}
