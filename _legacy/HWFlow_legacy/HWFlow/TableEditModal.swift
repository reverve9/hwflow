import SwiftUI

struct TableEditModal: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let block: IRBlock

    @State private var cellTexts: [[String]] = []
    @State private var cellBolds: [[Bool]] = []
    @State private var cellAligns: [[String]] = []
    @State private var cellValigns: [[String]] = []
    @State private var cellBgColors: [[String?]] = []
    @State private var cellBorders: [[CellBorders]] = []

    @State private var lineType: String = "SOLID"
    @State private var lineWidth: String = "0.12 mm"
    @State private var hasHeader: Bool = false

    // 셀 선택: 복수 선택 + 앵커(Shift 범위 기준점)
    @State private var selectedCells: Set<CellIndex> = []
    @State private var anchorCell: CellIndex? = nil
    @State private var editingCell: CellIndex? = nil

    private struct CellIndex: Hashable { let row: Int; let col: Int }

    init(block: IRBlock) { self.block = block }

    private var rowCount: Int { cellTexts.count }
    private var colCount: Int { cellTexts.first?.count ?? 0 }

    /// 선택된 셀 중 인스펙터 기준 셀 (앵커 또는 마지막 선택)
    private var primaryCell: CellIndex? {
        guard let a = anchorCell, selectedCells.contains(a) else { return selectedCells.first }
        return a
    }

    var body: some View {
        VStack(spacing: 0) {
            // 헤더
            HStack {
                Text("표 편집").font(.title3).fontWeight(.bold)
                Text("\(rowCount) × \(colCount)").font(.callout).foregroundStyle(.secondary)
                if selectedCells.count == 1, let s = selectedCells.first {
                    Text("셀 [\(s.row+1), \(s.col+1)]")
                        .font(.caption).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.15)).cornerRadius(4)
                } else if selectedCells.count > 1 {
                    Text("\(selectedCells.count)개 셀 선택")
                        .font(.caption).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.15)).cornerRadius(4)
                }
                Spacer()
                Button("적용") { applyChanges(); dismiss() }.buttonStyle(.borderedProminent)
                Button("취소") { dismiss() }.buttonStyle(.bordered)
            }
            .padding(16)

            Divider()

            // 툴바
            HStack(spacing: 12) {
                Toggle("첫 행 헤더", isOn: $hasHeader).toggleStyle(.checkbox)
                Divider().frame(height: 16)
                Button { addRow() } label: { Label("행", systemImage: "plus") }.buttonStyle(.bordered).controlSize(.small)
                Button { addColumn() } label: { Label("열", systemImage: "plus") }.buttonStyle(.bordered).controlSize(.small)
                if rowCount > 1 { Button { removeLastRow() } label: { Label("행", systemImage: "minus") }.buttonStyle(.bordered).controlSize(.small) }
                if colCount > 1 { Button { removeLastColumn() } label: { Label("열", systemImage: "minus") }.buttonStyle(.bordered).controlSize(.small) }
                Spacer()
                if !selectedCells.isEmpty {
                    Button("선택 해제") { clearSelection() }
                        .buttonStyle(.bordered).controlSize(.small)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)

            Divider()

            HSplitView {
                ScrollView([.horizontal, .vertical]) {
                    tableGridView.padding(16)
                }
                .frame(minWidth: 400)
                .onTapGesture { clearSelection() }

                inspectorPanel.frame(width: 220)
            }
        }
        .frame(minWidth: 740, minHeight: 500)
        .frame(maxWidth: 1050, maxHeight: 780)
        .onAppear { loadFromBlock() }
    }

    private func clearSelection() {
        selectedCells.removeAll(); anchorCell = nil; editingCell = nil
    }

    // MARK: - 셀 선택 로직

    private func selectCell(row: Int, col: Int, shift: Bool) {
        let idx = CellIndex(row: row, col: col)
        if shift, let anchor = anchorCell {
            // Shift+클릭: 앵커 → 클릭 셀 사이 사각형 범위 선택
            let rMin = min(anchor.row, row), rMax = max(anchor.row, row)
            let cMin = min(anchor.col, col), cMax = max(anchor.col, col)
            selectedCells.removeAll()
            for r in rMin...rMax {
                for c in cMin...cMax {
                    selectedCells.insert(CellIndex(row: r, col: c))
                }
            }
            // 앵커 유지
        } else {
            // 일반 클릭: 단일 선택
            selectedCells = [idx]
            anchorCell = idx
        }
        editingCell = nil
    }

    // MARK: - 인스펙터 (항상 동일 구조)

    private var inspectorPanel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // ── 선 ──
                lineSettings

                Divider()

                // ── 테두리 프리셋 ──
                // 셀 선택 없으면 → 표 전체, 선택 있으면 → 선택 영역
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("테두리").font(.headline)
                        Spacer()
                        if !selectedCells.isEmpty {
                            Text("선택 영역").font(.caption).foregroundColor(.accentColor)
                        } else {
                            Text("표 전체").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    presetGrid { applyPreset($0) }
                }

                Divider()

                // ── 배경 ──
                bgSection

                // ── 셀 속성 (선택 시) ──
                if let p = primaryCell, p.row < rowCount, p.col < colCount {
                    Divider()
                    cellSection(primary: p)
                }

                Spacer()
            }
            .padding(12)
        }
        .background(Color.gray.opacity(0.05))
    }

    // MARK: - 셀 속성

    private func cellSection(primary p: CellIndex) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("셀 속성").font(.headline)
                if selectedCells.count > 1 {
                    Text("(\(selectedCells.count)개)").font(.caption).foregroundStyle(.secondary)
                }
            }

            Toggle("볼드", isOn: Binding(
                get: { cellBolds[p.row][p.col] },
                set: { val in forEachSelected { cellBolds[$0][$1] = val } }
            )).toggleStyle(.checkbox)

            VStack(alignment: .leading, spacing: 4) {
                Text("가로 정렬").font(.caption).foregroundStyle(.secondary)
                Picker("", selection: Binding(
                    get: { cellAligns[p.row][p.col] },
                    set: { val in forEachSelected { cellAligns[$0][$1] = val } }
                )) {
                    Image(systemName: "text.alignleft").tag("left")
                    Image(systemName: "text.aligncenter").tag("center")
                    Image(systemName: "text.alignright").tag("right")
                    Image(systemName: "text.justify").tag("justify")
                }.pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("세로 정렬").font(.caption).foregroundStyle(.secondary)
                Picker("", selection: Binding(
                    get: { cellValigns[p.row][p.col] },
                    set: { val in forEachSelected { cellValigns[$0][$1] = val } }
                )) {
                    Text("상").tag("top"); Text("중").tag("center"); Text("하").tag("bottom")
                }.pickerStyle(.segmented)
            }

            // 단일 셀: 면별 테두리
            if selectedCells.count == 1 {
                cellBorderEditor(row: p.row, col: p.col)
            }
        }
    }

    private func forEachSelected(_ action: (Int, Int) -> Void) {
        for cell in selectedCells where cell.row < rowCount && cell.col < colCount {
            action(cell.row, cell.col)
        }
    }

    // MARK: - 배경

    private var bgSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("배경").font(.headline)
            if let p = primaryCell, p.row < rowCount, p.col < colCount {
                let colors: [String?] = [nil, "#D8D8D8", "#E8F5E9", "#FFF3E0", "#E3F2FD", "#FCE4EC",
                                         "#F3E5F5", "#FFF9C4", "#ECEFF1", "#F5F5F5", "#FFFFFF"]
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(22), spacing: 6), count: 6), spacing: 6) {
                    ForEach(Array(colors.enumerated()), id: \.offset) { _, c in
                        bgBtn(primary: p, color: c)
                    }
                }
                HStack(spacing: 4) {
                    Text("#").font(.caption).foregroundStyle(.secondary)
                    TextField("RRGGBB", text: Binding(
                        get: { cellBgColors[p.row][p.col]?.replacingOccurrences(of: "#", with: "") ?? "" },
                        set: { v in
                            let color: String? = v.isEmpty ? nil : "#" + v.prefix(6)
                            forEachSelected { cellBgColors[$0][$1] = color }
                        }
                    )).textFieldStyle(.roundedBorder).font(.system(size: 11, design: .monospaced))
                }
            } else {
                Text("셀을 선택하면 배경색 변경 가능").font(.caption).foregroundStyle(.tertiary)
            }
        }
    }

    private func bgBtn(primary p: CellIndex, color: String?) -> some View {
        let sel = cellBgColors[p.row][p.col] == color
        return Button {
            forEachSelected { cellBgColors[$0][$1] = color }
        } label: {
            if let color, let c = Color(hex: color) {
                RoundedRectangle(cornerRadius: 3).fill(c).frame(width: 22, height: 22)
                    .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(sel ? Color.accentColor : Color.gray.opacity(0.4), lineWidth: sel ? 2 : 0.5))
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 3).fill(Color.white).frame(width: 22, height: 22)
                    Path { p in p.move(to: .init(x: 2, y: 20)); p.addLine(to: .init(x: 20, y: 2)) }
                        .stroke(Color.red.opacity(0.6), lineWidth: 1)
                }.overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(sel ? Color.accentColor : Color.gray.opacity(0.4), lineWidth: sel ? 2 : 0.5))
            }
        }.buttonStyle(.plain)
    }

    // MARK: - 프리셋 적용 (자동 범위)

    private func applyPreset(_ preset: BorderPreset) {
        if selectedCells.isEmpty {
            applyPresetToTable(preset)
        } else {
            applyPresetToSelection(preset)
        }
    }

    // MARK: - 공통

    private var lineSettings: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("선").font(.headline)
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("종류").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $lineType) {
                        Text("실선").tag("SOLID"); Text("점선").tag("DASHED"); Text("없음").tag("NONE")
                    }.frame(width: 80)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("굵기").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $lineWidth) {
                        Text("0.12").tag("0.12 mm"); Text("0.25").tag("0.25 mm")
                        Text("0.4").tag("0.4 mm"); Text("0.7").tag("0.7 mm")
                    }.frame(width: 70)
                }
            }
        }
    }

    private func presetGrid(action: @escaping (BorderPreset) -> Void) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 38, maximum: 48), spacing: 3), count: 4), spacing: 3) {
            presetBtn(.all, "전체", action); presetBtn(.outerThick, "윤곽굵게", action)
            presetBtn(.innerOnly, "안쪽", action); presetBtn(.none, "없음", action)
            presetBtn(.outerHorizontal, "윤곽+가로", action); presetBtn(.outerVertical, "윤곽+세로", action)
            presetBtn(.horizontalOnly, "가로만", action); presetBtn(.verticalOnly, "세로만", action)
            presetBtn(.topBottomH, "위아래+가로", action); presetBtn(.leftRightV, "좌우+세로", action)
        }
    }

    private func cellBorderEditor(row: Int, col: Int) -> some View {
        let activeBorder = CellBorder(type: lineType, width: lineWidth)
        return VStack(alignment: .leading, spacing: 6) {
            Text("면별 설정").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 12) {
                cellBorderPreview(row: row, col: col)
                    .frame(width: 60, height: 50).background(Color.white).border(Color.gray.opacity(0.2))
                VStack(alignment: .leading, spacing: 4) {
                    sideToggle("상", isOn: cellBorders[row][col].top.type != "NONE") {
                        cellBorders[row][col].top = $0 ? activeBorder : .none
                    }
                    sideToggle("하", isOn: cellBorders[row][col].bottom.type != "NONE") {
                        cellBorders[row][col].bottom = $0 ? activeBorder : .none
                    }
                    sideToggle("좌", isOn: cellBorders[row][col].left.type != "NONE") {
                        cellBorders[row][col].left = $0 ? activeBorder : .none
                    }
                    sideToggle("우", isOn: cellBorders[row][col].right.type != "NONE") {
                        cellBorders[row][col].right = $0 ? activeBorder : .none
                    }
                }
            }
        }
    }

    private func sideToggle(_ label: String, isOn: Bool, action: @escaping (Bool) -> Void) -> some View {
        Toggle(label, isOn: Binding(get: { isOn }, set: { action($0) }))
            .toggleStyle(.checkbox).font(.caption)
    }

    private func cellBorderPreview(row: Int, col: Int) -> some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height, b = cellBorders[row][col]
            func draw(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ border: CellBorder) {
                if border.type == "NONE" { return }
                let lw: CGFloat = (border.width == "0.4 mm" || border.width == "0.7 mm") ? 2.5 : 1.0
                var path = Path(); path.move(to: .init(x: x1, y: y1)); path.addLine(to: .init(x: x2, y: y2))
                let dash: [CGFloat] = border.type == "DASHED" ? [4, 3] : []
                ctx.stroke(path, with: .color(.primary), style: StrokeStyle(lineWidth: lw, dash: dash))
            }
            var cross = Path()
            cross.move(to: .init(x: w*0.3, y: h*0.5)); cross.addLine(to: .init(x: w*0.7, y: h*0.5))
            cross.move(to: .init(x: w*0.5, y: h*0.3)); cross.addLine(to: .init(x: w*0.5, y: h*0.7))
            ctx.stroke(cross, with: .color(.gray.opacity(0.12)), lineWidth: 0.5)
            draw(0, 0, w, 0, b.top); draw(0, h, w, h, b.bottom)
            draw(0, 0, 0, h, b.left); draw(w, 0, w, h, b.right)
        }
    }

    // MARK: - 프리셋 로직

    private enum BorderPreset {
        case all, outerThick, innerOnly, none
        case outerHorizontal, outerVertical, horizontalOnly, verticalOnly
        case topBottomH, leftRightV
    }

    private struct PFlags {
        var outerTop = false, outerBottom = false, outerLeft = false, outerRight = false
        var innerH = false, innerV = false, outerThick = false
    }

    private func flags(_ p: BorderPreset) -> PFlags {
        switch p {
        case .all:             return PFlags(outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true)
        case .outerThick:      return PFlags(outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true, outerThick: true)
        case .innerOnly:       return PFlags(innerH: true, innerV: true)
        case .none:            return PFlags()
        case .outerHorizontal: return PFlags(outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true)
        case .outerVertical:   return PFlags(outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerV: true)
        case .horizontalOnly:  return PFlags(innerH: true)
        case .verticalOnly:    return PFlags(innerV: true)
        case .topBottomH:      return PFlags(outerTop: true, outerBottom: true, innerH: true)
        case .leftRightV:      return PFlags(outerLeft: true, outerRight: true, innerV: true)
        }
    }

    private func applyPresetToTable(_ preset: BorderPreset) {
        applyPresetToRange(rRange: 0..<rowCount, cRange: 0..<colCount, preset: preset)
    }

    private func applyPresetToSelection(_ preset: BorderPreset) {
        guard !selectedCells.isEmpty else { return }
        let rMin = selectedCells.map(\.row).min()!
        let rMax = selectedCells.map(\.row).max()!
        let cMin = selectedCells.map(\.col).min()!
        let cMax = selectedCells.map(\.col).max()!
        applyPresetToRange(rRange: rMin..<(rMax+1), cRange: cMin..<(cMax+1), preset: preset)
    }

    private func applyPresetToRange(rRange: Range<Int>, cRange: Range<Int>, preset: BorderPreset) {
        guard !rRange.isEmpty, !cRange.isEmpty else { return }
        let f = flags(preset)
        let line = CellBorder(type: lineType, width: lineWidth)
        let outer = f.outerThick ? CellBorder(type: lineType, width: "0.4 mm") : line

        for r in rRange { for c in cRange { cellBorders[r][c] = .none } }

        if f.outerTop    { for c in cRange { cellBorders[rRange.lowerBound][c].top = outer } }
        if f.outerBottom { for c in cRange { cellBorders[rRange.upperBound-1][c].bottom = outer } }
        if f.outerLeft   { for r in rRange { cellBorders[r][cRange.lowerBound].left = outer } }
        if f.outerRight  { for r in rRange { cellBorders[r][cRange.upperBound-1].right = outer } }
        if f.innerH && rRange.count > 1 {
            for r in rRange.dropLast() { for c in cRange { cellBorders[r][c].bottom = line; cellBorders[r+1][c].top = line } }
        }
        if f.innerV && cRange.count > 1 {
            for c in cRange.dropLast() { for r in rRange { cellBorders[r][c].right = line; cellBorders[r][c+1].left = line } }
        }
    }

    private func presetBtn(_ preset: BorderPreset, _ label: String, _ action: @escaping (BorderPreset) -> Void) -> some View {
        Button { action(preset) } label: {
            VStack(spacing: 1) {
                presetIcon(preset).frame(width: 28, height: 20)
                Text(label).font(.system(size: 7)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(Color.gray.opacity(0.08)).cornerRadius(4)
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.gray.opacity(0.3), lineWidth: 0.5))
        }.buttonStyle(.plain)
    }

    private func presetIcon(_ preset: BorderPreset) -> some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height, mx = w/2, my = h/2
            let gray = Color.gray.opacity(0.25), black = Color.primary
            func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ c: Color, _ lw: CGFloat) {
                var p = Path(); p.move(to: .init(x: x1, y: y1)); p.addLine(to: .init(x: x2, y: y2))
                ctx.stroke(p, with: .color(c), lineWidth: lw)
            }
            for g in [(0.0,0.0,w,0.0),(0.0,h,w,h),(0.0,0.0,0.0,h),(w,0.0,w,h),(0.0,my,w,my),(mx,0.0,mx,h)] {
                line(g.0, g.1, g.2, g.3, gray, 0.5)
            }
            let f = flags(preset); let ow: CGFloat = f.outerThick ? 1.5 : 0.5
            if f.outerTop    { line(0, 0, w, 0, black, ow) }
            if f.outerBottom { line(0, h, w, h, black, ow) }
            if f.outerLeft   { line(0, 0, 0, h, black, ow) }
            if f.outerRight  { line(w, 0, w, h, black, ow) }
            if f.innerH      { line(0, my, w, my, black, 0.5) }
            if f.innerV      { line(mx, 0, mx, h, black, 0.5) }
        }
    }

    // MARK: - 표 그리드

    private var tableGridView: some View {
        VStack(spacing: 0) {
            ForEach(0..<rowCount, id: \.self) { r in
                HStack(alignment: .top, spacing: 0) {
                    Text("\(r+1)").font(.caption2).foregroundStyle(.secondary).frame(width: 24)
                    ForEach(0..<colCount, id: \.self) { c in
                        modalCellView(row: r, col: c)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func modalCellView(row: Int, col: Int) -> some View {
        let isHeader = hasHeader && row == 0
        let idx = CellIndex(row: row, col: col)
        let isEditing = editingCell == idx
        let isSelected = selectedCells.contains(idx)
        let isBold = cellBolds[row][col]
        let align = cellAligns[row][col]
        let bg = resolvedBg(row: row, col: col, isHeader: isHeader)
        let borders = cellBorders[row][col]

        return Group {
            if isEditing {
                TextField("", text: $cellTexts[row][col])
                    .textFieldStyle(.plain)
                    .font(.system(size: 11, weight: isBold || isHeader ? .bold : .regular))
                    .multilineTextAlignment(toTextAlign(align))
                    .padding(.horizontal, 6).padding(.vertical, 4)
                    .onSubmit { editingCell = nil }
            } else {
                Text(cellTexts[row][col].isEmpty ? " " : cellTexts[row][col])
                    .font(.system(size: 11, weight: isBold || isHeader ? .bold : .regular))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: toFrameAlign(align))
                    .multilineTextAlignment(toTextAlign(align))
                    .padding(.horizontal, 6).padding(.vertical, 4)
            }
        }
        .frame(minWidth: 80, maxWidth: .infinity, minHeight: 28, maxHeight: .infinity)
        .background(bg)
        .overlay(alignment: .top) {
            if borders.top.type != "NONE" { Rectangle().fill(Color.black.opacity(0.6)).frame(height: bdrLW(borders.top)) }
        }
        .overlay(alignment: .bottom) {
            if borders.bottom.type != "NONE" { Rectangle().fill(Color.black.opacity(0.6)).frame(height: bdrLW(borders.bottom)) }
        }
        .overlay(alignment: .leading) {
            if borders.left.type != "NONE" { Rectangle().fill(Color.black.opacity(0.6)).frame(width: bdrLW(borders.left)) }
        }
        .overlay(alignment: .trailing) {
            if borders.right.type != "NONE" { Rectangle().fill(Color.black.opacity(0.6)).frame(width: bdrLW(borders.right)) }
        }
        .overlay {
            if isSelected { Rectangle().strokeBorder(Color.accentColor, lineWidth: 2) }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            selectCell(row: row, col: col, shift: false)
            editingCell = idx
        }
        .simultaneousGesture(TapGesture().modifiers(.shift).onEnded {
            selectCell(row: row, col: col, shift: true)
        })
        .onTapGesture(count: 1) {
            selectCell(row: row, col: col, shift: false)
        }
        .contextMenu {
            Button(isBold ? "볼드 해제" : "볼드 적용") {
                forEachSelected { cellBolds[$0][$1].toggle() }
            }
            Divider()
            Button("위에 행 삽입") { insertRow(at: row) }
            Button("아래에 행 삽입") { insertRow(at: row + 1) }
            Button("왼쪽에 열 삽입") { insertColumn(at: col) }
            Button("오른쪽에 열 삽입") { insertColumn(at: col + 1) }
            Divider()
            if rowCount > 1 { Button("이 행 삭제", role: .destructive) { deleteRow(at: row) } }
            if colCount > 1 { Button("이 열 삭제", role: .destructive) { deleteColumn(at: col) } }
        }
    }

    private func bdrLW(_ b: CellBorder) -> CGFloat {
        switch b.width { case "0.7 mm": return 2.0; case "0.4 mm": return 1.5; case "0.25 mm": return 1.0; default: return 0.5 }
    }

    // MARK: - 유틸

    private func resolvedBg(row: Int, col: Int, isHeader: Bool) -> Color {
        if let hex = cellBgColors[row][col], let c = Color(hex: hex) { return c }
        return isHeader ? Color.gray.opacity(0.15) : Color.white
    }
    private func toTextAlign(_ a: String) -> TextAlignment {
        switch a { case "center": .center; case "right": .trailing; default: .leading }
    }
    private func toFrameAlign(_ a: String) -> Alignment {
        switch a { case "center": .center; case "right": .trailing; default: .leading }
    }

    // MARK: - 행/열 조작

    private func nr() -> ([String],[Bool],[String],[String],[String?],[CellBorders]) {
        (.init(repeating: "", count: colCount), .init(repeating: false, count: colCount),
         .init(repeating: "left", count: colCount), .init(repeating: "center", count: colCount),
         .init(repeating: nil, count: colCount), .init(repeating: .solid, count: colCount))
    }
    private func addRow() { let r = nr(); cellTexts.append(r.0); cellBolds.append(r.1); cellAligns.append(r.2); cellValigns.append(r.3); cellBgColors.append(r.4); cellBorders.append(r.5) }
    private func addColumn() { for i in 0..<rowCount { cellTexts[i].append(""); cellBolds[i].append(false); cellAligns[i].append("left"); cellValigns[i].append("center"); cellBgColors[i].append(nil); cellBorders[i].append(.solid) } }
    private func insertRow(at i: Int) { let r = nr(); cellTexts.insert(r.0, at: i); cellBolds.insert(r.1, at: i); cellAligns.insert(r.2, at: i); cellValigns.insert(r.3, at: i); cellBgColors.insert(r.4, at: i); cellBorders.insert(r.5, at: i); fixSel(rI: i) }
    private func insertColumn(at i: Int) { for j in 0..<rowCount { cellTexts[j].insert("", at: i); cellBolds[j].insert(false, at: i); cellAligns[j].insert("left", at: i); cellValigns[j].insert("center", at: i); cellBgColors[j].insert(nil, at: i); cellBorders[j].insert(.solid, at: i) }; fixSel(cI: i) }
    private func removeLastRow() { guard rowCount > 1 else { return }; cellTexts.removeLast(); cellBolds.removeLast(); cellAligns.removeLast(); cellValigns.removeLast(); cellBgColors.removeLast(); cellBorders.removeLast(); bndSel() }
    private func removeLastColumn() { guard colCount > 1 else { return }; for i in 0..<rowCount { cellTexts[i].removeLast(); cellBolds[i].removeLast(); cellAligns[i].removeLast(); cellValigns[i].removeLast(); cellBgColors[i].removeLast(); cellBorders[i].removeLast() }; bndSel() }
    private func deleteRow(at i: Int) { guard rowCount > 1 else { return }; cellTexts.remove(at: i); cellBolds.remove(at: i); cellAligns.remove(at: i); cellValigns.remove(at: i); cellBgColors.remove(at: i); cellBorders.remove(at: i); editingCell = nil; bndSel() }
    private func deleteColumn(at i: Int) { guard colCount > 1 else { return }; for j in 0..<rowCount { cellTexts[j].remove(at: i); cellBolds[j].remove(at: i); cellAligns[j].remove(at: i); cellValigns[j].remove(at: i); cellBgColors[j].remove(at: i); cellBorders[j].remove(at: i) }; editingCell = nil; bndSel() }

    private func fixSel(rI: Int? = nil, cI: Int? = nil) {
        var newSet: Set<CellIndex> = []
        for s in selectedCells {
            var r = s.row, c = s.col
            if let ri = rI, ri <= r { r += 1 }
            if let ci = cI, ci <= c { c += 1 }
            newSet.insert(CellIndex(row: r, col: c))
        }
        selectedCells = newSet
        if let a = anchorCell {
            var r = a.row, c = a.col
            if let ri = rI, ri <= r { r += 1 }
            if let ci = cI, ci <= c { c += 1 }
            anchorCell = CellIndex(row: r, col: c)
        }
    }
    private func bndSel() {
        selectedCells = selectedCells.filter { $0.row < rowCount && $0.col < colCount }
        if let a = anchorCell, a.row >= rowCount || a.col >= colCount { anchorCell = nil }
        editingCell = nil
    }

    // MARK: - 로드 / 저장

    private func loadFromBlock() {
        let rows = appState.effectiveTableRows(for: block)
        hasHeader = appState.effectiveHasHeader(for: block)
        cellTexts = rows.map { $0.map { $0.text } }
        cellBolds = rows.map { $0.map { c in c.runs.contains { $0.bold } } }
        cellAligns = rows.map { $0.map { $0.align } }
        cellValigns = rows.map { $0.map { $0.valign } }
        cellBgColors = rows.map { $0.map { $0.bgColor } }
        cellBorders = rows.map { $0.map { $0.borders } }
        if cellTexts.isEmpty {
            let n = 3
            cellTexts = .init(repeating: .init(repeating: "", count: n), count: n)
            cellBolds = .init(repeating: .init(repeating: false, count: n), count: n)
            cellAligns = .init(repeating: .init(repeating: "left", count: n), count: n)
            cellValigns = .init(repeating: .init(repeating: "center", count: n), count: n)
            cellBgColors = .init(repeating: .init(repeating: nil, count: n), count: n)
            cellBorders = .init(repeating: .init(repeating: .solid, count: n), count: n)
        }
    }

    private func applyChanges() {
        var newRows: [[IRTableCell]] = []
        for r in 0..<rowCount {
            var row: [IRTableCell] = []
            for c in 0..<colCount {
                row.append(IRTableCell(
                    runs: [IRTableRun(text: cellTexts[r][c], bold: cellBolds[r][c])],
                    align: cellAligns[r][c], valign: cellValigns[r][c],
                    bgColor: cellBgColors[r][c], borders: cellBorders[r][c]
                ))
            }
            newRows.append(row)
        }
        appState.tableRowOverrides[block.id] = newRows
        appState.tableHeaderOverrides[block.id] = hasHeader
    }
}
