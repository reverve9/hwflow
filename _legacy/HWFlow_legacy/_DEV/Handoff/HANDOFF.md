# HWFlow 핸드오프 문서
> 최종 업데이트: 2026-03-31 (웹 전환용 정리)

## 프로젝트 개요
마크다운(Claude 출력물) / .docx → 한글(.hwpx) 자동 변환기

## 핵심: JS 변환 엔진 (포팅 완료, 검증 완료)

Python 5개 파일을 JS로 1:1 포팅 완료. **그대로 복사하여 웹 프로젝트에서 사용 가능.**

### 소스 위치
```
/Volumes/NINE_DEV/PROJECT/HWFlow/js-engine/src/
├── parser_markdown.js   (202줄) — 마크다운 → IR
├── parser_docx.js       (350줄) — docx → IR (fflate + fast-xml-parser)
├── hwpx_writer.js       (675줄) — IR → HWPX ZIP (fflate)
├── utils.js             (106줄) — escapeXml, 단위변환, base64, UTF-8 폴리필
└── index.js             (53줄)  — 엔트리포인트 (참고용, 웹에서는 직접 import)
```

### npm 의존성
```json
{
  "fflate": "^0.8.2",
  "fast-xml-parser": "^4.5.1"
}
```

### 스타일 프리셋 위치
```
/Volumes/NINE_DEV/PROJECT/HWFlow/styles/
├── 공문서_표준.json
└── 입찰공고문_강원도경제진흥원.json
```

---

## JS 모듈 API 레퍼런스

### parser_markdown.js
```javascript
import { parseMarkdown } from './parser_markdown.js';

parseMarkdown(text: string): IRBlock[]
```
- 입력: 마크다운 텍스트
- 출력: IR 블록 배열
- 지원: `# ~ ####` 헤딩, `**bold**`, `| 표 |`, 한국식 번호(I. / 1. / 가. / 1))

### parser_docx.js
```javascript
import { parseDocx } from './parser_docx.js';

parseDocx(base64Data: string): IRBlock[]
```
- 입력: base64 인코딩된 .docx 파일
- 출력: IR 블록 배열
- 내부: fflate.unzipSync → word/document.xml + word/styles.xml → fast-xml-parser
- 스타일 매핑: Heading 1~4 → heading1~4, Normal → body, 한글 스타일명 지원

### hwpx_writer.js
```javascript
import { HwpxWriter } from './hwpx_writer.js';

const writer = new HwpxWriter(styleConfig: object, title?: string);
const zipBytes: Uint8Array = writer.write(irBlocks: IRBlock[]);
```
- 입력: IR 블록 배열 + 스타일 설정 객체
- 출력: Uint8Array (HWPX ZIP 바이너리)
- 생성 파일: mimetype, version.xml, container.xml, manifest.xml, container.rdf, content.hpf, header.xml, section0.xml, settings.xml, Preview/PrvText.txt

### utils.js
```javascript
import { escapeXml, mmToHwpunit, ptToHeight, randomId,
         base64ToUint8Array, uint8ArrayToBase64, encodeUTF8 } from './utils.js';
```

---

## IR (중간표현) 구조 정의

### 단락 블록
```json
{
  "type": "heading1" | "heading2" | "heading3" | "heading4" | "body",
  "runs": [
    { "text": "텍스트", "bold": false },
    { "text": "볼드", "bold": true }
  ]
}
```

### 표 블록
```json
{
  "type": "table",
  "has_header": true,
  "rows": [
    [
      {
        "runs": [{ "text": "셀 내용", "bold": true }],
        "align": "center",
        "valign": "center",
        "bg_color": "#D8D8D8",
        "borders": {
          "top": { "type": "SOLID", "width": "0.4 mm" },
          "bottom": { "type": "SOLID", "width": "0.12 mm" },
          "left": { "type": "SOLID", "width": "0.12 mm" },
          "right": { "type": "NONE", "width": "0.1 mm" }
        }
      }
    ]
  ]
}
```

### 타입 매핑 규칙

**마크다운:**
| 입력 | IR type |
|------|---------|
| `# 제목` | heading1 |
| `## 제목` | heading2 |
| `### 제목` | heading3 |
| `#### 제목` | heading4 |
| `I. 로마숫자` | heading1 |
| `1. 숫자` | heading2 |
| `가. 한글` | heading3 |
| `1) 괄호` | heading4 |
| 일반 텍스트 | body |
| `| 표 |` | table |

**docx:**
| Word 스타일 | IR type |
|-------------|---------|
| Heading 1, Title, 제목 1 | heading1 |
| Heading 2, Subtitle, 제목 2 | heading2 |
| Heading 3, 제목 3 | heading3 |
| Heading 4, 제목 4 | heading4 |
| Normal, Body Text, 본문 | body |

---

## 스타일 프리셋 JSON 구조

