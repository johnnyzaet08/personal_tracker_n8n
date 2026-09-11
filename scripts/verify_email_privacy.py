"""Check versionable changes against local mail identifiers without printing them.

Only the Python standard library is required. Private samples remain local and
ignored. The checker never reads environment files or OAuth credentials.
"""

from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
from html import unescape
from pathlib import Path
import json
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)


def private_markers() -> tuple[set[str], int]:
    markers: set[str] = set()
    samples = list((ROOT / ".private").rglob("*.eml"))
    for sample in samples:
        if subprocess.run(
            ["git", "check-ignore", "--quiet", str(sample)], cwd=ROOT, check=False
        ).returncode:
            raise RuntimeError("PRIVATE_SAMPLE_NOT_IGNORED")
        mail = BytesParser(policy=policy.default).parsebytes(sample.read_bytes())
        for header in ["From", "To", "Cc", "Reply-To", "Return-Path"]:
            for name, address in getaddresses(mail.get_all(header, [])):
                if address:
                    markers.add(address.casefold())
                if name and len(name) >= 12:
                    markers.add(name.casefold())
        for header in ["Message-ID", "X-Google-Smtp-Source"]:
            value = str(mail.get(header, "")).strip()
            if value:
                markers.add(value.casefold())
        for part in mail.walk():
            if part.get_content_type() != "text/html":
                continue
            html = part.get_content()
            if not isinstance(html, str):
                continue
            text = unescape(re.sub(r"<[^>]+>", "\n", html))
            tokens = [re.sub(r"\s+", " ", token).strip() for token in text.splitlines()]
            tokens = [token for token in tokens if token]
            for index, token in enumerate(tokens):
                label, separator, inline = token.partition(":")
                if separator and label.strip().casefold() in {
                    "comercio", "referencia", "tarjeta", "número de tarjeta", "monto"
                }:
                    value = inline.strip() or (tokens[index + 1] if index + 1 < len(tokens) else "")
                    if len(value) >= 6:
                        markers.add(value.casefold())
            for value in re.findall(r"[Xx*•]{4,}[ -]*\d{4}\b", text):
                markers.add(value.casefold())
    return markers, len(samples)


def main() -> int:
    markers, sample_count = private_markers()
    changed = git("diff", "--name-only", "-z", "HEAD").split(b"\0")
    untracked = git("ls-files", "--others", "--exclude-standard", "-z").split(b"\0")
    paths = sorted({item.decode("utf-8") for item in changed + untracked if item})
    failures = []
    for relative in paths:
        path = ROOT / relative
        if not path.is_file():
            continue
        text = path.read_bytes().decode("utf-8", errors="replace")
        if any(marker in text.casefold() for marker in markers):
            failures.append({"file": relative, "code": "PRIVATE_MAIL_IDENTIFIER"})
        if re.search(r"(?:ya29\.[A-Za-z0-9_-]{20,}|1//[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)", text):
            failures.append({"file": relative, "code": "CREDENTIAL_PATTERN"})
        if relative.startswith("automation/n8n/workflows/") and path.suffix == ".json":
            workflow = json.loads(text)
            if workflow.get("pinData"):
                failures.append({"file": relative, "code": "PINNED_EXECUTION_DATA"})
            for node in workflow.get("nodes", []):
                for credential in node.get("credentials", {}).values():
                    if credential.get("id") != "GMAIL_OAUTH_CREDENTIAL_REQUIRED":
                        failures.append({"file": relative, "code": "RUNTIME_CREDENTIAL_REFERENCE"})
    print(json.dumps({"privateSamplesChecked": sample_count, "changedFilesChecked": len(paths), "failures": failures}))
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print(json.dumps({"error": "PRIVACY_CHECK_FAILED"}))
        sys.exit(1)
