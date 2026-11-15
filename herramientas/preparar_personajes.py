"""Convierte las imágenes de personajes (jpeg con fondo negro) en png cuadrados con fondo transparente.

Uso: python herramientas/preparar_personajes.py
 - Lee personajes/originales/*.jpeg|jpg|png en orden alfabético.
 - Quita el fondo negro que toca el borde (no el negro de dentro del dibujo).
 - Recorta, centra abajo (los pies tocan el suelo) y guarda personajes/img/NN.png de 512x512.
"""
import glob, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(RAIZ, 'personajes', 'originales')
SAL = os.path.join(RAIZ, 'personajes', 'img')
LADO = 512
UMBRAL = 22      # brillo máximo que cuenta como "fondo negro"


def quitar_fondo(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    oscuro = a.max(axis=2) < UMBRAL
    etiquetas, _ = ndimage.label(oscuro)
    borde = np.unique(np.concatenate([etiquetas[0], etiquetas[-1], etiquetas[:, 0], etiquetas[:, -1]]))
    fondo = np.isin(etiquetas, borde[borde > 0])
    fondo = ndimage.binary_opening(fondo, iterations=1)
    fondo = ndimage.binary_erosion(fondo, iterations=4, border_value=1)   # devuelve el contorno negro del dibujo
    alfa = Image.fromarray(np.where(fondo, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alfa)
    return out


def main():
    os.makedirs(SAL, exist_ok=True)
    fs = sorted(f for f in glob.glob(os.path.join(ORIG, '*')) if f.lower().endswith(('.jpeg', '.jpg', '.png')))
    for i, f in enumerate(fs):
        im = quitar_fondo(Image.open(f))
        caja = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
        im = im.crop(caja)
        im.thumbnail((LADO - 16, LADO - 8), Image.LANCZOS)
        lienzo = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
        lienzo.paste(im, ((LADO - im.width) // 2, LADO - im.height - 4), im)
        dest = os.path.join(SAL, f'{i:02d}.png')
        lienzo.save(dest, optimize=True)
        print(os.path.basename(f), '->', os.path.basename(dest))


if __name__ == '__main__':
    main()