```json
{
  "meta": {
    "name": "공문서_표준",
    "version": "1.0",
    "description": "행정기관 공문서 표준 스타일"
  },
  "page": {
    "size": "A4",
    "width_mm": 210,
    "height_mm": 297,
    "margin": {
      "top_mm": 20, "bottom_mm": 15,
      "left_mm": 15, "right_mm": 15
    },
    "header_height_mm": 15,
    "footer_height_mm": 15
  },
  "colors": {
    "primary": "#000000",
    "table_head": "#D8D8D8"
  },
  "paragraph_styles": {
    "heading1": {
      "font": "함초롬바탕", "size_pt": 15, "bold": true,
      "align": "left", "indent_left_hwpunit": 1000,
      "space_before_hwpunit": 600, "space_after_hwpunit": 300,
      "line_height_percent": 160
    },
    "heading2": { "font": "함초롬바탕", "size_pt": 13, "bold": true, ... },
    "heading3": { "font": "함초롬바탕", "size_pt": 12, "bold": true, ... },
    "heading4": { "font": "함초롬바탕", "size_pt": 11, "bold": false, ... },
    "body": {
      "font": "함초롬바탕", "size_pt": 10, "bold": false,
      "align": "justify", "indent_left_hwpunit": 1500,
      "line_height_percent": 160
    },
    "table_header": { "font": "함초롬돋움", "size_pt": 10, "bold": true, "align": "center" },
    "table_body": { "font": "함초롬바탕", "size_pt": 10, "bold": false, "align": "left" }
  },
  "character_styles": {
    "emphasis": { "bold": true }
  },
  "table_style": {
    "border_type": "SOLID", "border_width": "0.12 mm", "border_color": "#000000",
    "header_fill": "#D8D8D8",
    "cell_margin_left": 510, "cell_margin_right": 510,
    "cell_margin_top": 141, "cell_margin_bottom": 141
  }
}
```

---

## 웹 전환 시 사용법 예시

### 마크다운 → HWPX 다운로드
```javascript
import { parseMarkdown } from '@/lib/parser_markdown';
import { HwpxWriter } from '@/lib/hwpx_writer';
import stylePreset from '@/styles/공문서_표준.json';

function convertAndDownload(markdownText, filename) {
  const blocks = parseMarkdown(markdownText);
  const writer = new HwpxWriter(stylePreset, filename);
  const zipBytes = writer.write(blocks);

  const blob = new Blob([zipBytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.hwpx`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### docx → HWPX
```javascript
import { parseDocx } from '@/lib/parser_docx';
import { HwpxWriter } from '@/lib/hwpx_writer';

async function handleDocxUpload(file, styleConfig) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // 웹에서는 btoa 사용 가능하지만, utils.js의 uint8ArrayToBase64도 사용 가능
  const base64 = btoa(String.fromCharCode(...bytes));
  // 큰 파일은 chunk 처리 필요:
  // let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b));
  // const base64 = btoa(binary);

  const blocks = parseDocx(base64);
  const writer = new HwpxWriter(styleConfig);
  return writer.write(blocks); // Uint8Array
}
```

---

## 맥 앱 기능 (웹 UI 참고용)

macOS SwiftUI 앱에서 구현된 기능 목록. 웹 전환 시 React로 재구현:

### 입력
- 파일 업로드 (.md, .txt, .docx) + 드래그앤드롭
- 텍스트 직접 붙여넣기 (탭 전환)

### 블록 편집
- 파싱 후 IR 블록 리스트 표시
- 클릭 → 인스펙터에 스타일 정보
- 더블클릭 → 편집 모달 (텍스트, 타입, 스타일 오버라이드)
- 우클릭 → 컨텍스트 메뉴 (편집/이동/추가/삭제)
- Command+클릭(토글), Shift+클릭(범위) 멀티셀렉트 → 일괄 스타일 변경

### 표 편집
- 표 블록 더블클릭 → 전용 표 편집 모달
- 셀 내용/볼드 편집, 셀별 정렬/배경색
- 테두리: 한글 방식 10개 프리셋, 선 속성(종류/굵기)
- Shift+클릭 범위 선택 → 일괄 속성 적용

### 미리보기
- A4 페이지 분할 렌더링
- 표: 셀별 배경/정렬/테두리 시각화

### 스타일 매니저
- 프리셋 선택, 커스텀 스타일 추가/삭제
- 스타일 매핑 (파싱타입 → 커스텀타입 일괄)
- 내보내기/가져오기

### 스타일 적용 우선순위
```
1순위: 개별 블록 오버라이드
2순위: 스타일 매핑 (파싱타입 → 커스텀타입)
3순위: 원본 파싱 타입
```

---

## 참고 파일
- `js-engine/src/` — **복사 대상** JS 모듈 4개 + index.js
- `styles/*.json` — **복사 대상** 스타일 프리셋
- `python/` — 원본 Python 로직 (참조용, JS가 1:1 포팅)
- `_DEV/Handoff/sample_1.hwpx` — HWPX 구조 분석용 샘플
- `_DEV/Handoff/sample_표.hwpx` — 한글 표 구조 (4×4, 셀별 borderFill)
- `_DEV/HWP_CONVERTER_PLAN.md` — 전체 기획서
- `HWFlow/AppState.swift` — IR 모델 정의 (IRBlock, IRTableCell 등) 참고
- `HWFlow/ContentView.swift` — 메인 UI 구조 참고
- `HWFlow/BlockStyleModal.swift` — 블록 편집 모달 참고
- `HWFlow/TableEditModal.swift` — 표 편집 모달 참고
- `HWFlow/DocumentPreviewWindow.swift` — A4 미리보기 참고
- `HWFlow/StyleSettingsView.swift` — 스타일 매니저 참고
