# ==========================================================================
# EXAM BUILDER (Python/PyMuPDF)
# Assembles Question Paper / Mark Scheme PDFs by clipping the actual
# question regions out of the source past-paper PDFs. This keeps tables,
# diagrams, images AND selectable text exactly as they appear in the
# original papers.
#
# Usage:  python exam_build.py <spec.json>
# The spec file contains the exam name, output paths and the ordered
# question list. A JSON result object is printed to stdout.
# ==========================================================================

import fitz  # PyMuPDF
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from io import BytesIO

try:  # python-docx (for .docx output)
    from docx import Document
    from docx.shared import Pt, Mm, Cm
    from docx.enum.text import (
        WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
    )
    from docx.enum.section import WD_ORIENT, WD_SECTION
    from docx.enum.table import WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
    from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    HAS_DOCX = True
except Exception:
    HAS_DOCX = False

if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')

PAGE_W = 595.28
PAGE_H = 841.89
MARGIN = 56
CONTENT_W = PAGE_W - MARGIN * 2
TOP_Y = 64
BOTTOM_Y = PAGE_H - 56          # content must end above this
DEFAULT_TOP = 54                # fallback content top when no furniture found
DEFAULT_BOTTOM = 792            # fallback content bottom when no furniture found
MAX_CONT_PAGES = 3

# Original-paper furniture that must NOT be copied into the exam:
# page numbers, barcodes, document codes, publisher footers, "Turn over"
DOC_CODE_RE = re.compile(r'^\s*\d{4}/\d+')


def is_bottom_furniture(text):
    """True for footer/barcode lines like '9618/11/M/J/26 (c) UCLES 2021'."""
    t = text.strip()
    if not t or len(t) > 90:
        return False
    if DOC_CODE_RE.match(t):
        return True
    if re.search(r'turn\s*over', t, re.I):
        return True
    if re.search(r'\u00a9\s*(UCLES|Cambridge)', t, re.I):
        return True
    if re.search(r'this\s*document\s*has', t, re.I):
        return True
    return False

LATIN1_SAFE = {
    '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'",
    '\u201c': '"', '\u201d': '"', '\u2022': '-', '\u2026': '...',
    '\u00d7': 'x', '\u2713': '(tick)', '\u2714': '(tick)', '\u221a': '(tick)'
}


def latin1(text):
    """Make a string safe for base-14 fonts."""
    out = []
    for ch in str(text or ''):
        if ch in LATIN1_SAFE:
            out.append(LATIN1_SAFE[ch])
        elif ord(ch) <= 0xFF:
            out.append(ch)
        else:
            out.append('?')
    return ''.join(out)


def first_span_text(block):
    """First non-empty span text + its x0/y0 for a text block."""
    for line in block.get('lines', []):
        for span in line.get('spans', []):
            t = span['text'].strip()
            if t:
                return t, span['bbox'][0], span['bbox'][1]
    return None, None, None


def find_qp_question_block(page, label, after_y=0):
    """Question number block on a QP page: left column, standalone number.

    Matches both the classic format ('2') and the new 2026 format
    ('Task 2')."""
    label = str(label)
    aliases = {label, f'task {label.lower()}'}
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        t, x0, y0 = first_span_text(b)
        if t is None:
            continue
        if t.lower() in aliases and x0 < 90 and y0 > 52 and y0 >= after_y:
            return b
    return None


def find_ms_question_block(page, label, after_y=0):
    """Question row on an MS page: starts with '<label>(' in left column."""
    pat = re.compile(rf'^{re.escape(str(label))}\s*\(')
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        t, x0, y0 = first_span_text(b)
        if t is None:
            continue
        if (pat.match(t) or t == str(label)) and x0 < 100 and y0 > 48 and y0 >= after_y:
            return b
    return None


def page_content_bounds(page):
    """Content bounds of a page, excluding paper furniture.

    Works for portrait and landscape pages. Excludes: page numbers,
    barcodes (text + glyph junk), document codes (e.g. '9618/11/M/J/26'),
    publisher footers, 'Turn over' marks."""
    ph = page.rect.height
    pw = page.rect.width
    top = ph * 0.065
    bottom = ph - 50
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        y0, y1 = b['bbox'][1], b['bbox'][3]
        full = ' '.join(s['text'] for l in b.get('lines', [])
                        for s in l.get('spans', []))
        if y1 <= ph * 0.08:
            # Top zone: page numbers, barcode bars/glyphs, header lines
            top = max(top, y1 + 4)
        elif y0 >= ph - 40:
            # Bottom zone junk: barcode glyph runs
            bottom = min(bottom, y0 - 4)
        elif y0 >= ph - 90 and is_bottom_furniture(full):
            # Publisher footer / document code / 'Turn over' line
            bottom = min(bottom, y0 - 2)
    return top, bottom, 40, pw - 40


def compute_regions(doc, start_page_idx, label, find_start):
    """Locate the region(s) (page_idx, rect) covering a question."""
    if start_page_idx >= doc.page_count:
        return None
    page = doc[start_page_idx]
    start = find_start(page, label)
    if start is None:
        return None

    regions = []
    p_top, p_bottom, p_x0, p_x1 = page_content_bounds(page)
    y0 = max(p_top, start['bbox'][1] - 6)
    next_label = str(int(label) + 1) if str(label).isdigit() else None

    end_y = None
    if next_label:
        nxt = find_start(page, next_label, after_y=start['bbox'][1])
        if nxt is not None:
            end_y = nxt['bbox'][1] - 4

    if end_y is not None:
        regions.append((start_page_idx, fitz.Rect(p_x0, y0, p_x1, min(end_y, p_bottom))))
        return trim_regions(doc, regions)

    # Question continues / is last: fill to page bottom, then scan
    # continuation pages until the next question starts.
    regions.append((start_page_idx, fitz.Rect(p_x0, y0, p_x1, p_bottom)))

    cur = start_page_idx + 1
    for _ in range(MAX_CONT_PAGES):
        if cur >= doc.page_count:
            break
        p = doc[cur]
        c_top, c_bottom, c_x0, c_x1 = page_content_bounds(p)
        nxt = find_start(p, next_label) if next_label else None
        if nxt is not None:
            regions.append((cur, fitz.Rect(c_x0, c_top, c_x1, nxt['bbox'][1] - 4)))
            return trim_regions(doc, regions)
        regions.append((cur, fitz.Rect(c_x0, c_top, c_x1, c_bottom)))
        cur += 1
    return trim_regions(doc, regions)


