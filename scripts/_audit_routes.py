#!/usr/bin/env python3
# ===========================================================================
# _audit_routes.py  —  helper de audit-code.sh para el detector
#                      ts_link_to_missing_route
# ---------------------------------------------------------------------------
# Construye el conjunto de rutas reales a partir de los app/**/page.tsx y
# comprueba que cada enlace (href= / router.push( / router.replace() a una ruta
# /admin|/portal corresponda a una ruta existente. Emite JSONL (mismo formato
# que emit_hit de audit-code.sh): {detector,severity,file,line,preview}.
#
# Por que python y no awk/rg puro: el matching de [seg] dinamicos -> [^/]+ con
# anclaje exacto es fragil en shell. Aqui es robusto y testeable.
#
# Reglas (segun spec):
#   - Ruta: ruta de page.tsx relativa a app/, quitando  /page.tsx ; cada
#     segmento  [algo]  (incl. catch-all [...algo]) -> [^/]+ ; anclada ^...$.
#   - Targets: de  app  y  components , patron
#       (href=|router.push(|router.replace()  ['"`] /(admin|portal) ...
#   - Se quita query (?...) y hash (#...).
#   - Se SALTAN targets que contengan  ${  (interpolaciones dinamicas).
#   - Un target que no casa NINGUNA ruta -> hit (high).
# ===========================================================================
import os
import re
import sys
import json
import glob


def build_route_regexes(repo_root):
    """Devuelve lista de regex compiladas, una por page.tsx bajo app/."""
    app_dir = os.path.join(repo_root, "app")
    regexes = []
    for page in glob.glob(os.path.join(app_dir, "**", "page.tsx"), recursive=True):
        rel = os.path.relpath(page, app_dir)            # p.ej. admin/proyectos/[code]/page.tsx
        rel = rel[: -len("/page.tsx")] if rel.endswith("/page.tsx") else rel
        rel = "" if rel == "page.tsx" else rel
        route = "/" + rel if rel else "/"
        route = route.replace("\\", "/")                # por si acaso (Windows)
        # Saltar grupos de ruta de Next  (grupo)  — no afectan a la URL.
        parts = [p for p in route.split("/") if not (p.startswith("(") and p.endswith(")"))]
        route = "/".join(parts) if parts != [""] else "/"
        if not route:
            route = "/"
        # Escapamos la ruta y luego convertimos los segmentos dinamicos. Ojo:
        # re.escape deja  [algo]  como  \[algo\] , asi que el sub busca la forma
        # escapada  \[...\]  y la sustituye por  [^/]+  (un solo segmento sin /).
        esc = re.escape(route)
        esc = re.sub(r"\\\[[^\]]*\\\]", "[^/]+", esc)
        regexes.append(re.compile("^" + esc + "$"))
    return regexes


TARGET_RE = re.compile(
    r"""(?:href=|router\.(?:push|replace)\()\s*['"`](/(?:admin|portal)[^'"`]*)['"`]"""
)


def scan(repo_root):
    routes = build_route_regexes(repo_root)
    hits = []
    for base in ("app", "components"):
        base_dir = os.path.join(repo_root, base)
        if not os.path.isdir(base_dir):
            continue
        for ext in ("ts", "tsx"):
            for src in glob.glob(os.path.join(base_dir, "**", "*." + ext), recursive=True):
                if any(seg in src for seg in (os.sep + "node_modules" + os.sep,
                                              os.sep + "_legacy" + os.sep,
                                              os.sep + ".next" + os.sep)):
                    continue
                try:
                    with open(src, "r", encoding="utf-8", errors="replace") as fh:
                        lines = fh.readlines()
                except OSError:
                    continue
                rel_src = os.path.relpath(src, repo_root)
                for i, line in enumerate(lines, start=1):
                    for m in TARGET_RE.finditer(line):
                        target = m.group(1)
                        if "${" in target:           # interpolacion -> no evaluable
                            continue
                        target = target.split("?", 1)[0].split("#", 1)[0]
                        if not target:
                            continue
                        if any(rx.match(target) for rx in routes):
                            continue
                        hits.append({
                            "detector": "ts_link_to_missing_route",
                            "severity": "high",
                            "file": rel_src,
                            "line": str(i),
                            "preview": target,
                        })
    return hits


def main():
    repo_root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    for h in scan(repo_root):
        sys.stdout.write(json.dumps(h, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
