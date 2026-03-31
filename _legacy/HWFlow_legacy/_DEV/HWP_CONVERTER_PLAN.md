# 📋 HWFlow — Claude Code 기획서
> 버전: 3.0 | 작성: 2026-03-30
> Claude Code 첫 세션에 이 문서를 통째로 붙여넣고 시작할 것

---

## 🎯 프로젝트 배경 및 목적

AI(Claude 등)가 생성한 마크다운 결과물이나 직접 작성한 워드 문서를,
공공기관 업무에 바로 쓸 수 있는 **한글(.hwpx) 문서로 자동 변환**하는 앱.

**실사용 시나리오:**
```
와이프가 Claude로 문서 작성 (개인 Windows 노트북, 외부망)
        ↓
HWP 변환 앱으로 .hwpx 생성
        ↓
업무 메일로 전송
        ↓
업무 PC (내부망) 에서 메일 수신 → 한글로 열어서 사용
```

업무 PC에는 아무것도 설치하지 않음. 한글 앱만 있으면 됨.

---

## 🏗️ 개발 전략: 2단계 접근

### Phase A — Swift 네이티브 맥 앱 (개발 + 검증)
- 본인 맥에서 SwiftUI로 네이티브 앱 제작
- Python 스크립트로 변환 로직 구현
- 실사용하면서 변환 품질 검증 및 개선
- **변환 로직(Python)을 플랫폼 독립적으로 철저히 분리**

### Phase B — Tauri Windows 빌드 (배포)
- Phase A에서 검증된 Python 변환 로직 그대로 재사용
- UI만 Tauri + React로 포팅
- Windows NSIS 인스톨러 (.exe) 빌드
- 와이프 개인 노트북에 설치

```
[Phase A]                          [Phase B]
SwiftUI (맥 네이티브 UI)           Tauri + React (Windows UI)
        ↓                                  ↓
Python 변환 로직  ←————— 재사용 ————→  Python 변환 로직 (sidecar)
        ↓                                  ↓
.hwpx 생성                          .hwpx 생성
```

---

## 🎨 핵심 철학: InDesign 방식

**"내용(Content)과 스타일(Style)을 완전히 분리한다"**

```
[style_preset.json]  +  [원본 문서]  →  [스타일 적용된 .hwpx]
```

스타일 프리셋만 바꾸면 동일한 내용이 공문서도 되고 보고서도 됨.

---

## 🖥️ UI 구조

### 메인 화면
```
┌──────────────────────────────────────────────────┐
│  [파일 업로드 / 텍스트 붙여넣기 탭]                │
│  [스타일 프리셋 선택 ▼]  [인스펙터 열기]  [변환]   │
│  ─────────────────────────────────────────────── │
│                                                  │
│            문서 미리보기 영역                      │
│                                                  │
│   I. 서론                                        │
│   1. 배경 및 목적  ◀ 클릭하면 인스펙터에 표시     │
│   본 연구는 ...                                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 스타일 인스펙터 (플로팅 모달)
```
                    ┌──────────────────────────────┐
                    │  🔍 스타일 인스펙터        ✕  │
                    │  ────────────────────────────│
                    │  단락 스타일: Heading 2       │
                    │  HWP 매핑: heading2 ▼        │
                    │                              │
                    │  ┌─ 폰트 ───────────────┐    │
                    │  │ 서체:  맑은 고딕      │    │
                    │  │ 크기:  14pt           │    │
                    │  │ 굵기:  Bold           │    │
                    │  │ 색상:  #000000        │    │
                    │  └──────────────────────┘    │
                    │                              │
                    │  ┌─ 단락 ───────────────┐    │
                    │  │ 정렬:    왼쪽         │    │
                    │  │ 줄간격:  160%         │    │
                    │  │ 들여쓰기: 10mm        │    │
                    │  │ 단락 전: 6pt          │    │
                    │  │ 단락 후: 3pt          │    │
                    │  └──────────────────────┘    │
                    │                              │
                    │  ┌─ 문자 스타일 ─────────┐    │
                    │  │ (없음)                │    │
                    │  └──────────────────────┘    │
                    └──────────────────────────────┘
                      ↑ 드래그로 위치 자유롭게
