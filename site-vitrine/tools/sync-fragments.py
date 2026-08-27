#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Réécrit l'en-tête et le pied de page de toutes les pages du site vitrine
depuis les fragments de référence de tools/fragments/.

Le site est servi en statique, sans étape de build : il n'existe pas de
mécanisme d'include. Le HTML reste donc dupliqué, mais ce script garantit
qu'il est rigoureusement identique partout. À relancer après toute
modification du menu ou du pied de page, et après l'ajout d'une page.

    python3 tools/sync-fragments.py          # applique
    python3 tools/sync-fragments.py --check  # ne modifie rien, sort 1 si dérive
"""
import glob, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAG = os.path.join(ROOT, 'tools', 'fragments')

def pages():
    out = []
    for pat in ('*.html', 'pages/*.html', 'blog/*.html', 'legal/*.html'):
        out += glob.glob(os.path.join(ROOT, pat))
    return sorted(p for p in out if '.fuse_hidden' not in p)

def read(name):
    return io.open(os.path.join(FRAG, name), encoding='utf-8').read().rstrip('\n')

def current_href(path):
    """L'entrée de menu qui correspond à la page servie, pour aria-current."""
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    if rel == 'index.html':                       return '/'
    if rel.startswith('blog/'):                   return '/blog'
    if rel == 'pages/soirees-caniplus.html':      return '/pages/soirees-caniplus'
    if rel == 'adhesion.html':                    return None   # pas dans le menu
    return None

def mark_current(html, href):
    if not href:
        return html
    return re.sub(r'(<li><a href="%s")>' % re.escape(href), r'\1 aria-current="page">', html, count=1)

def indent_block(block, indent):
    if not indent:
        return block
    return '\n'.join(indent + l if l.strip() else l for l in block.split('\n'))

# Le fragment d'en-tete embarque le script du menu mobile : le motif va
# donc jusqu'a la fin de ce <script>, pas seulement jusqu'a </header>.
HEADER_RE = re.compile(r'([ \t]*)<header\b[^>]*>.*?</header>\s*(?:<script>\s*//\s*Menu mobile\..*?</script>)?', re.S)
FOOTER_RE = re.compile(r'([ \t]*)<footer\b[^>]*>.*?</footer>', re.S)

def sync(check=False):
    header, footer = read('header.html'), read('footer.html')
    drifted, changed = [], []
    for p in pages():
        s = io.open(p, encoding='utf-8').read()
        o = s
        h = mark_current(header, current_href(p))
        mh = HEADER_RE.search(s)
        if mh:
            s = s[:mh.start()] + indent_block(h, mh.group(1)) + s[mh.end():]
        mf = FOOTER_RE.search(s)
        if mf:
            s = s[:mf.start()] + indent_block(footer, mf.group(1)) + s[mf.end():]
        if s != o:
            (drifted if check else changed).append(os.path.relpath(p, ROOT))
            if not check:
                io.open(p, 'w', encoding='utf-8').write(s)
    if check:
        if drifted:
            print('En-tête ou pied de page divergent sur %d page(s) :' % len(drifted))
            for d in drifted:
                print('  ', d)
            print('Relance : python3 tools/sync-fragments.py')
            return 1
        print('En-tête et pied de page identiques sur %d pages.' % len(pages()))
        return 0
    print('%d page(s) mise(s) à jour sur %d.' % (len(changed), len(pages())))
    for c in changed:
        print('  ', c)
    return 0

if __name__ == '__main__':
    sys.exit(sync(check='--check' in sys.argv))
