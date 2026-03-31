# HWFlow 웹 프로젝트 핸드오프
> 최종 업데이트: 2026-03-31 (1차 세션 완료)

## 프로젝트 개요
마크다운 / .docx / .pdf → 한글(.hwpx) 자동 변환기 (웹 버전)
macOS SwiftUI 앱에서 React 웹앱으로 전환 완료.

## 기술 스택
- **Vite + React + TypeScript + Tailwind CSS v4**
- **Zustand** — 상태 관리 + Undo/Redo 히스토리
- **fflate + fast-xml-parser** — HWPX ZIP 생성
- **pdfjs-dist** — PDF 파싱 (크롬 전용)

## 프로젝트 경로
```
/Volumes/NINE_DEV/PROJECT/HWFlow/          ← 웹 프로젝트 루트
/Volumes/NINE_DEV/PROJECT/HWFlow/_legacy/  ← 기존 Swift 프로젝트 (참조용)
/Volumes/NINE_DEV/PROJECT/HWFlow/_DEV/     ← 핸드오프, 스크린샷
```

## 실행
```bash
cd /Volumes/NINE_DEV/PROJECT/HWFlow
npm run dev    # 개발 서버
npm run build  # 프로덕션 빌드 → dist/
```

---

## 파일 구조
```
src/
├── App.tsx                         — 메인 레이아웃 (3단: 블록리스트 | 미리보기 | 인스펙터)
├── main.tsx                        — 엔트리포인트
├── index.css                       — Tailwind 테마 (navy 팔레트 + app 토큰)
│
├── components/
│   ├── Toolbar.tsx                 — 상단 툴바 (#f5f5f5 배경, 12px 폰트)
│   ├── FileInput.tsx               — 파일 업로드 + 드래그앤드롭 (.md/.docx/.pdf)
│   ├── PasteInput.tsx              — 텍스트 붙여넣기
│   ├── BlockList.tsx               — IR 블록 리스트 (흰 배경, 멀티셀렉트)
│   ├── BlockStyleModal.tsx         — 블록 편집 모달 (1차 리디자인 완료)
│   ├── TableEditModal.tsx          — 표 편집 모달 (리디자인 필요)
│   ├── DocumentPreview.tsx         — A4 미리보기 (#eeeeee 배경, 96dpi)
│   ├── StyleInspector.tsx          — 우측 인스펙터 (#f5f5f5 배경, 흰 카드)
│   ├── StyleManager.tsx            — 스타일 매니저 모달 (리디자인 필요)
│   └── PreviewWindow.tsx           — 새 창 미리보기 (React Portal)
│
├── hooks/
│   └── useKeyboardShortcuts.ts     — Ctrl+Z/Y (입력 필드 제외)
│
├── lib/
│   ├── parser_markdown.js          — 마크다운 → IR (이미지 ![](url) 감지)
│   ├── parser_docx.js              — docx → IR (이미지 w:drawing 감지)
│   ├── parser_pdf.ts               — PDF → IR (폰트크기 분류, 표/이미지, 페이지별 정렬)
│   ├── hwpx_writer.js              — IR → HWPX ZIP (이미지 → [이미지 위치] 플레이스홀더)
│   ├── utils.js                    — escapeXml, mmToHwpunit, base64 등
│   └── convert.ts                  — 오버라이드 반영 + Blob 다운로드
│
├── store/
│   ├── types.ts                    — IR 타입 (IRBlock, IRTableCell, ParagraphStyleData 등)
│   ├── useAppStore.ts              — Zustand 스토어 (편집 액션에 자동 스냅샷)
│   └── history.ts                  — Undo/Redo 스택 (최대 50단계)
│
└── styles/
    ├── 공문서_표준.json
    └── 입찰공고문_강원도경제진흥원.json
```

---

## 1차 세션 완료 항목

### 파싱 엔진
- [x] 마크다운 → IR (헤딩, 본문, 표, 이미지, bold, 한국식 번호)
- [x] docx → IR (스타일 매핑, 표, 이미지 감지)
- [x] PDF → IR (폰트크기 기반 자동 분류, 표 감지, 이미지 감지, 페이지 순서 정확)
- [x] IR → HWPX 변환 + 다운로드

### UI 컴포넌트
- [x] 3단 레이아웃 (기본 열림: 스플릿 미리보기 + 인스펙터)
- [x] 블록 선택 (클릭/더블클릭/Ctrl+클릭/Shift+클릭 멀티셀렉트)
- [x] 블록 편집 모달 — 리디자인 완료 (버튼그룹, 토글스위치, 카드)
- [x] 표 편집 모달 (테두리 프리셋 10개, 배경색, 셀 속성)
- [x] A4 미리보기 (96dpi 단위 정확, 페이지 분할, 선택 하이라이트)
- [x] 스타일 인스펙터 (프리셋 값 표시)
- [x] 스타일 매니저 (프리셋/매핑/내보내기)
- [x] 새 창 미리보기 (React Portal)
- [x] Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- [x] 이미지 플레이스홀더 (파싱 → 미리보기 → HWPX 공간 확보)

### 디자인 시스템
- [x] 블루 네이비 테마 (채도 있는 계열)
- [x] 배경 구분: 헤더/인스펙터 #f5f5f5 | 미리보기 #eeeeee | 블록리스트 white
- [x] 12px 폰트 기준, 컴팩트 버튼
- [x] 모달: backdrop-blur + #f5f5f5 배경 + 흰 카드 내부

---

## 다음 세션 TODO

### UI 리디자인 (BlockStyleModal 톤에 맞추기)
- [ ] TableEditModal 리디자인
- [ ] StyleManager 모달 리디자인
- [ ] 블록 리스트 우클릭 컨텍스트 메뉴

### 기능 보강
- [ ] HWPX 변환 시 오버라이드 반영 검증 (실제 한글에서 열어보기)
- [ ] 스타일 프리셋 localStorage 저장/로드
- [ ] PDF 표 감지 튜닝 (현재: 3열×3행 이상만)
- [ ] 페이지 범위 선택 (PDF용)

### 알려진 이슈
- Safari PDF 파싱 불가 (readableStream 미지원) → 크롬 전용
- 한글 폰트 미설치 시 미리보기 폰트 폴백
- 새 창 미리보기 StrictMode 깜빡임 (실사용 무관)

---

## 테마 컬러 레퍼런스
```
navy-50:  #edf2fc    navy-500: #3d5691    app-bg:      #f1f4fa
navy-100: #d4dcf0    navy-600: #2f4474    app-surface: #ffffff
navy-200: #a8b5de    navy-700: #243459    app-border:  #d6dcea
navy-300: #7b8ec8    navy-800: #1b2743    app-muted:   #7c87a5
navy-400: #5570b2    navy-900: #131c32    app-subtle:  #f5f7fc
```

---

## IR (중간표현) 구조

### 단락 블록
```json
{ "type": "heading1|heading2|heading3|heading4|body|image",
  "runs": [{ "text": "텍스트", "bold": false }] }
```

### 표 블록
```json
{ "type": "table", "has_header": true,
  "rows": [[ { "runs": [...], "align": "center", "valign": "center",
               "bg_color": "#D8D8D8", "borders": { "top": {"type":"SOLID","width":"0.12 mm"}, ... } } ]] }
```

### 스타일 적용 우선순위
```
1순위: 개별 블록 오버라이드 (blockOverrides, blockTypeOverrides)
2순위: 스타일 매핑 (styleMapping: 파싱타입 → 적용타입)
3순위: 원본 파싱 타입
```
