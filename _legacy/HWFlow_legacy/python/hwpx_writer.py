"""
hwpx_writer.py — HWPX (ZIP + XML) 직접 생성 모듈

중간표현(IR) 리스트를 받아 한글에서 열 수 있는 .hwpx 파일을 생성한다.
LibreOffice 등 외부 도구 불필요.

중간표현 (Intermediate Representation) 구조:
[
    {
        "type": "heading1" | "heading2" | ... | "body",
        "runs": [
            {"text": "본문 텍스트", "bold": False, "color": "#000000"}
        ]
    },
    {
        "type": "table",
        "rows": [
            [{"text": "셀1", "bold": True}, {"text": "셀2"}],
            ...
        ],
        "has_header": True
    }
]
"""

import zipfile
import io
import os
import random
from typing import List, Dict, Any, Optional


# ─── 단위 변환 ──────────────────────────────────────────
# HWPX 내부 단위: HWPUNIT (1 inch = 7200 HWPUNIT, 1mm ≈ 283.46)
# 글꼴 크기: height 속성은 pt * 100 (예: 10pt = 1000)
MM_TO_HWPUNIT = 283.46
PT_TO_HEIGHT = 100  # charPr height 단위


def mm_to_hwpunit(mm: float) -> int:
    return round(mm * MM_TO_HWPUNIT)


def pt_to_height(pt: float) -> int:
    return round(pt * PT_TO_HEIGHT)


def _random_id() -> int:
    return random.randint(100000000, 2147483647)


# ─── 네임스페이스 ────────────────────────────────────────
NAMESPACES = {
    "ha": "http://www.hancom.co.kr/hwpml/2011/app",
    "hp": "http://www.hancom.co.kr/hwpml/2011/paragraph",
    "hp10": "http://www.hancom.co.kr/hwpml/2016/paragraph",
    "hs": "http://www.hancom.co.kr/hwpml/2011/section",
    "hc": "http://www.hancom.co.kr/hwpml/2011/core",
    "hh": "http://www.hancom.co.kr/hwpml/2011/head",
    "hhs": "http://www.hancom.co.kr/hwpml/2011/history",
    "hm": "http://www.hancom.co.kr/hwpml/2011/master-page",
    "hpf": "http://www.hancom.co.kr/schema/2011/hpf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "opf": "http://www.idpf.org/2007/opf/",
    "ooxmlchart": "http://www.hancom.co.kr/hwpml/2016/ooxmlchart",
    "hwpunitchar": "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar",
    "epub": "http://www.idpf.org/2007/ops",
    "config": "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
}

NS_ATTRS = " ".join(f'xmlns:{k}="{v}"' for k, v in NAMESPACES.items())


