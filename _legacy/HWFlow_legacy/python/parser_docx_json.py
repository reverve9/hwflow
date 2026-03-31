"""SwiftUI 브릿지용: docx 파일 → IR JSON 출력"""
import sys
import json
from parser_docx import parse_docx

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(0)
    ir_blocks, _ = parse_docx(sys.argv[1])
    print(json.dumps(ir_blocks, ensure_ascii=False))
