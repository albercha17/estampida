"""Pone una versión nueva (?v=...) en todos los js/css enlazados, para que los navegadores no usen copias viejas.
Ejecutar antes de cada publicación: python herramientas/version.py"""
import glob, os, re, time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = time.strftime('%Y%m%d%H%M')
patrones = [
    (re.compile(r"""((?:from |import\()\s*'\./[\w-]+\.js)(?:\?v=\w+)?'"""), r"\1?v=" + V + "'"),
    (re.compile(r'''((?:src|href)="(?:js|css)/[\w-]+\.(?:js|css))(?:\?v=\w+)?"'''), r'\1?v=' + V + '"'),
]
for f in glob.glob(os.path.join(RAIZ, 'js', '*.js')) + glob.glob(os.path.join(RAIZ, '*.html')):
    s = open(f, encoding='utf-8').read()
    n = s
    for p, r in patrones:
        n = p.sub(r, n)
    if n != s:
        open(f, 'w', encoding='utf-8', newline='').write(n)
        print('versión', V, '->', os.path.basename(f))
