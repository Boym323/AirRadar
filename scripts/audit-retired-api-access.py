#!/usr/bin/env python3
"""Count requests to retired AirRadar APIs from authorized Nginx access logs.

Never outputs IPs, query strings, user-agent, or raw requests. Read-only.
Example: python3 scripts/audit-retired-api-access.py /var/log/nginx/access.log /var/log/nginx/access.log.1.gz --output /tmp/retired-api.json
"""
import argparse
from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

REQUEST = re.compile(r'"(?P<method>[A-Z]+)\s+(?P<target>\S+)\s+HTTP/\d(?:\.\d)?"\s+(?P<status>\d{3})')

def compile_route(path):
    if not (path.startswith("app/api/") and path.endswith("/route.ts")):
        raise ValueError("Unexpected API route path")
    template = "/" + path[4:-9]
    escaped = re.escape(template)
    pattern = re.sub(r'\\\[[^]]+\\\]', r'[^/]+', escaped)
    return template, re.compile("^" + pattern + "/?$")

def process(lines, routes, counts, totals):
    for line in lines:
        totals["lines"] += 1
        match = REQUEST.search(line)
        if not match:
            totals["unparsed"] += 1
            continue
        try:
            request_path = urlsplit(match.group("target")).path
        except ValueError:
            totals["unparsed"] += 1
            continue
        for template, rx in routes:
            if rx.fullmatch(request_path):
                counts[template][(match.group("method"), match.group("status"))] += 1
                totals["matched"] += 1
                break

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("logs", nargs="*", help="Nginx access logs; .gz supported; - means stdin")
    parser.add_argument("--manifest", default="docs/audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json")
    parser.add_argument("--output")
    args = parser.parse_args()
    data = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    routes = [compile_route(path) for path in data["deletedApiRoutes"]]
    totals = Counter()
    counts = defaultdict(Counter)
    for name in args.logs or ["-"]:
        if name == "-":
            process(sys.stdin, routes, counts, totals)
        elif name.endswith(".gz"):
            with gzip.open(name, "rt", encoding="utf-8", errors="replace") as handle:
                process(handle, routes, counts, totals)
        else:
            with open(name, encoding="utf-8", errors="replace") as handle:
                process(handle, routes, counts, totals)
    output = {"summary": {"logLines": totals["lines"], "unparsed": totals["unparsed"],
              "retiredRequests": totals["matched"], "routeTemplatesChecked": len(routes),
              "retiredRoutesWithTraffic": len(counts)},
              "routes": [{"template": name, "requests": sum(values.values()),
                          "methodStatuses": [{"method": k[0], "status": k[1], "count": n}
                              for k,n in sorted(values.items())]}
                         for name, values in sorted(counts.items())],
              "limitations": ["Read-only aggregated statistics; does not identify unique external clients.",
                              "No hits in a limited log window does not prove no consumers.",
                              "Review internal, external and reverse-proxy log coverage before removing contracts."]}
    result = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(result, encoding="utf-8")
    else:
        sys.stdout.write(result)

if __name__ == "__main__":
    main()
