"""Comprueba que PC y móvil se comunican por Supabase Realtime de verdad (necesita internet)."""
import time, threading, http.server, functools, os, sys, random, string
from selenium import webdriver
from selenium.webdriver.common.by import By
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ); H.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:8766/'
sala = ''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ') for _ in range(4))
op = webdriver.ChromeOptions(); op.add_argument('--headless=new')
pc, mv = webdriver.Chrome(options=op), webdriver.Chrome(options=op)   # dos navegadores distintos
def esperar(f, t=30):
    fin = time.time() + t
    while time.time() < fin:
        try:
            if f(): return True
        except Exception: pass
        time.sleep(0.3)
    return False
ok = True
try:
    pc.get(B + f'pantalla.html?auto&rapido&nueva&sala={sala}')
    print('PC conectado:', esperar(lambda: pc.execute_script('return !!window.__estampida')))
    mv.get(B + f'movil.html?sala={sala}&id=real1&nombre=Prueba&auto')
    a = esperar(lambda: pc.execute_script("return !!window.__estampida.P.jugadores['real1']"))
    print('El PC ve al móvil por Supabase:', a)
    b = esperar(lambda: len(mv.find_elements(By.CSS_SELECTOR, '#misCartas [data-elige]')) == 2)
    print('El móvil recibe estado y sus 2 cartas secretas:', b)
    mv.execute_script("document.querySelector('#misCartas [data-elige]').click(); document.querySelector('#elegir .opcion').click(); document.getElementById('bListo').click()")
    c = esperar(lambda: pc.execute_script("return window.__estampida.P.fase") == 'resultado', 60)
    print('Carrera completa por Supabase:', c)
    if not c: print(pc.execute_script("const P=window.__estampida.P; return JSON.stringify({fase:P.fase, j:P.jugadores, n:P.n})")[:800])
    d = esperar(lambda: mv.find_element(By.ID, 'apResultado').is_displayed())
    print('El móvil ve el resultado:', d)
    ok = a and b and c and d
finally:
    pc.quit(); mv.quit(); srv.shutdown()
sys.exit(0 if ok else 1)
