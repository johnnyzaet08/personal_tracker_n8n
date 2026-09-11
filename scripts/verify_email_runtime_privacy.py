"""Read container logs in memory and report only private-marker counts."""

import json
import subprocess
import sys

from verify_email_privacy import ROOT, private_markers


def main() -> int:
    markers, samples = private_markers()
    results = []
    for service in ("api", "web", "n8n"):
        result = subprocess.run(
            ["docker", "compose", "logs", "--no-color", "--no-log-prefix", service],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode:
            print(json.dumps({"service": service, "error": "LOG_READ_FAILED"}))
            return 1
        content = result.stdout.casefold()
        matches = sum(marker.casefold() in content for marker in markers)
        results.append({"service": service, "privateMarkerMatches": matches})
    print(json.dumps({"privateSamplesChecked": samples, "logs": results}))
    return int(any(row["privateMarkerMatches"] for row in results))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("RUNTIME_PRIVACY_CHECK_FAILED")
        sys.exit(1)
