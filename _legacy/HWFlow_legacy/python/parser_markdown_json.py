"""SwiftUI 브릿지용: 마크다운 파일 → IR JSON 출력"""
import sys
import json
from parser_markdown import parse_markdown

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(0)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        text = f.read()
    blocks = parse_markdown(text)
    print(json.dumps(blocks, ensure_ascii=False))