def trim_regions(doc, regions):
    """Trim trailing whitespace (cap bottom at last content + 8pt)."""
    trimmed = []
    for page_idx, rect in regions:
        page = doc[page_idx]
        _, page_bottom, _, _ = page_content_bounds(page)
        content_bottom = rect.y0 + 20   # never trim into the heading
        for b in page.get_text('dict')['blocks']:
            bb = b['bbox']
            if bb[1] >= rect.y0 - 2 and bb[3] <= rect.y1 + 2:
                content_bottom = max(content_bottom, bb[3])
        trimmed_rect = fitz.Rect(rect.x0, rect.y0, rect.x1,
                                 min(content_bottom + 8, page_bottom))
        # When the next question begins at the very top of a continuation
        # page, glyph bounding boxes can leak a 28pt sliver into the previous
        # question. It is not meaningful question content and creates a stray
        # Word page, so discard only these tiny continuation fragments.
        if len(regions) > 1 and trimmed_rect.height <= 32:
            continue
        if len(regions) > 1:
            fragment = doc[page_idx].get_text('text', clip=trimmed_rect)
            words = set(re.findall(r'[a-z]+', fragment.lower()))
            if words and words <= {'question', 'answer', 'marks', 'guidance'}:
                continue
        trimmed.append((page_idx, trimmed_rect))
    return trimmed


class ExamDoc:
    """Flow engine: title block, question headers, region/text placement."""

    def __init__(self, exam_name, doc_type, info_lines):
        self.doc = fitz.open()
        self.exam_name = exam_name
        self.doc_type = doc_type
        self.page = None
        self.page_is_landscape = False
        self.page_bottom = PAGE_H - 56
        self.y = TOP_Y
        self._new_page()
        self.y = self._draw_title_block(info_lines)

    def _new_page(self, landscape=False):
        if landscape:
            self.page = self.doc.new_page(width=PAGE_H, height=PAGE_W)
            self.page_bottom = PAGE_W - 56
        else:
            self.page = self.doc.new_page(width=PAGE_W, height=PAGE_H)
            self.page_bottom = PAGE_H - 56
        self.page_is_landscape = landscape
        self.y = TOP_Y

    def _ensure(self, height):
        if self.y + height > self.page_bottom:
            self._new_page(self.page_is_landscape)

    def _line(self, text, y, fontsize=10, fontname='helv', align='left',
              x0=MARGIN, x1=PAGE_W - MARGIN):
        """Draw a single text line (baseline at y + fontsize)."""
        text = latin1(text)
        w = fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
        if align == 'center':
            x = (x0 + x1 - w) / 2
        elif align == 'right':
            x = x1 - w
        else:
            x = x0
        self.page.insert_text(fitz.Point(x, y + fontsize), text,
                              fontsize=fontsize, fontname=fontname)

    def _draw_title_block(self, info_lines):
        y = TOP_Y + 6
        self._line(self.exam_name, y, fontsize=20, fontname='hebo', align='center',
                   x0=0, x1=PAGE_W)
        y += 34
        self._line(self.doc_type, y, fontsize=14, fontname='hebo', align='center',
                   x0=0, x1=PAGE_W)
        y += 26
        for line in info_lines:
            self._line(line, y, fontsize=10, align='center', x0=0, x1=PAGE_W)
            y += 15
        self.page.draw_line(fitz.Point(MARGIN, y + 2),
                            fitz.Point(PAGE_W - MARGIN, y + 2), width=0.8)
        return y + 16

    def separator(self):
        """Thin rule separating consecutive questions (no text)."""
        self._ensure(24)
        self.y += 4
        self.page.draw_line(fitz.Point(MARGIN, self.y),
                            fitz.Point(self.page.rect.width - MARGIN, self.y),
                            width=0.6)
        self.y += 12

    def place_regions(self, source_doc, regions, graft):
        """Place clipped page regions, flowing. Landscape source regions
        are placed on landscape pages at near-full scale."""
        for pno, rect in regions:
            if rect.height < 4 or rect.width < 4:
                continue
            landscape = rect.width > 520
            content_w = (PAGE_H if landscape else PAGE_W) - 2 * MARGIN
            h = min(rect.height * content_w / rect.width,
                    self.page_bottom - TOP_Y)
            if self.page_is_landscape != landscape or self.y + h > self.page_bottom:
                self._new_page(landscape)
            target = fitz.Rect(MARGIN, self.y, MARGIN + content_w, self.y + h)
            try:
                self.page.show_pdf_page(target, source_doc, pno,
                                        clip=rect, graftmap=graft)
            except TypeError:
                self.page.show_pdf_page(target, source_doc, pno, clip=rect)
            self.y += h + 10

    def place_text(self, text, fontsize=10.5):
        """Paragraph-flow fallback for questions without located regions."""
        for para in str(text or '').split('\n'):
            if not para.strip():
                self.y += 6
                continue
            while True:
                rect = fitz.Rect(MARGIN, self.y, PAGE_W - MARGIN, self.page_bottom)
                leftover = self.page.insert_textbox(
                    rect, latin1(para), fontsize=fontsize, fontname='helv')
                if leftover >= 0:
                    self.y = self.page_bottom - leftover + 8
                    break
                avail = self.page_bottom - self.y
                full = self.page_bottom - TOP_Y
                if avail < full * 0.6:
                    self._new_page()
                    continue
                if fontsize > 8:
                    fontsize -= 1
                    continue
                break  # give up gracefully (extremely long single paragraph)

    def add_footers(self):
        n = self.doc.page_count
        for i in range(n):
            page = self.doc[i]
            pw = page.rect.width
            ph = page.rect.height
            save_page = self.page
            self.page = page
            self._line(f'{self.exam_name} - {self.doc_type}', ph - 40,
                       fontsize=8.5, x1=pw - MARGIN)
            self._line(f'Page {i + 1} of {n}', ph - 40, fontsize=8.5,
                       align='right', x1=pw - MARGIN)
            self.page = save_page

    def save(self, path):
        self.add_footers()
        self.doc.save(path, deflate=True)
        return self.doc.page_count


