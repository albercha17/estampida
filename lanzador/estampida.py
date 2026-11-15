"""Lanzador de Estampida: sirve el juego en la red de casa y abre la pantalla del PC.

Los móviles tienen que estar en la misma wifi que el PC (el QR ya apunta a la IP del PC).
Si junto al .exe hay una carpeta 'personajes', se usa esa en vez de la de dentro del programa,
así se pueden cambiar los personajes sin rehacer el ejecutable.
"""
import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser

if getattr(sys, 'frozen', False):
    JUEGO = sys._MEIPASS                              # archivos del juego dentro del .exe
    JUNTO = os.path.dirname(sys.executable)           # carpeta donde está el .exe
else:
    JUEGO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    JUNTO = JUEGO
PERSONAJES_FUERA = os.path.join(JUNTO, 'personajes')


class Manejador(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        limpio = path.split('?', 1)[0].split('#', 1)[0]
        if limpio.startswith('/personajes/') and os.path.isdir(PERSONAJES_FUERA) and JUNTO != JUEGO:
            resto = limpio[len('/personajes/'):]
            destino = os.path.normpath(os.path.join(PERSONAJES_FUERA, resto))
            if destino.startswith(os.path.normpath(PERSONAJES_FUERA)):
                return destino
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass


def ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))          # no envía nada: solo averigua qué tarjeta de red se usa
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def arrancar():
    manejador = functools.partial(Manejador, directory=JUEGO)
    for puerto in range(8000, 8050):
        try:
            srv = http.server.ThreadingHTTPServer(('0.0.0.0', puerto), manejador)
            break
        except OSError:
            continue
    else:
        input('No hay ningún puerto libre entre 8000 y 8049. Pulsa Intro para salir.')
        return
    ip = ip_local()
    url = f'http://{ip}:{puerto}/pantalla.html'
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print('=' * 60)
    print('   ESTAMPIDA  -  carreras y apuestas')
    print('=' * 60)
    print()
    print('  Pantalla del PC:  ' + url)
    print(f'  Móviles:          http://{ip}:{puerto}/movil.html')
    print('                    (o escanead el QR de la pantalla)')
    print()
    print('  * Los móviles deben estar en la MISMA wifi que este PC.')
    print('  * Hace falta internet (las jugadas viajan por Supabase).')
    print('  * Si Windows pregunta por el firewall, pulsa "Permitir".')
    print()
    print('  Deja esta ventana abierta mientras jugáis.')
    print('  Para terminar, ciérrala.')
    print('=' * 60)
    if '--sin-navegador' not in sys.argv:
        webbrowser.open(url)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    arrancar()