```

**인스펙터 동작:**
- 단락 클릭 → 인스펙터 즉시 반영
- 플로팅 모달 — 드래그로 이동 가능
- HWP 매핑 드롭다운으로 직접 조정

---

## 📥 입력 소스 (확정)

```
1. Claude 마크다운 출력물    → 텍스트 직접 붙여넣기
2. 직접 작성한 .docx 파일   → 파일 업로드
```

> 타인이 만든 복잡한 워드 문서는 범위 밖.
> 입력 범위를 단순하게 제한함으로써 HWPX 직접 생성 안정성 확보.

---

## ⚙️ 기술 스택

### Phase A (맥 네이티브)
| 역할 | 기술 |
|------|------|
| UI | SwiftUI |
| Python 호출 | Process / PythonKit |
| 변환 로직 | Python 스크립트 (분리된 모듈) |
| HWPX 생성 | Python (ZIP + XML 직접 조작) |

### Phase B (Windows Tauri)
| 역할 | 기술 |
|------|------|
| UI | Tauri 2.0 + React + TypeScript |
| Python 호출 | Tauri sidecar |
| 변환 로직 | Phase A Python 스크립트 그대로 재사용 |
| 배포 | Windows NSIS 인스톨러 (.exe) |

### Python 변환 모듈 (공통 — 플랫폼 독립)
| 역할 | 기술 |
|------|------|
| docx 파싱 | python-docx |
| 마크다운 파싱 | 자체 구현 (정규식) |
| 스타일 로드 | style_preset.json |
| HWPX 생성 | 자체 구현 (ZIP + XML) |

---

## 🗂️ style_preset.json 구조

```json
{
  "meta": {
    "name": "공문서_표준",
    "version": "1.0",
    "description": "행정기관 공문서 표준 스타일"
  },
  "page": {
    "size": "A4",
    "margin": {
      "top": "30mm", "bottom": "25mm",
      "left": "30mm", "right": "25mm"
    },
    "columns": 1,
    "header_height": "15mm",
    "footer_height": "15mm"
  },
  "colors": {
    "primary":    "#000000",
    "secondary":  "#444444",
    "accent":     "#003087",
    "table_head": "#E8E8E8"
  },
  "paragraph_styles": {
    "heading1": {
      "numbering": "I, II, III",
      "font": "한컴바탕",
      "size": 16,
      "bold": true,
      "align": "left",
      "indent_left": "0mm",
      "space_before": "6pt",
      "space_after": "3pt",
      "line_height": 160
    },
    "heading2": {
      "numbering": "1, 2, 3",
      "font": "한컴바탕",
      "size": 14,
      "bold": true,
      "indent_left": "10mm",
      "space_before": "4pt",
      "space_after": "2pt"
    },
    "heading3": {
      "numbering": "가, 나, 다",
      "font": "한컴바탕",
      "size": 12,
      "bold": false,
      "indent_left": "20mm"
    },
    "heading4": {
      "numbering": "1), 2), 3)",
      "font": "한컴바탕",
      "size": 11,
      "indent_left": "30mm"
    },
    "body": {
      "font": "한컴바탕",
      "size": 11,
      "indent_left": "10mm",
      "line_height": 160
    },
    "table_caption": {
      "font": "한컴바탕",
      "size": 10,
      "align": "center",
      "space_after": "2pt"
    },
    "footnote": {
      "font": "한컴바탕",
      "size": 9,
      "indent_left": "5mm"
    }
  },
  "character_styles": {
    "emphasis": { "bold": true },
    "highlight": { "background": "#FFFF00" },
    "hyperlink": { "color": "#0000FF", "underline": true }
  },
  "table_style": {
    "header_font": "한컴바탕",
    "header_size": 10,
    "header_bold": true,
    "header_align": "center",
    "header_fill": "#E8E8E8",
    "body_font": "한컴바탕",
    "body_size": 10,
    "border_color": "#AAAAAA",
    "line_height": 140
  }
}
```

---

## 🔍 입력 파서 상세

### 1. 마크다운 파서 (Claude 출력물)
```
# 제목        → heading1
## 제목       → heading2
### 제목      → heading3
I. / II.      → heading1 (한국식 로마자)
1. / 2.       → heading2
가. / 나.     → heading3
1) / 2)       → heading4
일반 텍스트   → body
**텍스트**    → emphasis (문자 스타일)
| 표 |        → table
```

### 2. docx 파서 (직접 작성한 워드 문서)
```
Heading 1 스타일  → heading1
Heading 2 스타일  → heading2
Heading 3 스타일  → heading3
Normal 스타일     → body
Table 요소        → table_style 적용
Image 요소        → 위치 보존 시도
Bold run          → emphasis
```

인스펙터에 원본 워드 스타일명 + 실제 폰트/크기/간격 값 + HWP 매핑 표시.

---

## ⚠️ 현실적 한계 (기대치 조정)

| 요소 | 처리 방식 |
|------|----------|
| 본문 텍스트 | ✅ 완벽 보존 |
| 단락 위계 구조 | ✅ 스타일 매핑으로 처리 |
| 단순 표 | 🟡 구조 보존, 스타일은 preset 따름 |
| 복잡한 병합 표 | 🟡 최선 시도, 깨질 수 있음 |
| 이미지 | 🟡 삽입은 되나 위치 정확도 낮음 |
| 텍스트박스 / 도형 | ❌ [도형] 텍스트로 대체 표시 |
| 다단 레이아웃 | ❌ 단단으로 변환 |
| 픽셀 단위 재현 | ❌ 원칙적으로 불가 |

---

## 📁 프로젝트 디렉토리 구조

```
hwp-converter/
│
├── python/                       # 플랫폼 독립 변환 로직 (Phase A/B 공통)
│   ├── main.py                   # CLI 진입점 (JSON in → JSON out)
│   ├── parser_markdown.py        # 마크다운 파서
│   ├── parser_docx.py            # .docx 파서
│   ├── style_loader.py           # style_preset.json 로드
│   ├── mapper.py                 # 파서결과 + 스타일 → 중간표현
│   ├── hwpx_writer.py            # HWPX XML 생성
│   └── requirements.txt
│
├── styles/                       # 스타일 프리셋 (공통)
│   ├── 공문서_표준.json
│   ├── 보고서_일반.json           # Phase 2
│   └── 회의록.json                # Phase 2
│
├── macos/                        # Phase A — SwiftUI 맥 앱
│   └── HWPConverter.xcodeproj
│
└── windows/                      # Phase B — Tauri Windows 앱
    ├── src-tauri/
    └── src/                      # React + TypeScript UI