class HwpxWriter:
    """중간표현 리스트를 받아 .hwpx 파일을 생성한다."""

    def __init__(self, style_config: Dict[str, Any], title: str = ""):
        self.style = style_config
        self.title = title or "문서"
        self.fonts = self._collect_fonts()
        # 스타일 ID 매핑 (charPr / paraPr 를 빌드하면서 채움)
        self._char_prs: List[Dict] = []
        self._para_prs: List[Dict] = []
        self._border_fills: List[str] = []
        self._build_style_refs()

    # ─── 폰트 수집 ───────────────────────────────────────
    def _collect_fonts(self) -> List[str]:
        fonts = set()
        ps = self.style.get("paragraph_styles", {})
        for sty in ps.values():
            if "font" in sty:
                fonts.add(sty["font"])
        if not fonts:
            fonts.add("함초롬바탕")
        return sorted(fonts)

    def _font_id(self, font_name: str) -> int:
        try:
            return self.fonts.index(font_name)
        except ValueError:
            return 0

    # ─── 스타일 참조 빌드 ────────────────────────────────
    def _build_style_refs(self):
        """charPr, paraPr, borderFill 목록을 구성한다."""
        self._dynamic_bf_cache = {}  # (face_color, borders_str) -> bf_id
        # borderFill 0: 없음 (id=1), 1: 투명(id=2), 2: 테이블 헤더 배경(id=3), 3: 테이블 셀 테두리(id=4)
        self._border_fills = [
            self._make_border_fill(1, border="NONE"),
            self._make_border_fill(2, border="NONE", face_color="none"),
            self._make_border_fill(3, border="SOLID", face_color=self.style.get("colors", {}).get("table_head", "#D8D8D8")),
            self._make_border_fill(4, border="SOLID"),
        ]

        ps = self.style.get("paragraph_styles", {})

        # charPr 빌드: 각 paragraph_style에 대해 하나씩 + bold 변형
        # id=0: body normal
        # id=1: body (함초롬바탕 기본)
        # 각 스타일별로 charPr을 만들어서 매핑
        self._char_pr_map = {}  # style_name -> charPr id
        self._char_prs = []

        style_order = ["body", "heading1", "heading2", "heading3", "heading4",
                        "table_header", "table_body"]

        for style_name in style_order:
            sty = ps.get(style_name, ps.get("body", {}))
            cpr_id = len(self._char_prs)
            self._char_prs.append({
                "id": cpr_id,
                "height": pt_to_height(sty.get("size_pt", 10)),
                "bold": sty.get("bold", False),
                "font_id": self._font_id(sty.get("font", "함초롬바탕")),
                "color": sty.get("color", "#000000"),
                "border_fill_id": 2,  # 투명 배경
            })
            self._char_pr_map[style_name] = cpr_id

        # emphasis용 charPr (body 크기 + bold)
        body_sty = ps.get("body", {})
        emp_id = len(self._char_prs)
        self._char_prs.append({
            "id": emp_id,
            "height": pt_to_height(body_sty.get("size_pt", 10)),
            "bold": True,
            "font_id": self._font_id(body_sty.get("font", "함초롬바탕")),
            "color": "#000000",
            "border_fill_id": 2,
        })
        self._char_pr_map["emphasis"] = emp_id

        # paraPr 빌드
        self._para_pr_map = {}
        self._para_prs = []

        for style_name in style_order:
            sty = ps.get(style_name, ps.get("body", {}))
            ppr_id = len(self._para_prs)
            align_map = {"left": "LEFT", "center": "CENTER", "right": "RIGHT", "justify": "JUSTIFY"}
            self._para_prs.append({
                "id": ppr_id,
                "align": align_map.get(sty.get("align", "justify"), "JUSTIFY"),
                "indent_left": sty.get("indent_left_hwpunit", 0),
                "space_before": sty.get("space_before_hwpunit", 0),
                "space_after": sty.get("space_after_hwpunit", 0),
                "line_height": sty.get("line_height_percent", 160),
            })
            self._para_pr_map[style_name] = ppr_id

    # ─── borderFill XML ──────────────────────────────────
    def _make_border_fill(self, bf_id: int, border: str = "NONE",
                          face_color: Optional[str] = None,
                          borders: Optional[Dict] = None) -> str:
        """borders: {"top": {"type": "SOLID", "width": "0.12 mm"}, ...}"""
        default_width = "0.12 mm" if border == "SOLID" else "0.1 mm"
        xml = f'<hh:borderFill id="{bf_id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        xml += '<hh:slash type="NONE" Crooked="0" isCounter="0"/>'
        xml += '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        for side in ["left", "right", "top", "bottom"]:
            if borders and side in borders:
                s = borders[side]
                # 은선(HIDDEN)은 인쇄 안 됨 → NONE으로 변환
                side_type = s.get("type", border)
                if side_type == "HIDDEN":
                    side_type = "NONE"
                xml += f'<hh:{side}Border type="{side_type}" width="{s.get("width", default_width)}" color="#000000"/>'
            else:
                xml += f'<hh:{side}Border type="{border}" width="{default_width}" color="#000000"/>'
        xml += f'<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>'
        if face_color:
            hatch = "#C0FFFFFF" if face_color != "none" else "#999999"
            xml += f'<hc:fillBrush><hc:winBrush faceColor="{face_color}" hatchColor="{hatch}" alpha="0"/></hc:fillBrush>'
        xml += '</hh:borderFill>'
        return xml

    def _get_or_create_border_fill(self, face_color: Optional[str],
                                    borders: Optional[Dict]) -> int:
        """셀별 borderFill을 동적으로 생성/캐시하고 id(1-based)를 반환."""
        key = (face_color or "", str(borders or {}))
        if key in self._dynamic_bf_cache:
            return self._dynamic_bf_cache[key]
        bf_id = len(self._border_fills) + 1
        border_type = "SOLID"
        if borders:
            all_none = all(
                borders.get(s, {}).get("type", "SOLID") in ("NONE", "HIDDEN")
                for s in ["top", "bottom", "left", "right"]
            )
            if all_none:
                border_type = "NONE"
        self._border_fills.append(
            self._make_border_fill(bf_id, border=border_type,
                                   face_color=face_color, borders=borders)
        )
        self._dynamic_bf_cache[key] = bf_id
        return bf_id

    def _get_or_create_cell_ppr(self, align: str) -> int:
        """셀별 정렬에 해당하는 paraPr id를 동적으로 생성/캐시."""
        align_upper = {"left": "LEFT", "center": "CENTER",
                       "right": "RIGHT", "justify": "JUSTIFY"}.get(align, "LEFT")
        cache_key = f"_cell_{align_upper}"
        if cache_key in self._para_pr_map:
            return self._para_pr_map[cache_key]
        ppr_id = len(self._para_prs)
        self._para_prs.append({
            "id": ppr_id,
            "align": align_upper,
            "indent_left": 0,
            "space_before": 0,
            "space_after": 0,
            "line_height": self.style.get("paragraph_styles", {}).get(
                "table_body", {}).get("line_height_percent", 150),
        })
        self._para_pr_map[cache_key] = ppr_id
        return ppr_id

    # ─── charPr XML ──────────────────────────────────────
    def _charpr_xml(self, cpr: Dict) -> str:
        fid = cpr["font_id"]
        font_refs = " ".join(f'{lang}="{fid}"' for lang in
                             ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"])
        bold_tag = "<hh:bold/>" if cpr.get("bold") else ""
        return (
            f'<hh:charPr id="{cpr["id"]}" height="{cpr["height"]}" '
            f'textColor="{cpr.get("color", "#000000")}" shadeColor="none" '
            f'useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="{cpr["border_fill_id"]}">'
            f'<hh:fontRef {font_refs}/>'
            f'<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
            f'<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
            f'<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
            f'<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
            f'{bold_tag}'
            f'<hh:underline type="NONE" shape="SOLID" color="#000000"/>'
            f'<hh:strikeout shape="NONE" color="#000000"/>'
            f'<hh:outline type="NONE"/>'
            f'<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>'
            f'</hh:charPr>'
        )

    # ─── paraPr XML ──────────────────────────────────────
    def _parapr_xml(self, ppr: Dict) -> str:
        return (
            f'<hh:paraPr id="{ppr["id"]}" tabPrIDRef="0" condense="0" '
            f'fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
            f'<hh:align horizontal="{ppr["align"]}" vertical="BASELINE"/>'
            f'<hh:heading type="NONE" idRef="0" level="0"/>'
            f'<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" '
            f'widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
            f'<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>'
            f'<hh:margin>'
            f'<hc:intent value="0" unit="HWPUNIT"/>'
            f'<hc:left value="{ppr["indent_left"]}" unit="HWPUNIT"/>'
            f'<hc:right value="0" unit="HWPUNIT"/>'
            f'<hc:prev value="{ppr["space_before"]}" unit="HWPUNIT"/>'
            f'<hc:next value="{ppr["space_after"]}" unit="HWPUNIT"/>'
            f'</hh:margin>'
            f'<hh:lineSpacing type="PERCENT" value="{ppr["line_height"]}" unit="HWPUNIT"/>'
            f'<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" '
            f'offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
            f'</hh:paraPr>'
        )

    # ─── 파일 생성 진입점 ────────────────────────────────
    def write(self, ir_blocks: List[Dict[str, Any]], output_path: str):
        """중간표현 블록 리스트를 받아 .hwpx 파일로 저장한다."""
        # section을 먼저 생성 → 동적 borderFill/paraPr이 추가된 후 header 생성
        section_xml = self._section_xml(ir_blocks)
        header_xml = self._header_xml()

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # mimetype 은 압축 없이 첫 번째로
            zf.writestr("mimetype", "application/hwp+zip", compress_type=zipfile.ZIP_STORED)
            zf.writestr("version.xml", self._version_xml())
            zf.writestr("META-INF/container.xml", self._container_xml())
            zf.writestr("META-INF/manifest.xml", self._manifest_xml())
            zf.writestr("META-INF/container.rdf", self._container_rdf())
            zf.writestr("Contents/content.hpf", self._content_hpf())
            zf.writestr("Contents/header.xml", header_xml)
            zf.writestr("Contents/section0.xml", section_xml)
            zf.writestr("settings.xml", self._settings_xml())
            # Preview
            preview_text = self._preview_text(ir_blocks)
            zf.writestr("Preview/PrvText.txt", preview_text)

        with open(output_path, "wb") as f:
            f.write(buf.getvalue())

    # ─── 메타 XML 파일들 ─────────────────────────────────
    def _version_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" '
            'tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" '
            'os="10" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="12.0.0.0"/>'
        )

    def _container_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" '
            'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">'
            '<ocf:rootfiles>'
            '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>'
            '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>'
            '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>'
            '</ocf:rootfiles>'
            '</ocf:container>'
        )

    def _manifest_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
        )

    def _container_rdf(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            '<rdf:Description rdf:about="">'
            '<ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/>'
            '</rdf:Description>'
            '<rdf:Description rdf:about="Contents/header.xml">'
            '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/>'
            '</rdf:Description>'
            '<rdf:Description rdf:about="">'
            '<ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/>'
            '</rdf:Description>'
            '<rdf:Description rdf:about="Contents/section0.xml">'
            '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/>'
            '</rdf:Description>'
            '<rdf:Description rdf:about="">'
            '<rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/>'
            '</rdf:Description>'
            '</rdf:RDF>'
        )

    def _content_hpf(self) -> str:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            f'<opf:package {NS_ATTRS} version="" unique-identifier="" id="">'
            '<opf:metadata>'
            f'<opf:title>{_escape(self.title)}</opf:title>'
            '<opf:language>ko</opf:language>'
            f'<opf:meta name="creator" content="text">HWFlow</opf:meta>'
            '<opf:meta name="subject" content="text"/>'
            '<opf:meta name="description" content="text"/>'
            '<opf:meta name="lastsaveby" content="text">HWFlow</opf:meta>'
            f'<opf:meta name="CreatedDate" content="text">{now}</opf:meta>'
            f'<opf:meta name="ModifiedDate" content="text">{now}</opf:meta>'
            '<opf:meta name="keyword" content="text"/>'
            '</opf:metadata>'
            '<opf:manifest>'
            '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
            '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
            '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>'
            '</opf:manifest>'
            '<opf:spine>'
            '<opf:itemref idref="header" linear="yes"/>'
            '<opf:itemref idref="section0" linear="yes"/>'
            '</opf:spine>'
            '</opf:package>'
        )

    def _settings_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
            f'<ha:HWPApplicationSetting {NS_ATTRS}>'
            '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>'
            '</ha:HWPApplicationSetting>'
        )

    # ─── header.xml (스타일 정의) ────────────────────────
    def _header_xml(self) -> str:
        xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        xml += f'<hh:head {NS_ATTRS} version="1.5" secCnt="1">'
        xml += '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
        xml += '<hh:refList>'

        # fontfaces
        font_cnt = len(self.fonts)
        xml += f'<hh:fontfaces itemCnt="7">'
        for lang in ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]:
            xml += f'<hh:fontface lang="{lang}" fontCnt="{font_cnt}">'
            for i, fname in enumerate(self.fonts):
                xml += f'<hh:font id="{i}" face="{_escape(fname)}" type="TTF" isEmbedded="0"/>'
            xml += '</hh:fontface>'
        xml += '</hh:fontfaces>'

        # borderFills
        xml += f'<hh:borderFills itemCnt="{len(self._border_fills)}">'
        for bf in self._border_fills:
            xml += bf
        xml += '</hh:borderFills>'

        # charProperties
        xml += f'<hh:charProperties itemCnt="{len(self._char_prs)}">'
        for cpr in self._char_prs:
            xml += self._charpr_xml(cpr)
        xml += '</hh:charProperties>'

        # tabProperties
        xml += '<hh:tabProperties itemCnt="1">'
        xml += '<hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>'
        xml += '</hh:tabProperties>'

        # numberings (빈 목록)
        xml += '<hh:numberings itemCnt="0"/>'

        # bullets (빈 목록)
        xml += '<hh:bullets itemCnt="0"/>'

        # paraProperties
        xml += f'<hh:paraProperties itemCnt="{len(self._para_prs)}">'
        for ppr in self._para_prs:
            xml += self._parapr_xml(ppr)
        xml += '</hh:paraProperties>'

        # styles
        xml += '<hh:styles itemCnt="1">'
        xml += ('<hh:style id="0" type="PARA" name="바탕글" engName="Normal" '
                'paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langIDRef="0" lockForm="0"/>')
        xml += '</hh:styles>'

        # compatibleDocument
        xml += '<hh:compatibleDocument targetProgram="HWP201X"/>'

        xml += '</hh:refList>'

        # docOption
        xml += '<hh:docOption>'
        xml += '<hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/>'
        xml += '</hh:docOption>'

        xml += '</hh:head>'
        return xml

    # ─── section0.xml (본문) ─────────────────────────────
    def _section_xml(self, ir_blocks: List[Dict[str, Any]]) -> str:
        page = self.style.get("page", {})
        margin = page.get("margin", {})
        page_w = mm_to_hwpunit(page.get("width_mm", 210))
        page_h = mm_to_hwpunit(page.get("height_mm", 297))
        m_top = mm_to_hwpunit(margin.get("top_mm", 20))
        m_bottom = mm_to_hwpunit(margin.get("bottom_mm", 15))
        m_left = mm_to_hwpunit(margin.get("left_mm", 15))
        m_right = mm_to_hwpunit(margin.get("right_mm", 15))
        m_header = mm_to_hwpunit(page.get("header_height_mm", 15))
        m_footer = mm_to_hwpunit(page.get("footer_height_mm", 15))

        xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        xml += f'<hs:sec {NS_ATTRS}>'

        # 첫 번째 단락에 섹션 속성 (secPr) 포함
        first_block = ir_blocks[0] if ir_blocks else {"type": "body", "runs": []}
        first_style = first_block.get("type", "body")
        if first_style == "table":
            first_style = "body"

        ppr_id = self._para_pr_map.get(first_style, 0)
        cpr_id = self._char_pr_map.get(first_style, 0)

        xml += f'<hp:p id="{_random_id()}" paraPrIDRef="{ppr_id}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        xml += f'<hp:run charPrIDRef="{cpr_id}">'

        # secPr
        xml += (
            f'<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" '
            f'tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" '
            f'outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">'
            f'<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
            f'<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
            f'<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" '
            f'border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
            f'<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
            f'<hp:pagePr landscape="WIDELY" width="{page_w}" height="{page_h}" gutterType="LEFT_ONLY">'
            f'<hp:margin header="{m_header}" footer="{m_footer}" gutter="0" '
            f'left="{m_left}" right="{m_right}" top="{m_top}" bottom="{m_bottom}"/>'
            f'</hp:pagePr>'
            f'<hp:footNotePr>'
            f'<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>'
            f'<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>'
            f'<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>'
            f'<hp:numbering type="CONTINUOUS" newNum="1"/>'
            f'<hp:placement place="EACH_COLUMN" beneathText="0"/>'
            f'</hp:footNotePr>'
            f'<hp:endNotePr>'
            f'<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>'
            f'<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>'
            f'<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>'
            f'<hp:numbering type="CONTINUOUS" newNum="1"/>'
            f'<hp:placement place="END_OF_DOCUMENT" beneathText="0"/>'
            f'</hp:endNotePr>'
            f'<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" '
            f'headerInside="0" footerInside="0" fillArea="PAPER">'
            f'<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>'
            f'</hp:pageBorderFill>'
            f'<hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" '
            f'headerInside="0" footerInside="0" fillArea="PAPER">'
            f'<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>'
            f'</hp:pageBorderFill>'
            f'<hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" '
            f'headerInside="0" footerInside="0" fillArea="PAPER">'
            f'<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>'
            f'</hp:pageBorderFill>'
            f'</hp:secPr>'
        )

        xml += '<hp:ctrl>'
        xml += '<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>'
        xml += '</hp:ctrl>'
        xml += '</hp:run>'

        # 첫 번째 블록 내용 (표가 아닌 경우에만)
        if first_block.get("type") != "table":
            for run in first_block.get("runs", []):
                cpr_ref = self._get_run_charpr(first_style, run)
                xml += f'<hp:run charPrIDRef="{cpr_ref}">'
                xml += f'<hp:t>{_escape(run.get("text", ""))}</hp:t>'
                xml += '</hp:run>'
        xml += '</hp:p>'

        # 나머지 블록들
        start_idx = 0 if first_block.get("type") == "table" else 1
        for block in ir_blocks[start_idx:]:
            block_type = block.get("type", "body")
            if block_type == "table":
                xml += self._table_xml(block)
            else:
                xml += self._paragraph_xml(block)

        xml += '</hs:sec>'
        return xml

    def _get_run_charpr(self, style_name: str, run: Dict) -> int:
        """run의 bold/color 등에 따라 적절한 charPr id를 반환한다."""
        if run.get("bold"):
            return self._char_pr_map.get("emphasis", 0)
        return self._char_pr_map.get(style_name, 0)

    def _paragraph_xml(self, block: Dict) -> str:
        style_name = block.get("type", "body")
        ppr_id = self._para_pr_map.get(style_name, 0)
        cpr_id = self._char_pr_map.get(style_name, 0)
        runs = block.get("runs", [])

        xml = f'<hp:p id="{_random_id()}" paraPrIDRef="{ppr_id}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        if not runs:
            xml += f'<hp:run charPrIDRef="{cpr_id}"/>'
        else:
            for run in runs:
                cpr_ref = self._get_run_charpr(style_name, run)
                xml += f'<hp:run charPrIDRef="{cpr_ref}">'
                xml += f'<hp:t>{_escape(run.get("text", ""))}</hp:t>'
                xml += '</hp:run>'
        xml += '</hp:p>'
        return xml

    # ─── 표 XML ──────────────────────────────────────────
    def _table_xml(self, block: Dict) -> str:
        rows = block.get("rows", [])
        has_header = block.get("has_header", True)
        if not rows:
            return ""

        col_count = max(len(row) for row in rows)
        row_count = len(rows)

        ts = self.style.get("table_style", {})
        cell_ml = ts.get("cell_margin_left", 510)
        cell_mr = ts.get("cell_margin_right", 510)
        cell_mt = ts.get("cell_margin_top", 141)
        cell_mb = ts.get("cell_margin_bottom", 141)

        # 페이지 여백 제외한 본문 폭 계산
        page = self.style.get("page", {})
        margin = page.get("margin", {})
        body_width = mm_to_hwpunit(page.get("width_mm", 210)) - mm_to_hwpunit(margin.get("left_mm", 15)) - mm_to_hwpunit(margin.get("right_mm", 15))
        col_width = body_width // col_count
        row_height = 1500  # 기본 행 높이

        # 표를 감싸는 빈 단락
        body_ppr = self._para_pr_map.get("body", 0)
        body_cpr = self._char_pr_map.get("body", 0)

        xml = f'<hp:p id="{_random_id()}" paraPrIDRef="{body_ppr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        xml += f'<hp:run charPrIDRef="{body_cpr}">'

        total_width = col_width * col_count
        total_height = row_height * row_count

        xml += (
            f'<hp:tbl id="{_random_id()}" zOrder="0" numberingType="TABLE" '
            f'textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" '
            f'pageBreak="CELL" repeatHeader="1" '
            f'rowCnt="{row_count}" colCnt="{col_count}" cellSpacing="0" borderFillIDRef="4" noAdjust="0">'
            f'<hp:sz width="{total_width}" widthRelTo="ABSOLUTE" '
            f'height="{total_height}" heightRelTo="ABSOLUTE" protect="0"/>'
            f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
            f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" '
            f'vertOffset="0" horzOffset="0"/>'
            f'<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
            f'<hp:inMargin left="{cell_ml}" right="{cell_mr}" top="{cell_mt}" bottom="{cell_mb}"/>'
        )

        header_color = self.style.get("colors", {}).get("table_head", "#D8D8D8")

        for r_idx, row in enumerate(rows):
            is_header_row = has_header and r_idx == 0
            xml += '<hp:tr>'
            for c_idx in range(col_count):
                cell = row[c_idx] if c_idx < len(row) else {}

                # 셀별 배경색 결정
                cell_bg = cell.get("bg_color")
                if cell_bg is None and is_header_row:
                    cell_bg = header_color

                # 셀별 테두리 결정
                cell_borders = cell.get("borders")

                # 셀별 borderFill 동적 결정
                if cell_bg or cell_borders:
                    bf_ref = self._get_or_create_border_fill(cell_bg, cell_borders)
                elif is_header_row:
                    bf_ref = 3
                else:
                    bf_ref = 4

                # 셀별 정렬 결정
                cell_align = cell.get("align")
                cell_valign = cell.get("valign", "CENTER").upper()
                if cell_align:
                    cell_ppr = self._get_or_create_cell_ppr(cell_align)
                else:
                    cell_style = "table_header" if is_header_row else "table_body"
                    cell_ppr = self._para_pr_map.get(cell_style, 0)

                cell_style = "table_header" if is_header_row else "table_body"
                cell_cpr = self._char_pr_map.get(cell_style, 0)

                xml += f'<hp:tc name="" header="{1 if is_header_row else 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{bf_ref}">'
                xml += (
                    f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="{cell_valign}" '
                    f'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                )
                xml += f'<hp:p id="{_random_id()}" paraPrIDRef="{cell_ppr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
                cell_runs = cell.get("runs", [])
                if not cell_runs:
                    cell_runs = [{"text": cell.get("text", ""), "bold": cell.get("bold", False)}]
                for cr in cell_runs:
                    cr_cpr = cell_cpr
                    if cr.get("bold") and not is_header_row:
                        cr_cpr = self._char_pr_map.get("emphasis", cell_cpr)
                    xml += f'<hp:run charPrIDRef="{cr_cpr}">'
                    xml += f'<hp:t>{_escape(cr.get("text", ""))}</hp:t>'
                    xml += '</hp:run>'
                xml += '</hp:p>'
                xml += '</hp:subList>'
                xml += f'<hp:cellAddr colAddr="{c_idx}" rowAddr="{r_idx}"/>'
                xml += f'<hp:cellSpan colSpan="1" rowSpan="1"/>'
                xml += f'<hp:cellSz width="{col_width}" height="{row_height}"/>'
                xml += f'<hp:cellMargin left="{cell_ml}" right="{cell_mr}" top="{cell_mt}" bottom="{cell_mb}"/>'
                xml += '</hp:tc>'
            xml += '</hp:tr>'

        xml += '</hp:tbl>'
        xml += '</hp:run>'
        xml += '</hp:p>'
        return xml

    # ─── Preview ─────────────────────────────────────────
    def _preview_text(self, ir_blocks: List[Dict[str, Any]]) -> str:
        lines = []
        for block in ir_blocks:
            if block.get("type") == "table":
                for row in block.get("rows", []):
                    cell_texts = []
                    for cell in row:
                        runs = cell.get("runs", [])
                        if runs:
                            cell_texts.append("".join(r.get("text", "") for r in runs))
                        else:
                            cell_texts.append(cell.get("text", ""))
                    lines.append("\t".join(cell_texts))
            else:
                texts = [r.get("text", "") for r in block.get("runs", [])]
                lines.append("".join(texts))
        return "\n".join(lines)


def _escape(text: str) -> str:
    """XML 특수문자 이스케이프."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))
