#!/usr/bin/env python3
"""Conservative hourly page checker. It does not purchase products or bypass access controls."""
import json
import re
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "tracked-products.json"
OUTPUT = ROOT / "monitor-report.json"
TIMEOUT = 20
USER_AGENT = "BEYBLADE-X-RADAR/1.0 (public product page availability checker)"

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.scripts = []
        self._in_script = False
        self._script_buf = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            self._in_script = True
            self._script_buf = []

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self._in_script:
            self.scripts.append("".join(self._script_buf))
            self._in_script = False
        if tag.lower() in ("script", "style", "noscript"):
            return

    def handle_data(self, data):
        if self._in_script:
            self._script_buf.append(data)
        else:
            self.parts.append(data)

def find_jsonld_availability(scripts):
    found = []
    def walk(obj):
        if isinstance(obj, dict):
            availability = obj.get("availability")
            if isinstance(availability, str) and "schema.org" in availability:
                found.append(availability.rsplit("/", 1)[-1])
            for value in obj.values():
                walk(value)
        elif isinstance(obj, list):
            for value in obj:
                walk(value)
    for script in scripts:
        if "ld+json" not in script[:300].lower() and not script.strip().startswith(("{", "[")):
            # Still attempt parse only for script content that resembles JSON.
            if not script.strip().startswith(("{", "[")):
                continue
        try:
            walk(json.loads(script.strip()))
        except Exception:
            continue
    if any(x in ("InStock", "LimitedAvailability", "OnlineOnly") for x in found):
        return "in_stock", "商品結構化資料標示有貨"
    if any(x in ("OutOfStock", "SoldOut", "Discontinued") for x in found):
        return "out_of_stock", "商品結構化資料標示缺貨"
    return None, None

def classify(text, scripts):
    structured, reason = find_jsonld_availability(scripts)
    if structured:
        return structured, reason

    haystack = re.sub(r"\s+", " ", text).lower()
    # Intentionally conservative: only explicit phrases; absence of a phrase is not evidence.
    out_patterns = [
        r"\bout of stock\b", r"\bsold out\b", r"\bunavailable\b",
        r"缺貨", r"售完", r"暫時缺貨", r"已售罄", r"無庫存"
    ]
    in_patterns = [
        r"\bin stock\b", r"\bavailable now\b", r"\badd to cart\b",
        r"\bbuy now\b", r"加入購物車", r"立即購買", r"現貨供應"
    ]
    out_hit = any(re.search(p, haystack) for p in out_patterns)
    in_hit = any(re.search(p, haystack) for p in in_patterns)
    # Conflicting generic phrases are common; do not guess.
    if out_hit and not in_hit:
        return "out_of_stock", "頁面出現明確缺貨文字（需人工覆核）"
    if in_hit and not out_hit:
        return "possible_in_stock", "頁面出現可能可購買文字（需人工覆核）"
    return "unknown", "頁面未提供可可靠判定的庫存訊號"

def check(product):
    url = product.get("url", "")
    result = {
        "id": product.get("id", ""),
        "name": product.get("name", ""),
        "url": url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "http_status": None,
        "status": "unknown",
        "message": ""
    }
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        result["message"] = "商品網址無效或缺失"
        return result
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            result["http_status"] = response.status
            content_type = response.headers.get("Content-Type", "")
            if "html" not in content_type.lower():
                result["message"] = "網址回應不是 HTML；無法判定庫存"
                return result
            raw = response.read(2_000_000)
            charset_match = re.search(r"charset=([\w-]+)", content_type, re.I)
            encoding = charset_match.group(1) if charset_match else "utf-8"
            html = raw.decode(encoding, errors="replace")
        parser = TextExtractor()
        parser.feed(html)
        result["status"], result["message"] = classify(" ".join(parser.parts), parser.scripts)
    except HTTPError as exc:
        result["http_status"] = exc.code
        result["message"] = f"商品頁回應 HTTP {exc.code}；不能當作缺貨"
    except (URLError, TimeoutError, OSError) as exc:
        result["message"] = f"連線失敗；不能當作缺貨（{type(exc).__name__}）"
    except Exception as exc:
        result["message"] = f"檢查錯誤；不能當作缺貨（{type(exc).__name__}）"
    return result

def main():
    if not INPUT.exists():
        raise SystemExit("Missing tracked-products.json")
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    products = data.get("products", [])
    if not isinstance(products, list):
        raise SystemExit("'products' must be a JSON array")
    results = []
    for product in products:
        if not isinstance(product, dict):
            continue
        results.append(check(product))
        time.sleep(1)  # Be polite to public store websites.
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schedule": "hourly (GitHub Actions; may be delayed by GitHub)",
        "total": len(results),
        "counts": {
            status: sum(1 for r in results if r["status"] == status)
            for status in ("in_stock", "possible_in_stock", "out_of_stock", "unknown")
        },
        "results": results,
        "limitations": [
            "This report is a heuristic, not a guarantee of stock availability.",
            "Some stores block automated requests, require JavaScript, or display generic purchase text.",
            "HTTP errors and timeouts are not treated as out of stock.",
            "The website localStorage watchlist is not automatically synced to tracked-products.json yet."
        ]
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"total": report["total"], "counts": report["counts"]}, ensure_ascii=False))
    print(f"Wrote {OUTPUT}")

if __name__ == "__main__":
    main()
