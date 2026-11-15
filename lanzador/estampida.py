"""Lanzador de Estampida: abre la pantalla del juego publicada en internet.

El juego está en GitHub Pages (https), así que el PC y los móviles solo necesitan internet,
cada uno con su conexión. No hace falta estar en la misma wifi.
"""
import webbrowser

URL = 'https://albercha17.github.io/estampida/pantalla.html'

if __name__ == '__main__':
    webbrowser.open(URL)
