"""Text extraction from uploaded documents (no network, no database)."""
import io

import pytest

from app.core import file_processor as fp

MARKER = "Quarterly revenue was 4.2 crore"


def make_pdf(text: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawString(72, 750, text)
    c.showPage()
    c.drawString(72, 750, "Second page: headcount 42")
    c.save()
    return buf.getvalue()


def make_docx(text: str) -> bytes:
    from docx import Document

    d = Document()
    d.add_paragraph(text)
    t = d.add_table(rows=1, cols=2)
    t.cell(0, 0).text = "Region"
    t.cell(0, 1).text = "South"
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def make_xlsx() -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Month", "Revenue"])
    ws.append(["Jan", 1200])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_pdf_text_is_extracted():
    text = fp.extract_text_from_pdf(make_pdf(MARKER))
    assert MARKER in text and "headcount 42" in text


def test_docx_text_and_tables_are_extracted():
    text = fp.extract_text_from_word(make_docx(MARKER))
    assert MARKER in text and "Region" in text and "South" in text


def test_xlsx_sheets_are_extracted():
    text = fp.extract_text_from_excel(make_xlsx())
    assert "Sales" in text and "1200" in text


def test_csv_is_extracted():
    text = fp.extract_text_from_csv(b"name;role\nAsha;CEO\n")
    assert "Asha" in text and "CEO" in text


@pytest.mark.parametrize("filename,builder", [
    ("report.pdf", lambda: make_pdf(MARKER)),
    ("notes.docx", lambda: make_docx(MARKER)),
    ("plan.txt", lambda: MARKER.encode()),
])
def test_extract_text_dispatches_on_extension(filename, builder):
    assert MARKER in fp.extract_text(builder(), filename)


def test_corrupt_files_return_empty_text_instead_of_raising():
    assert fp.extract_text(b"%PDF-1.4 not really a pdf", "broken.pdf") == ""
    assert fp.extract_text(b"PK\x03\x04garbage", "broken.docx") == ""
    assert fp.extract_text(b"", "empty.txt") == ""


def test_chunking_covers_the_whole_text():
    text = " ".join(f"word{i}" for i in range(3000))
    chunks = fp.chunk_text(text)
    assert len(chunks) > 1
    assert "word0" in chunks[0] and "word2999" in chunks[-1]
