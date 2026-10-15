#!/usr/bin/env python3
"""List a public Google Drive folder (id, name, size) without logging in.

Usage: python3 -I tools/drive_list.py <folder_id>
Prints tab-separated: drive_id, bytes, name  (folders are skipped).
"""
import json
import re
import sys
import urllib.request

UA = "Mozilla/5.0"


def list_folder(folder_id):
    req = urllib.request.Request(
        f"https://drive.google.com/drive/folders/{folder_id}", headers={"User-Agent": UA}
    )
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf8", "replace")
    m = re.search(r"window\['_DRIVE_ivd'\]\s*=\s*'(.*?)';", html, re.S)
    if not m:
        sys.exit("Could not read folder listing (is it shared as 'anyone with the link'?)")
    raw = m.group(1).replace("\\/", "/")
    data = json.loads(raw.encode().decode("unicode_escape"))
    for item in data[0] or []:
        file_id, name, mime = item[0], item[2], item[3]
        if mime.endswith("folder"):
            continue
        # The byte size is an int field; timestamps (ms) are larger than 10**12.
        sizes = [x for x in item if isinstance(x, int) and 1000 <= x < 10**12]
        size = max(sizes) if sizes else 0
        yield file_id, size, name


if __name__ == "__main__":
    for row in list_folder(sys.argv[1]):
        print("\t".join(str(x) for x in row))