# ==========================================================================
# WORD (.docx) OUTPUT
# Located question / mark-scheme regions are reconstructed as stable Word
# paragraphs while retaining source positions, type treatment, response lines,
# and mark columns. Tables, photos, and diagrams remain exact source images so
# Word cannot disturb their geometry. Items without a located source region
# fall back to editable database text.
# ==========================================================================

DOCX_PAGE_MM = (210, 297)          # A4 portrait (width, height)
DOCX_MARGIN = Cm(1.6)


def docx_add_field(paragraph, instr):
    """Insert a Word field (e.g. PAGE, NUMPAGES) into a paragraph."""
    run = paragraph.add_run()
    b = OxmlElement('w:fldChar')
    b.set(qn('w:fldCharType'), 'begin')
    i = OxmlElement('w:instrText')
    i.set(qn('xml:space'), 'preserve')
    i.text = instr
    e = OxmlElement('w:fldChar')
    e.set(qn('w:fldCharType'), 'end')
    run._r.append(b)
    run._r.append(i)
    run._r.append(e)


def docx_add_hr(doc):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '999999')
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p


def docx_new_section(doc, landscape):
    s = doc.add_section(WD_SECTION.NEW_PAGE)
    if landscape:
        s.orientation = WD_ORIENT.LANDSCAPE
        s.page_width = Mm(DOCX_PAGE_MM[1])
        s.page_height = Mm(DOCX_PAGE_MM[0])
    else:
        s.orientation = WD_ORIENT.PORTRAIT
        s.page_width = Mm(DOCX_PAGE_MM[0])
        s.page_height = Mm(DOCX_PAGE_MM[1])
    s.left_margin = s.right_margin = DOCX_MARGIN
    # Mark-scheme grids use almost the full height of landscape A4. The
    # smaller vertical margin prevents an otherwise 1 mm overflow from
    # splitting one source table across two Word pages.
    vertical_margin = Cm(0.8) if landscape else Cm(1.4)
    s.top_margin = s.bottom_margin = vertical_margin
    return s


def _region_analysis(page, rect):
    """Classify a clipped page region for editable reconstruction.

    Returns a dict:
      image    - True if the region contains real raster images
      diagram  - True if there are complex non-table vector drawings
      tables   - list of dicts {bbox, rows(extract), row_rects}
    """
    image_rects = [fitz.Rect(i['bbox']) & rect for i in page.get_image_info()
                   if fitz.Rect(i['bbox']).intersects(rect)]

    tables = []
    used = fitz.Rect(0, 0, 0, 0)
    try:
        # Detect on the full source page, then select rows inside the clipped
        # question region. Detecting only inside `rect` fails when a published
        # mark-scheme table continues from the preceding page.
        tabs = page.find_tables()
        for t in tabs.tables:
            all_rows = t.extract()
            selected = []
            for row_idx, row in enumerate(t.rows):
                rr = fitz.Rect(row.bbox)
                overlap = rr & rect
                if (not overlap.is_empty and overlap.height >=
                        min(3, rr.height * 0.5)):
                    selected.append(row_idx)
            if not selected:
                continue
            rows = [all_rows[i] for i in selected if i < len(all_rows)]
            row_rects = [fitz.Rect(t.rows[i].bbox) & rect for i in selected]
            tb = row_rects[0]
            for rr in row_rects[1:]:
                tb |= rr
            active_cols = max((sum(1 for value in r
                                   if _clean_cell_text(value))
                               for r in rows), default=0)
            if 1 <= active_cols <= 6 and len(rows) >= 1 and tb.width >= 40:
                tables.append({'bbox': tb, 'rows': rows, 'row_rects': row_rects})
    except Exception:
        pass

    # PyMuPDF may report a table inside a cell as a second table even though
    # the outer table's extracted cell text already contains it. Emitting both
    # duplicates content and forces mark schemes onto extra pages.
    retained = []
    for table in sorted(tables,
                        key=lambda value: value['bbox'].get_area(),
                        reverse=True):
        box = table['bbox']
        nested = any(
            outer['bbox'].x0 <= box.x0 + 1 and
            outer['bbox'].y0 <= box.y0 + 1 and
            outer['bbox'].x1 >= box.x1 - 1 and
            outer['bbox'].y1 >= box.y1 - 1
            for outer in retained)
        if not nested:
            retained.append(table)
    tables = sorted(retained, key=lambda value: value['bbox'].y0)
    used = fitz.Rect(0, 0, 0, 0)
    for table in tables:
        used |= table['bbox']

    # Non-table vector drawings -> complex shapes indicate a diagram
    rest = 0
    diagram_rect = None
    for d in page.get_drawings():
        r = fitz.Rect(d['rect'])
        if not r.intersects(rect):
            continue
        if r.intersects(used):
            continue
        if r.width < 8 and r.height < 8:       # dotted-leader dots
            continue
        if r.height <= 1.5 or r.width <= 1.5:  # thin grid / underline lines
            continue
        rest += 1
        diagram_rect = r if diagram_rect is None else diagram_rect | r

    visuals = list(image_rects)
    if rest > 3 and diagram_rect is not None:
        clipped = diagram_rect & rect
        visuals.append(fitz.Rect(max(rect.x0, clipped.x0 - 2),
                                 max(rect.y0, clipped.y0 - 2),
                                 min(rect.x1, clipped.x1 + 2),
                                 min(rect.y1, clipped.y1 + 2)))

    return {'image': bool(image_rects), 'diagram': rest > 3,
            'visuals': visuals, 'tables': tables, 'rest_drawings': rest}


