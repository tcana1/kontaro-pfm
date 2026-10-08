#!/usr/bin/env python3
"""
Extract raw text/tables from PDFs in tests/files/ using the same parameters
as each production parser. Outputs are saved to tests/extracts/<stem>/.

  tests/extracts/<stem>/page_01.txt          -- extract_text() output
  tests/extracts/<stem>/page_01_tables.json  -- extract_tables() output (C6 Global only)
  tests/extracts/<stem>/meta.json            -- parser, password, page count

Run from the importer/ directory (PDF_PASSWORDS="pw1,pw2" for protected files):
    python3 scripts/extract_pdf_text.py [--files-dir tests/files] [--out-dir tests/extracts]
"""

import argparse
import json
import os
import re
import sys

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber not found — run: pip install pdfplumber")

# Passwords to try, in order (empty string = no password).
# Extra candidates come from PDF_PASSWORDS (comma-separated).
PASSWORDS = [""] + [p for p in os.environ.get("PDF_PASSWORDS", "").split(",") if p]

# Filename-prefix → parser config
# extract_text_kwargs : passed verbatim to page.extract_text()
# extract_tables      : also run extract_tables() (C6 Global parsers)
CONFIGS = [
    # Most-specific patterns first
    {"prefix": "C6_Conta_Global_EUR", "parser": "c6_global_eur",
     "extract_text_kwargs": {}, "extract_tables": True},
    {"prefix": "C6_Conta_Global_USD", "parser": "c6_global_usd",
     "extract_text_kwargs": {}, "extract_tables": True},
    {"prefix": "c6_cartao",           "parser": "c6",
     "extract_text_kwargs": {}, "extract_tables": False},
    {"prefix": "btg_cartao",          "parser": "btg",
     "extract_text_kwargs": {}, "extract_tables": False},
    {"prefix": "BTG_",                "parser": "btg",
     "extract_text_kwargs": {}, "extract_tables": False},
    {"prefix": "Fatura_BTG",          "parser": "btg",
     "extract_text_kwargs": {}, "extract_tables": False},
    {"prefix": "itau_cartao_master",  "parser": "itau",
     "extract_text_kwargs": {"x_tolerance": 1, "layout": True, "x_density": 7.25, "y_density": 13},
     "extract_tables": False},
    {"prefix": "itau_cartao_visa",    "parser": "itau",
     "extract_text_kwargs": {"x_tolerance": 1, "layout": True, "x_density": 7.25, "y_density": 13},
     "extract_tables": False},
    {"prefix": "Itau_",               "parser": "itau",
     "extract_text_kwargs": {"x_tolerance": 1, "layout": True, "x_density": 7.25, "y_density": 13},
     "extract_tables": False},
    {"prefix": "porto_cartao",        "parser": "porto",
     "extract_text_kwargs": {}, "extract_tables": False},
    {"prefix": "xp_cartao",           "parser": "xp",
     "extract_text_kwargs": {}, "extract_tables": False},
]

_DDMM_RE = re.compile(r"^(\d{2})/(\d{2})$")


def _c6_table_settings(page) -> dict:
    """Replicates c6_global_eur_parser._table_settings() exactly."""
    words = page.extract_words()
    explicit_lines = []

    auth_words = [w for w in words if w["text"] == "Autorização"]
    if auth_words:
        header_bottom = max(w["bottom"] for w in auth_words)
        date_words_below = [
            w for w in words
            if _DDMM_RE.match(w["text"]) and w["top"] > header_bottom
        ]
        if date_words_below:
            first_top = min(w["top"] for w in date_words_below)
            explicit_lines.append((header_bottom + first_top) / 2)

    all_date_words = [w for w in words if _DDMM_RE.match(w["text"])]
    if all_date_words:
        last_bottom = max(w["bottom"] for w in all_date_words)
        explicit_lines.append(last_bottom + 2)

    return {"explicit_horizontal_lines": explicit_lines} if explicit_lines else {}


def get_config(filename: str) -> dict:
    for cfg in CONFIGS:
        if filename.startswith(cfg["prefix"]):
            return cfg
    return {"parser": "unknown", "extract_text_kwargs": {}, "extract_tables": False}


def find_password(path: str) -> str | None:
    for pw in PASSWORDS:
        try:
            with pdfplumber.open(path, password=pw) as pdf:
                if pdf.pages:
                    pdf.pages[0].extract_words()  # trigger decryption
                return pw
        except Exception:
            continue
    return None


def extract_pdf(path: str, out_base: str) -> None:
    filename = os.path.basename(path)
    stem = os.path.splitext(filename)[0]
    cfg = get_config(filename)
    out_dir = os.path.join(out_base, stem)
    os.makedirs(out_dir, exist_ok=True)

    password = find_password(path)
    if password is None:
        print(f"  SKIP  {filename}  (no password matched)")
        return

    with pdfplumber.open(path, password=password) as pdf:
        n_pages = len(pdf.pages)
        print(f"  OK    {filename}  parser={cfg['parser']}  pw={repr(password)}  pages={n_pages}")

        for i, page in enumerate(pdf.pages, 1):
            # Always extract text
            text = page.extract_text(**cfg["extract_text_kwargs"]) or ""
            txt_path = os.path.join(out_dir, f"page_{i:02d}.txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(text)

            # Also extract tables for C6 Global parsers
            if cfg["extract_tables"]:
                tables = page.extract_tables(table_settings=_c6_table_settings(page))
                json_path = os.path.join(out_dir, f"page_{i:02d}_tables.json")
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(tables, f, ensure_ascii=False, indent=2)

        meta = {
            "filename": filename,
            "parser": cfg["parser"],
            "password": password,
            "pages": n_pages,
            "extract_text_kwargs": cfg["extract_text_kwargs"],
            "extract_tables": cfg["extract_tables"],
        }
        with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--files-dir", default="tests/files")
    parser.add_argument("--out-dir", default="tests/extracts")
    args = parser.parse_args()

    if not os.path.isdir(args.files_dir):
        sys.exit(f"files-dir not found: {args.files_dir}")

    pdfs = sorted(
        f for f in os.listdir(args.files_dir)
        if f.lower().endswith(".pdf") and not f.endswith(".bak")
    )

    if not pdfs:
        sys.exit(f"No PDFs found in {args.files_dir}")

    os.makedirs(args.out_dir, exist_ok=True)
    print(f"Extracting {len(pdfs)} PDFs → {args.out_dir}/\n")

    for filename in pdfs:
        extract_pdf(os.path.join(args.files_dir, filename), args.out_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
