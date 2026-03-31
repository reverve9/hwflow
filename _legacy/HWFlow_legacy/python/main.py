"""
main.py — CLI 진입점

사용법:
  python main.py --input input.md --style 공문서_표준 --output result.hwpx
  python main.py --input input.docx --style 공문서_표준 --output result.hwpx
  python main.py --list-styles
  python main.py --inspect input.docx   (인스펙터용 스타일 정보 출력)
"""

import argparse
import json
import os
import sys

# 모듈 경로 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parser_markdown import parse_markdown
from parser_docx import parse_docx, get_style_report
from style_loader import load_style, list_styles, set_styles_dir
from mapper import convert


def main():
    parser = argparse.ArgumentParser(
        description="마크다운/docx → 한글(.hwpx) 변환기"
    )
    parser.add_argument("--input", "-i", help="입력 파일 경로 (.md 또는 .docx)")
    parser.add_argument("--style", "-s", default="공문서_표준", help="스타일 프리셋 이름 (기본: 공문서_표준)")
    parser.add_argument("--output", "-o", help="출력 .hwpx 파일 경로")
    parser.add_argument("--title", "-t", default="", help="문서 제목")
    parser.add_argument("--list-styles", action="store_true", help="사용 가능한 스타일 목록 출력")
    parser.add_argument("--inspect", help=".docx 파일의 스타일 정보 출력 (인스펙터용)")
    parser.add_argument("--styles-dir", help="스타일 디렉토리 경로 (번들 배포용)")
    parser.add_argument("--parse-markdown", help="마크다운 파일 → IR JSON 출력 (미리보기용)")
    parser.add_argument("--parse-docx", help="docx 파일 → IR JSON 출력 (미리보기용)")

    args = parser.parse_args()

    # styles 디렉토리 오버라이드
    if args.styles_dir:
        set_styles_dir(args.styles_dir)

    # 마크다운 파싱 (JSON 출력)
    if args.parse_markdown:
        with open(args.parse_markdown, "r", encoding="utf-8") as f:
            text = f.read()
        blocks = parse_markdown(text)
        print(json.dumps(blocks, ensure_ascii=False))
        return

    # docx 파싱 (JSON 출력)
    if args.parse_docx:
        ir_blocks, _ = parse_docx(args.parse_docx)
        print(json.dumps(ir_blocks, ensure_ascii=False))
        return

    # 스타일 목록
    if args.list_styles:
        styles = list_styles()
        if not styles:
            print("사용 가능한 스타일이 없습니다.")
        else:
            print(json.dumps(styles, ensure_ascii=False, indent=2))
        return

    # 인스펙터 모드
    if args.inspect:
        if not os.path.isfile(args.inspect):
            print(f"파일을 찾을 수 없습니다: {args.inspect}", file=sys.stderr)
            sys.exit(1)
        report = get_style_report(args.inspect)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    # 변환 모드
    if not args.input:
        parser.print_help()
        sys.exit(1)

    if not os.path.isfile(args.input):
        print(f"입력 파일을 찾을 수 없습니다: {args.input}", file=sys.stderr)
        sys.exit(1)

    # 출력 경로 기본값
    if not args.output:
        base = os.path.splitext(args.input)[0]
        args.output = base + ".hwpx"

    # 파일 확장자로 파서 선택
    ext = os.path.splitext(args.input)[1].lower()

    if ext in (".md", ".txt", ".markdown"):
        with open(args.input, "r", encoding="utf-8") as f:
            text = f.read()
        ir_blocks = parse_markdown(text)
        title = args.title or os.path.splitext(os.path.basename(args.input))[0]

    elif ext in (".docx",):
        ir_blocks, style_infos = parse_docx(args.input)
        title = args.title or os.path.splitext(os.path.basename(args.input))[0]

    else:
        print(f"지원하지 않는 파일 형식입니다: {ext}", file=sys.stderr)
        print("지원 형식: .md, .txt, .markdown, .docx", file=sys.stderr)
        sys.exit(1)

    if not ir_blocks:
        print("변환할 내용이 없습니다.", file=sys.stderr)
        sys.exit(1)

    # 변환 실행
    convert(ir_blocks, args.style, args.output, title=title)
    print(f"변환 완료: {args.output}")
    print(f"  블록 수: {len(ir_blocks)}")
    print(f"  스타일: {args.style}")


if __name__ == "__main__":
    main()