def _clean_cell_text(text):
    lines = []
    for line in str(text or '').replace('\ufffd', '\u2022').splitlines():
        lines.append(' '.join(line.split()))
    return '\n'.join(lines).strip()


def _set_cell_margins(cell, top=50, start=70, bottom=50, end=70):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in('w:tcMar')
    if tcMar is None:
        tcMar = OxmlElement('w:tcMar')
        tcPr.append(tcMar)
    for edge, value in (('top', top), ('start', start),
                        ('bottom', bottom), ('end', end)):
        node = tcMar.find(qn(f'w:{edge}'))
        if node is None:
            node = OxmlElement(f'w:{edge}')
            tcMar.append(node)
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')


# PDF font names (with subset prefixes and style suffixes) -> Word names
FONT_ALIASES = {
    'timesnewroman': 'Times New Roman',
    'timesnewromanps': 'Times New Roman',
    'times': 'Times New Roman',
    'helvetica': 'Arial',
    'univers': 'Arial',
    'arial': 'Arial',
    'calibri': 'Calibri',
    'cambria': 'Cambria',
    'couriernew': 'Courier New',
    'courier': 'Courier New',
    'verdana': 'Verdana',
    'georgia': 'Georgia',
    'tahoma': 'Tahoma',
    'symbol': 'Symbol',
    'zapfdingbats': 'ZapfDingbats',
}


def _style_run_from_span(run, span):
    """Carry the source PDF span's editable type styling into Word."""
    font_name = span.get('font') or 'Arial'
    font_name = re.sub(r'^[A-Z]{6}\+', '', font_name)     # subset prefix
    font_name = re.sub(r'[-,](Bold|Italic|Oblique|Regular|MT).*$','',
                       font_name, flags=re.I) or 'Arial'
    font_name = re.sub(r'(PS|MT)$', '', font_name) or 'Arial'
    font_name = FONT_ALIASES.get(font_name.lower().replace(' ', ''),
                                 font_name)
    run.font.name = font_name
    run.font.size = Pt(max(7, min(16, span.get('size', 11))))
    flags = span.get('flags', 0)
    run.bold = bool(flags & 16) or 'bold' in (span.get('font') or '').lower()
    run.italic = bool(flags & 2) or any(
        word in (span.get('font') or '').lower() for word in ('italic', 'oblique'))


