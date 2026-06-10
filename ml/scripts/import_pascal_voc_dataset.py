#!/usr/bin/env python3
"""
Import a Pascal/VOC-style grapevine dataset into DetectVID's curated structure.

Safety defaults:
- Does not delete or move original files.
- Dry-run by default; pass --apply to copy images.
- Rejects .crdownload files.
- Extracts zip contents under Datasets/_extracted/<source-name>/.
- Writes a CSV report under Datasets/_reports/.
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
CLASS_TO_DIR = {
    "healthy": "healthy/closeup",
    "oidio": "oidio/closeup",
    "peronospora": "peronospora/closeup",
    "others": "otros/closeup",
}

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASETS_ROOT = PROJECT_ROOT / "Datasets"
RAW_IMPORTS = DATASETS_ROOT / "_raw_imports"
EXTRACTED = DATASETS_ROOT / "_extracted"
REPORTS = DATASETS_ROOT / "_reports"


def normalize_label(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    if any(token in text for token in ["powdery", "oidio"]):
        return "oidio"
    if any(token in text for token in ["downy", "peronospora", "霜霉"]):
        return "peronospora"
    if any(token in text for token in ["healthy", "sana", "sound"]):
        return "healthy"
    return "others"


def safe_extract(zip_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            target = (output_dir / member.filename).resolve()
            if not str(target).startswith(str(output_dir.resolve())):
                raise ValueError(f"Unsafe zip path traversal: {member.filename}")
        archive.extractall(output_dir)


def parse_xml(xml_path: Path) -> tuple[str | None, list[str]]:
    root = ET.parse(xml_path).getroot()
    filename = root.findtext("filename")
    labels = []
    for obj in root.findall(".//object"):
        name = obj.findtext("name")
        if name:
            labels.append(normalize_label(name))
    return filename, labels


def find_image(filename: str | None, xml_path: Path, root: Path) -> Path | None:
    candidates = []
    if filename:
        candidates.append(xml_path.parent / filename)
        candidates.extend(root.rglob(filename))
    candidates.append(xml_path.with_suffix(".jpg"))
    candidates.append(xml_path.with_suffix(".jpeg"))
    candidates.append(xml_path.with_suffix(".png"))
    for candidate in candidates:
        if candidate.exists() and candidate.suffix.lower() in VALID_EXTENSIONS:
            return candidate
    return None


def choose_class(labels: list[str]) -> tuple[str, bool, str]:
    if not labels:
        return "healthy", False, "no object labels; treated as healthy"
    counts = Counter(labels)
    winners = counts.most_common()
    top_count = winners[0][1]
    top = [label for label, count in winners if count == top_count]
    needs_review = len(counts) > 1
    if len(top) > 1:
        return "others", True, f"tie between classes {sorted(top)}; sent to others for review"
    chosen = top[0]
    reason = f"dominant class {chosen}: {dict(counts)}"
    if needs_review:
        reason += " | multiple classes present"
    return chosen, needs_review, reason


def unique_destination(dest_dir: Path, image: Path) -> Path:
    dest = dest_dir / image.name
    if not dest.exists():
        return dest
    stem = image.stem
    suffix = image.suffix
    i = 2
    while True:
        candidate = dest_dir / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def prepare_source(args: argparse.Namespace) -> Path:
    if args.zip:
        zip_path = Path(args.zip).expanduser().resolve()
        if zip_path.suffix == ".crdownload":
            raise ValueError(f"Download is incomplete: {zip_path}")
        if not zip_path.exists():
            raise FileNotFoundError(zip_path)
        RAW_IMPORTS.mkdir(parents=True, exist_ok=True)
        copied_zip = RAW_IMPORTS / zip_path.name
        if args.apply and copied_zip.resolve() != zip_path:
            shutil.copy2(zip_path, copied_zip)
        extract_root = EXTRACTED / args.source_name
        if args.apply:
            safe_extract(copied_zip if copied_zip.exists() else zip_path, extract_root)
        return extract_root
    source_dir = Path(args.source_dir).expanduser().resolve()
    if not source_dir.exists():
        raise FileNotFoundError(source_dir)
    return source_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Pascal/VOC XML grapevine dataset into DetectVID.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--zip", help="Path to completed .zip file")
    group.add_argument("--source-dir", help="Path to already extracted dataset")
    parser.add_argument("--source-name", required=True, help="Stable folder name, e.g. HERMOS")
    parser.add_argument("--apply", action="store_true", help="Actually copy/extract files. Default is dry-run.")
    args = parser.parse_args()

    if not str(PROJECT_ROOT).startswith("/Users/stefanopalazzo/Desktop/Universidad/DetectVID"):
        raise RuntimeError(f"Unexpected project root: {PROJECT_ROOT}")

    root = prepare_source(args)
    report_path = REPORTS / f"import_{args.source_name}.csv"
    if args.apply:
        REPORTS.mkdir(parents=True, exist_ok=True)

    rows = []
    xml_files = sorted(root.rglob("*.xml"))
    if not xml_files:
        raise ValueError(f"No XML files found under {root}")

    for xml_path in xml_files:
        filename, labels = parse_xml(xml_path)
        image = find_image(filename, xml_path, root)
        chosen, needs_review, reason = choose_class(labels)
        dest_dir = DATASETS_ROOT / CLASS_TO_DIR[chosen] / args.source_name
        dest_path = unique_destination(dest_dir, image) if image else None
        action = "missing_image"
        if image:
            action = "would_copy"
            if args.apply:
                dest_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(image, dest_path)
                action = "copied"
        rows.append({
            "xml": str(xml_path),
            "image": str(image) if image else "",
            "labels": "|".join(labels),
            "chosen_class": chosen,
            "needs_review": str(needs_review),
            "reason": reason,
            "destination": str(dest_path) if dest_path else "",
            "action": action,
        })

    if args.apply:
        with report_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    counts = Counter(row["chosen_class"] for row in rows)
    review_count = sum(row["needs_review"] == "True" for row in rows)
    print(f"Source: {args.source_name}")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"XML files: {len(rows)}")
    print(f"Class counts: {dict(counts)}")
    print(f"Needs review: {review_count}")
    if args.apply:
        print(f"Report: {report_path}")
    else:
        print("Dry-run only. Re-run with --apply to copy/extract files.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)