```

---

## 📦 개발 Phase 계획

```
Phase A-1: Python 변환 로직 (핵심)
├── styles/공문서_표준.json 작성
├── hwpx_writer.py (HWPX ZIP+XML 생성)
├── parser_markdown.py
├── parser_docx.py
├── mapper.py
└── ✅ 검증: 샘플 마크다운 → .hwpx → 한글에서 실제로 열기

Phase A-2: SwiftUI 맥 앱
├── 파일 업로드 / 텍스트 붙여넣기 UI
├── Python 스크립트 호출 연동
├── 문서 미리보기
├── 플로팅 스타일 인스펙터 모달
├── 스타일 프리셋 선택
└── 변환 + 다운로드

Phase A-3: 품질 개선 (실사용 피드백 반영)
├── 이미지 처리
├── 표 변환 완성도
├── 스타일 프리셋 추가
└── 변환 리포트 (손실 요소 목록)

Phase B: Tauri Windows 빌드
├── React UI 포팅 (Phase A UI 기준)
├── Python sidecar 번들
├── Windows NSIS 인스톨러 (.exe) 빌드
└── 와이프 노트북 설치 + 실사용 테스트
```

---

## ⚡ 가장 중요한 첫 번째 작업

> **Python 변환 로직부터, 그리고 반드시 한글에서 실제로 열어볼 것**

HWPX 직접 생성의 안정성이 이 프로젝트의 핵심 리스크.
화려한 UI보다 "한글에서 실제로 열리는 hwpx 만들기"가 먼저.

---

## 🚀 Claude Code 첫 세션 시작 프롬프트 (복붙용)

```
아래 기획을 바탕으로 Python 변환 로직 (Phase A-1) 부터 구현해줘.

프로젝트 구조:
hwp-converter/python/ 디렉토리 안에 구현.
이 Python 모듈은 나중에 SwiftUI 맥 앱과 Tauri Windows 앱 양쪽에서
sidecar로 호출할 것이므로 플랫폼 독립적으로 설계할 것.

호출 방식:
  python main.py --input input.md --style 공문서_표준 --output result.hwpx
  python main.py --input input.docx --style 공문서_표준 --output result.hwpx

구현 범위:
1. styles/공문서_표준.json 작성
2. hwpx_writer.py — HWPX ZIP+XML 직접 생성 (LibreOffice 불필요)
3. parser_markdown.py — 마크다운 파서
4. parser_docx.py — python-docx 기반 docx 파서 (스타일 정보 추출 포함)
5. style_loader.py — preset JSON 로드
6. mapper.py — 파서 결과 + 스타일 → 중간 표현 → hwpx_writer 호출
7. main.py — CLI 진입점

구현 순서:
1. styles/공문서_표준.json
2. hwpx_writer.py (HWPX 포맷 구조 먼저 파악)
3. 나머지 모듈
4. 샘플 마크다운으로 변환 테스트
   → 결과물을 한글에서 실제로 열어서 확인하는 것이 최우선

인스펙터용 스타일 정보 추출:
parser_docx.py는 변환뿐 아니라
각 단락의 원본 스타일 정보(폰트명, 크기, 굵기, 줄간격, 들여쓰기 등)를
JSON으로 반환하는 기능도 함께 구현할 것.
(나중에 SwiftUI 인스펙터 모달에서 이 JSON을 표시함)
```