def _docx_answer_line(doc):
    """Dotted writing line (editable): empy paragraph with a dotted border."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(10)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'dotted')
    bottom.set(qn('w:sz'), '4')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '000000')
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p


def _emit_table(doc, table, content_w_mm):
    """Rebuild a detected paper table as a real editable Word table."""
    raw_rows = table['rows']
    # PDF table detectors often represent merged cells as alternating empty
    # columns (the header may use columns 1/3/5 while body rows use 0/2/4).
    # Collapse those placeholders per row to recover the visible table.
    rows_data = [[clean for value in r
                  if (clean := _clean_cell_text(value))] for r in raw_rows]
    # Drop fully-empty rows (phantom header rows etc.)
    rows_data = [r for r in rows_data if any(r)]
    if not rows_data:
        return
    cols = max(len(r) for r in rows_data)
    # Pad short rows so per-column sizing below can index every row safely.
    rows_data = [r + [''] * (cols - len(r)) for r in rows_data]

    tbl = doc.add_table(rows=len(rows_data), cols=cols)
    tbl.style = 'Table Grid'
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False

    # Cambridge mark schemes use Question | Answer | Marks. Preserve those
    # proportions instead of allowing long answers to collapse the side cols.
    if cols == 3:
        widths = [0.12, 0.79, 0.09]
    elif cols == 2:
        widths = [0.28, 0.72]
    else:
        lengths = [max((len(r[c]) for r in rows_data), default=0)
                   for c in range(cols)]
        total = sum(max(v, 4) for v in lengths) or 1
        widths = [max(v, 4) / total for v in lengths]
    for c, col in enumerate(tbl.columns):
        col.width = Mm(content_w_mm * widths[c])
    # Word honours explicit cell widths more reliably than grid columns
    for row in tbl.rows:
        for c, cell in enumerate(row.cells):
            if c < cols:
                cell.width = Mm(content_w_mm * widths[c])

    # Row heights from the original paper row geometry (scaled)
    row_rects = table.get('row_rects') or []
    scale = content_w_mm / (table['bbox'].width or 1)
    for ridx in range(min(len(tbl.rows), len(row_rects))):
        h_mm = row_rects[ridx].height * scale
        if 3 < h_mm < 80:
            tbl.rows[ridx].height = Mm(h_mm)
            tbl.rows[ridx].height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST

    for ridx, r in enumerate(rows_data):
        for c in range(cols):
            text = r[c] if c < len(r) else ''
            cell = tbl.cell(ridx, c)
            cell.text = ''
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            _set_cell_margins(cell)
            lines = str(text).split('\n') or ['']
            for line_idx, line in enumerate(lines):
                p = cell.paragraphs[0] if line_idx == 0 else cell.add_paragraph()
                p.paragraph_format.space_after = Pt(1)
                run = p.add_run(line)
                run.font.name = 'Arial'
                run.font.size = Pt(9)
                if ridx == 0:
                    run.bold = True
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return


def _spans_to_lines(page, rect, exclude_rects):
    """Reconstruct visual lines from text spans, keeping bold runs."""
    spans = []
    blocks = page.get_text('dict', clip=rect)['blocks']
    for b in blocks:
        if b['type'] != 0:
            continue
        for line in b.get('lines', []):
            for s in line.get('spans', []):
                sr = fitz.Rect(s['bbox'])
                if any(sr.intersects(x) for x in exclude_rects):
                    continue
                spans.append({
                    'text': s['text'], 'x0': sr.x0, 'y0': sr.y0,
                    'x1': sr.x1, 'y1': sr.y1, 'font': s.get('font'),
                    'size': s.get('size', 11), 'flags': s.get('flags', 0)
                })

    lines = []
    for sp in sorted(spans, key=lambda s: (s['y0'], s['x0'])):
        placed = False
        for ln in lines:
            if abs(sp['y0'] - ln['y']) < 3.0:
                ln['spans'].append(sp)
                placed = True
                break
        if not placed:
            lines.append({'y': sp['y0'], 'spans': [sp]})
    for ln in lines:
        ln['spans'].sort(key=lambda s: s['x0'])
    lines.sort(key=lambda ln: ln['y'])
    return lines


def _emit_editable_region(doc, src_doc, pno, rect, content_w_mm):
    """Rebuild a region as editable text with source-faithful visuals.

    Tables are deliberately retained as high-resolution source images. Word's
    table layout engine otherwise changes column widths, merged cells, glyphs,
    and row heights. Ordinary question text remains editable.
    """
    page = src_doc[pno]
    analysis = _region_analysis(page, rect)

    exclude_rects = [t['bbox'] for t in analysis['tables']]
    exclude_rects += analysis.get('visuals', [])
    lines = _spans_to_lines(page, rect, exclude_rects)

    items = [{'y': ln['y'], 'kind': 'line', 'data': ln} for ln in lines]
    items += [{'y': t['bbox'].y0, 'kind': 'table', 'data': t}
              for t in analysis['tables']]
    items += [{'y': r.y0, 'kind': 'visual', 'data': r}
              for r in analysis.get('visuals', []) if r.width > 3 and r.height > 3]

    # Thin long horizontal vectors -> dotted answer writing lines
    for d in page.get_drawings():
        r = fitz.Rect(d['rect'])
        if not r.intersects(rect):
            continue
        if r.height <= 1.5 and r.width > 60 and not any(
                r.intersects(t['bbox']) for t in analysis['tables']):
            items.append({'y': r.y0, 'kind': 'ansline', 'data': r})

    items.sort(key=lambda it: it['y'])
    scale = (content_w_mm * 72 / 25.4) / max(rect.width, 1)
    previous_y = rect.y0
    for it in items:
        vertical_gap = max(0, (it['y'] - previous_y) * scale)
        if it['kind'] == 'line':
            spans = it['data']['spans']
            line_text = ''.join(sp['text'] for sp in spans).strip()
            first_span = spans[0]

            # Cambridge response lines are published as literal dot runs.
            # Replace those runs with one Word dot-leader tab whose endpoint
            # is fixed at the right content margin, so every line aligns even
            # after surrounding text is edited.
            dot_run = re.search(r'\.{8,}', line_text)
            if dot_run:
                prefix = line_text[:dot_run.start()].rstrip()
                suffix = line_text[dot_run.end():].strip()
                mark_suffix = (suffix if re.fullmatch(
                    r'\[\s*\d+\s*\]', suffix) else '')
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Pt(max(
                    0, (first_span['x0'] - rect.x0) * scale))
                p.paragraph_format.right_indent = Pt(0)
                p.paragraph_format.space_before = Pt(min(12, vertical_gap))
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = Pt(
                    max(sp['size'] for sp in spans) * 1.15)
                p.paragraph_format.tab_stops.add_tab_stop(
                    Pt(content_w_mm * 72 / 25.4),
                    WD_TAB_ALIGNMENT.RIGHT,
                    WD_TAB_LEADER.DOTS)
                if prefix:
                    run = p.add_run(prefix + ' ')
                    _style_run_from_span(run, first_span)
                leader = p.add_run('\t')
                _style_run_from_span(leader, first_span)
                if mark_suffix:
                    mark = p.add_run(mark_suffix)
                    _style_run_from_span(mark, spans[-1])
                previous_y = max(sp['y1'] for sp in spans)
                continue

            # A bracketed value on its own is the question's mark total. Keep
            # it beneath the preceding content and lock it to one right-hand
            # column throughout the generated paper.
            if re.fullmatch(r'\[\s*\d+\s*\]', line_text):
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                p.paragraph_format.left_indent = Pt(0)
                p.paragraph_format.right_indent = Pt(0)
                p.paragraph_format.space_before = Pt(min(8, vertical_gap))
                p.paragraph_format.space_after = Pt(2)
                run = p.add_run(line_text)
                _style_run_from_span(run, first_span)
                previous_y = max(sp['y1'] for sp in spans)
                continue

            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(max(
                0, (first_span['x0'] - rect.x0) * scale))
            p.paragraph_format.space_before = Pt(min(12, vertical_gap))
            p.paragraph_format.space_after = Pt(0)
            max_size = max((sp['size'] for sp in spans), default=11)
            p.paragraph_format.line_spacing = Pt(max_size * 1.15)
            cursor_x = first_span['x0']
            for sp in spans:
                if sp['x0'] - cursor_x > max(12, sp['size'] * 1.2):
                    stop = max(0, (sp['x0'] - rect.x0) * scale)
                    p.paragraph_format.tab_stops.add_tab_stop(
                        Pt(stop), WD_TAB_ALIGNMENT.LEFT)
                    p.add_run('\t')
                run = p.add_run(sp['text'])
                _style_run_from_span(run, sp)
                cursor_x = sp['x1']
            previous_y = max(sp['y1'] for sp in spans)
        elif it['kind'] == 'table':
            tb = it['data']['bbox'] & rect
            pix = page.get_pixmap(clip=tb, dpi=300, alpha=False)
            png = BytesIO(pix.tobytes('png'))
            width_mm = min(content_w_mm, tb.width * scale * 25.4 / 72)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(max(
                0, (tb.x0 - rect.x0) * scale))
            p.paragraph_format.space_before = Pt(min(12, vertical_gap))
            p.paragraph_format.space_after = Pt(2)
            p.add_run().add_picture(png, width=Mm(width_mm))
            previous_y = tb.y1
        elif it['kind'] == 'visual':
            vr = it['data'] & rect
            pix = page.get_pixmap(clip=vr, dpi=240, alpha=False)
            png = BytesIO(pix.tobytes('png'))
            width_mm = min(content_w_mm, vr.width * scale * 25.4 / 72)
            doc.add_picture(png, width=Mm(width_mm))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            previous_y = vr.y1
        elif it['kind'] == 'ansline':
            _docx_answer_line(doc)
            previous_y = it['data'].y1
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def _question_needs_image(src_doc, regions):
    """True if any region has raster images, diagrams, or tick-box tables."""
    for pno, rect in regions:
        if rect.height < 4 or rect.width < 4:
            continue
        a = _region_analysis(src_doc[pno], rect)
        if a['image'] or a['diagram']:
            return True
        for t in a['tables']:
            for r in t['rows']:
                for c in r:
                    if c == '\u2713' or c == '\u2714':
                        return True
    return False


def _clean_answers(answers):
    """Dedupe + clean mark-scheme answer text for editable output."""
    seen = set()
    out = []
    noise = re.compile(
        r'^(Question\s+Answer\s+Marks\s*|PUBLISHED.*|'
        r'\d{4}/\d+.*(UCLES|Cambridge).*|©.*UCLES.*|'
        r'Cambridge International.*Mark Scheme.*)$', re.I)
    page_ref = re.compile(r'Page\s+\d+\s+of\s+\d+')
    for a in answers:
        a = str(a or '')
        if not a.strip() or a in seen:
            continue
        seen.add(a)
        lines = []
        for l in a.split('\n'):
            l = page_ref.sub('', l).strip()
            if not l or noise.match(l):
                continue
            lines.append(l)
        a = '\n'.join(lines).strip()
        if a:
            out.append(a)
    return out


def build_image_docx_from_pdf(pdf_path, exam_name, doc_type, docx_path,
                              dpi=200):
    """Build a Word document that matches the exam PDF page-for-page.

    Each PDF page is rendered at high resolution and placed full-width on an
    A4 page (matching orientation). Result: the .docx looks exactly like the
    PDF output, including tables, diagrams and layout.
    """
    src = fitz.open(pdf_path)
    doc = Document()
    normal = doc.styles['Normal']
    normal.font.name = 'Arial'
    normal.font.size = Pt(10.5)

    margin = Cm(1.2)
    for idx, page in enumerate(src):
        section = (doc.sections[0] if idx == 0
                   else doc.add_section(WD_SECTION.NEW_PAGE))
        landscape = page.rect.width > page.rect.height
        section.orientation = (WD_ORIENT.LANDSCAPE if landscape
                               else WD_ORIENT.PORTRAIT)
        section.page_width = Mm(DOCX_PAGE_MM[1] if landscape
                                else DOCX_PAGE_MM[0])
        section.page_height = Mm(DOCX_PAGE_MM[0] if landscape
                                 else DOCX_PAGE_MM[1])
        section.left_margin = section.right_margin = margin
        section.top_margin = section.bottom_margin = margin

        content_w_emu = (section.page_width - section.left_margin
                         - section.right_margin)
        content_h_emu = (section.page_height - section.top_margin
                         - section.bottom_margin)

        pix = page.get_pixmap(dpi=dpi, alpha=False)
        png = BytesIO(pix.tobytes('png'))
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        run = p.add_run()
        # Fit within the page content box, preserving aspect ratio
        aspect = page.rect.height / page.rect.width
        w_at_full = content_w_emu
        h_at_full = int(w_at_full * aspect)
        if h_at_full <= content_h_emu:
            run.add_picture(png, width=w_at_full)
        else:
            run.add_picture(png, height=content_h_emu)

    doc.save(docx_path)
    src.close()
    return True


def build_exam(exam_name, doc_type, items, source_cache, show_marks):
    """items: [{regions, text, source_path}]"""
    exam = ExamDoc(
        exam_name, doc_type,
        ([f'Total marks: {sum(i["marks"] or 0 for i in items)}'] if show_marks else [])
        + [f'Questions: {len(items)}'])
    graft = fitz.Graftmap(exam.doc)

    for idx, item in enumerate(items):
        if idx > 0:
            exam.separator()
        src = source_cache.get(item['source_path'])
        if src is not None and item.get('regions'):
            exam.place_regions(src, item['regions'], graft)
        else:
            exam.place_text(item.get('text'))

    return exam


def build_docx(exam_name, doc_type, items, source_cache, show_marks, out_path):
    """Build a stable Word copy using paragraphs plus source visuals.

    No positioned text boxes are used. Each source-page region begins on a
    fresh Word page so edits can reflow inside that page without moving content
    from unrelated questions.
    """
    print(f'   building {doc_type} as Word...', file=sys.stderr)
    doc = Document()
    # Sensible defaults so fallback text and table cells match the papers
    normal = doc.styles['Normal']
    normal.font.name = 'Arial'
    normal.font.size = Pt(10.5)
    sec = doc.sections[0]
    sec.page_width = Mm(DOCX_PAGE_MM[0])
    sec.page_height = Mm(DOCX_PAGE_MM[1])
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.left_margin = sec.right_margin = DOCX_MARGIN
    sec.top_margin = sec.bottom_margin = Cm(1.4)

    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    fp.add_run(f'{exam_name} - {doc_type}    Page ')
    docx_add_field(fp, 'PAGE')
    fp.add_run(' of ')
    docx_add_field(fp, 'NUMPAGES')

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(exam_name)
    r.bold = True
    r.font.size = Pt(22)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(doc_type)
    r.bold = True
    r.font.size = Pt(14)

    total = sum(item['marks'] or 0 for item in items) if show_marks else None
    info = [f'Questions: {len(items)}']
    if total is not None:
        info.insert(0, f'Total marks: {total}')
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('    '.join(info))
    r.font.size = Pt(10)

    docx_add_hr(doc)

    cur_land = False
    for item in items:
        src = source_cache.get(item['source_path'])
        regions = item.get('regions')
        if src is not None and regions:
            # Keep ordinary source text in stable Word paragraphs. Preserve
            # tables, photos, and diagrams as exact source images.
            for pno, rect in regions:
                if rect.height < 4 or rect.width < 4:
                    continue
                page = src[pno]
                landscape = page.rect.width > page.rect.height
                if landscape != cur_land:
                    docx_new_section(doc, landscape)
                    cur_land = landscape
                else:
                    doc.add_page_break()
                # A slight landscape reduction keeps tall mark-scheme tables
                # inside one page even after Word applies cell padding.
                content_w_mm = (250 if landscape
                                else DOCX_PAGE_MM[0] - 32)
                _emit_editable_region(doc, src, pno, rect, content_w_mm)
        else:
            # No usable source region: retain a readable editable fallback.
            doc.add_page_break()
            fallback = item.get('answers') or [item.get('text')]
            for para in fallback:
                para = str(para or '')
                if not para.strip():
                    continue
                tp = doc.add_paragraph(para)
                tp.paragraph_format.space_after = Pt(6)

    doc.save(out_path)
    return True


def _find_libreoffice():
    """Locate LibreOffice, used for positioned editable PDF import."""
    configured = os.environ.get('LIBREOFFICE_PATH')
    candidates = [
        configured,
        shutil.which('soffice'),
        r'C:\Program Files\LibreOffice\program\soffice.exe',
        r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def _redact_outside_region(page, region):
    """Permanently remove source-page content outside a selected region."""
    bounds = page.rect
    zones = [
        fitz.Rect(bounds.x0, bounds.y0, bounds.x1, region.y0),
        fitz.Rect(bounds.x0, region.y1, bounds.x1, bounds.y1),
        fitz.Rect(bounds.x0, region.y0, region.x0, region.y1),
        fitz.Rect(region.x1, region.y0, bounds.x1, region.y1),
    ]
    for zone in zones:
        if zone.width > 0 and zone.height > 0:
            page.add_redact_annot(zone, fill=(1, 1, 1))
    page.apply_redactions()


def build_word_source_pdf(exam_name, doc_type, items, source_cache,
                          show_marks, out_path):
    """Create clean A4 pages for Word without nested PDF clipping objects.

    Each selected source page is copied directly, then content outside the
    question is permanently removed. This preserves native PDF text, tables,
    lines and diagrams at their original positions and prevents office import
    tools from exposing hidden neighbouring questions.
    """
    info = ([f'Total marks: {sum(i["marks"] or 0 for i in items)}']
             if show_marks else []) + [f'Questions: {len(items)}']
    title_doc = ExamDoc(exam_name, doc_type, info)
    out = title_doc.doc

    for item in items:
        src = source_cache.get(item['source_path'])
        regions = item.get('regions')
        if src is not None and regions:
            for page_number, region in regions:
                out.insert_pdf(src, from_page=page_number, to_page=page_number)
                copied = out[-1]
                _redact_outside_region(copied, region)
        else:
            page = out.new_page(width=PAGE_W, height=PAGE_H)
            fallback = item.get('answers') or [item.get('text')]
            text = '\n\n'.join(str(value or '') for value in fallback)
            page.insert_textbox(
                fitz.Rect(MARGIN, TOP_Y, PAGE_W - MARGIN, PAGE_H - MARGIN),
                latin1(text), fontsize=10.5, fontname='helv')

    out.save(out_path, garbage=4, deflate=True)
    out.close()


def _zero_docx_page_margins(docx_path):
    """Remove LibreOffice's injected 1 cm margins without rewriting shapes.

    Imported text boxes are positioned relative to the Word text column.
    LibreOffice adds 567-twip margins, shifting every object 28.35 points.
    Updating only the section margin XML makes those editable object
    coordinates line up with the canonical PDF page coordinates.
    """
    rewritten = docx_path + '.margins.tmp'
    margin_attr = re.compile(
        r'w:(top|right|bottom|left|header|footer|gutter)="[^"]*"')
    with zipfile.ZipFile(docx_path, 'r') as source, \
            zipfile.ZipFile(rewritten, 'w') as target:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename == 'word/document.xml':
                xml = data.decode('utf-8')
                xml = margin_attr.sub(lambda m: f'w:{m.group(1)}="0"', xml)
                data = xml.encode('utf-8')
            target.writestr(entry, data)
    os.replace(rewritten, docx_path)


def build_layout_preserving_docx(pdf_path, docx_path, doc_type):
    """Import the canonical exam PDF as positioned, editable Word objects.

    The delivered PDF itself is the Word source, so both files share exactly
    the same page geometry, object positions and page breaks.
    """
    soffice = _find_libreoffice()
    if not soffice:
        raise RuntimeError(
            'LibreOffice is required for editable, format-preserving Word '
            'output. Install LibreOffice or set LIBREOFFICE_PATH.')

    output_dir = os.path.dirname(os.path.abspath(docx_path))
    os.makedirs(output_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.exam-word-',
                                     dir=output_dir) as work_dir:
        base_name = Path(docx_path).stem
        conversion_pdf = os.path.join(work_dir, base_name + '.pdf')
        profile_dir = os.path.join(work_dir, 'libreoffice-profile')
        shutil.copy2(pdf_path, conversion_pdf)

        profile_uri = Path(profile_dir).resolve().as_uri()
        command = [
            soffice,
            f'-env:UserInstallation={profile_uri}',
            '--headless',
            '--infilter=writer_pdf_import',
            '--convert-to', 'docx',
            '--outdir', work_dir,
            conversion_pdf,
        ]
        print(f'   converting {doc_type} to positioned editable Word...',
              file=sys.stderr)
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=120)
        generated = os.path.join(work_dir, base_name + '.docx')
        if result.returncode != 0 or not os.path.isfile(generated):
            detail = (result.stderr or result.stdout or '').strip()[:500]
            raise RuntimeError(
                f'{doc_type} Word conversion failed. {detail}'.strip())
        _zero_docx_page_margins(generated)
        os.replace(generated, docx_path)

    if not os.path.exists(docx_path) or os.path.getsize(docx_path) == 0:
        raise RuntimeError(f'{doc_type} Word conversion produced no output.')
    return True


def main():
    spec_path = sys.argv[1]
    with open(spec_path, 'r', encoding='utf-8') as f:
        spec = json.load(f)

    exam_name = spec['exam_name']
    questions = spec['questions']

    source_cache = {}
    qp_items, ms_items = [], []
    qp_regions_found = 0
    ms_regions_found = 0

    for idx, q in enumerate(questions):
        # --- Question paper: clipped region from the source paper ---
        qp_regions = None
        if q.get('qp_path') and os.path.exists(q['qp_path']) and q.get('qp_page'):
            try:
                if q['qp_path'] not in source_cache:
                    source_cache[q['qp_path']] = fitz.open(q['qp_path'])
                qp_regions = compute_regions(
                    source_cache[q['qp_path']], q['qp_page'] - 1, q['num_label'],
                    find_qp_question_block)
                if qp_regions:
                    qp_regions_found += 1
            except Exception as e:
                print(f'QP region failed for {q.get("id")}: {e}', file=sys.stderr)
                qp_regions = None
        qp_items.append({
            'marks': q.get('marks'),
            'regions': qp_regions, 'text': q.get('text'),
            'source_path': q.get('qp_path')
        })

        # --- Mark scheme: clipped region, fallback to answers text ---
        ms_regions = None
        if q.get('ms_path') and os.path.exists(q['ms_path']) and q.get('ms_page'):
            try:
                if q['ms_path'] not in source_cache:
                    source_cache[q['ms_path']] = fitz.open(q['ms_path'])
                ms_regions = compute_regions(
                    source_cache[q['ms_path']], q['ms_page'] - 1, q['num_label'],
                    find_ms_question_block)
                if ms_regions:
                    ms_regions_found += 1
            except Exception as e:
                print(f'MS region failed for {q.get("id")}: {e}', file=sys.stderr)
                ms_regions = None
        answers = [a for a in (q.get('answers') or []) if a and str(a).strip()]
        if answers:
            ms_text = '\n\n'.join(str(a) for a in answers)
            ms_answers = _clean_answers(answers)
        else:
            page_ref = f', page {q["ms_page"]}' if q.get('ms_page') else ''
            ms_text = (f'Answers not available in text form. '
                       f'Refer to the source mark scheme{page_ref}.')
            ms_answers = None
        ms_items.append({
            'marks': None,
            'regions': ms_regions, 'text': ms_text,
            'answers': ms_answers,
            'source_path': q.get('ms_path')
        })

    # Keep the PDF as the exact-layout source-paper version.
    build_word_source_pdf(exam_name, 'Question Paper', qp_items, source_cache,
                          True, spec['out_qp'])
    with fitz.open(spec['out_qp']) as qp_pdf:
        qp_pages = qp_pdf.page_count

    build_word_source_pdf(exam_name, 'Mark Scheme', ms_items, source_cache,
                          False, spec['out_ms'])
    with fitz.open(spec['out_ms']) as ms_pdf:
        ms_pages = ms_pdf.page_count

    docx_built = False
    docx_mode = None
    if spec.get('out_qp_docx') and spec.get('out_ms_docx'):
        if not HAS_DOCX:
            raise RuntimeError(
                'python-docx is required for editable Word output.')
        build_docx(exam_name, 'Question Paper', qp_items, source_cache,
                   True, spec['out_qp_docx'])
        build_docx(exam_name, 'Mark Scheme', ms_items, source_cache,
                   False, spec['out_ms_docx'])
        docx_built = True
        docx_mode = 'reflowable'

    for src in source_cache.values():
        src.close()

    print(json.dumps({
        'success': True,
        'qp_pages': qp_pages,
        'ms_pages': ms_pages,
        'question_count': len(questions),
        'total_marks': sum(q.get('marks') or 0 for q in questions),
        'qp_regions': qp_regions_found,
        'ms_regions': ms_regions_found,
        'docx': docx_built,
        'docx_mode': docx_mode
    }))


if __name__ == '__main__':
    main()
