"""Prueba de extremo a extremo en Chrome (modo local, sin internet):
PC + 3 móviles, apuestas, listo, echar jugador, carrera, resultados, nueva carrera y pausa.
Uso: python tests/navegador.py [carpeta_capturas]"""
import sys, time, threading, http.server, functools, os
from selenium import webdriver
from selenium.webdriver.common.by import By

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'tests', 'capturas')
os.makedirs(CAP, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
H.log_message = lambda *a: None
http.server.ThreadingHTTPServer.request_queue_size = 256
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:8765/'

op = webdriver.ChromeOptions()
op.add_argument('--headless=new'); op.add_argument('--window-size=1500,950')
op.add_argument('--autoplay-policy=no-user-gesture-required')
op.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
d = webdriver.Chrome(options=op)
fallos = []


def ok(c, m):
    print(('OK    ' if c else 'FALLO ') + m)
    if not c:
        fallos.append(m)


def errores():
    return [l for l in d.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message'] and 'vibrate' not in l['message']]


def esperar(f, t=20):
    fin = time.time() + t
    while time.time() < fin:
        try:
            if f():
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def clic(el):
    d.execute_script('arguments[0].scrollIntoView({block:"center"}); arguments[0].click()', el)


def P(js):
    return d.execute_script('return ' + js)


E = 'window.__estampida.P'
try:
    d.get(B + 'pantalla.html?local=1&auto&rapido&nueva&sala=TEST')
    pc = d.current_window_handle
    ok(esperar(lambda: P(f'window.__estampida && {E}.publicas.length') == 20), 'PC: 20 cartas públicas')
    ok(esperar(lambda: d.find_elements(By.CSS_SELECTOR, '#campo.campo3d canvas')), 'PC: estadio 3D dibujado')
    ok(len(d.find_elements(By.CSS_SELECTOR, '#corredores .corredor')) == 4, 'PC: 4 corredores con cuota')
    moviles = []
    for i, n in enumerate(['Ana', 'Luis', 'Marta']):
        d.switch_to.new_window('tab')
        d.get(B + f'movil.html?local=1&sala=TEST&id=j{i}&nombre={n}&auto')
        moviles.append(d.current_window_handle)
    d.switch_to.window(pc)
    ok(esperar(lambda: len(P(f'Object.keys({E}.jugadores)')) == 3), 'PC: se unen 3 móviles')
    ok(esperar(lambda: len(d.find_elements(By.CSS_SELECTOR, '#jugadores li')) == 3), 'PC: lista de 3 apostadores')
    ok(P(f'Object.values({E}.jugadores).every(j => j.opciones && j.opciones.length === 2 && !j.carta)'), 'cada móvil recibe 2 cartas secretas (sin elegir)')
    time.sleep(0.5)
    d.save_screenshot(os.path.join(CAP, '1_pc_espera.png'))
    for k, h in enumerate(moviles):
        d.switch_to.window(h)
        ok(esperar(lambda: len(d.find_elements(By.CSS_SELECTOR, '#misCartas .carta')) == 2), f'móvil {k}: ve sus 2 cartas secretas')
        clic(d.find_elements(By.CSS_SELECTOR, '#misCartas .voltear')[0])
        clic(d.find_elements(By.CSS_SELECTOR, '#misCartas .voltear')[1])
        esperar(lambda: d.find_elements(By.CSS_SELECTOR, '#elegir .opcion'))
        clic(d.find_elements(By.CSS_SELECTOR, '#elegir .opcion')[k])
        if k == 0:   # sin elegir carta no puede decir «listo»
            clic(d.find_element(By.ID, 'bListo')); time.sleep(0.8)
            ok(d.find_element(By.ID, 'formApuesta').is_displayed(), 'móvil: sin elegir carta secreta no queda listo')
        clic(d.find_elements(By.CSS_SELECTOR, '#misCartas [data-elige]')[k % 2])
        ok(esperar(lambda: d.find_elements(By.CSS_SELECTOR, '#misCartas .opcion-secreta.elegida')), f'móvil {k}: carta elegida marcada')
        if k == 1:
            clic(d.find_element(By.CSS_SELECTOR, '.tipo[data-tipo=podio]'))
        if k == 0:
            d.set_window_size(400, 860); time.sleep(0.8)
            d.save_screenshot(os.path.join(CAP, '2_movil_apuesta.png'))
        if k < 2:
            clic(d.find_element(By.ID, 'bListo'))
    d.switch_to.window(pc)
    ok(esperar(lambda: P(f'Object.values({E}.jugadores).filter(j=>j.listo).length') == 2), 'PC: 2 listos')
    time.sleep(0.5)
    ok(P(f'{E}.fase') == 'espera', 'no empieza hasta que todos estén listos')
    ok(P(f"{E}.jugadores['j0'].carta.id === {E}.jugadores['j0'].opciones[0].id && {E}.jugadores['j1'].carta.id === {E}.jugadores['j1'].opciones[1].id"), 'PC: entra la carta que eligió cada uno')
    reserva = P(f'{E}.reserva.length')
    d.execute_script("window.__estampida.echar('j2')")
    ok(P(f'{E}.reserva.length') == reserva + 2, 'echar: sus 2 cartas secretas vuelven a la reserva')
    d.switch_to.window(moviles[2])
    ok(esperar(lambda: d.find_element(By.ID, 'sEchado').is_displayed()), 'el móvil echado ve el aviso')
    d.switch_to.window(pc)
    ok(esperar(lambda: P(f'{E}.fase') in ('carrera', 'resultado'), 15), 'empieza la carrera cuando todos están listos')
    ok(esperar(lambda: P(f'{E}.fase') == 'resultado', 60), 'la carrera termina con ganador')
    ok(esperar(lambda: d.find_element(By.ID, 'vResultado').is_displayed(), 10), 'PC: pantalla de resultados')
    time.sleep(0.6)
    d.save_screenshot(os.path.join(CAP, '3_pc_resultado.png'))
    res = P(f'{E}.resultados')
    ok(len(res) == 2, 'resultados para los 2 que apostaron')
    for r in res:
        pts = P(f"{E}.jugadores['{r['id']}'].puntos")
        ok(pts == max(0, 100 + r['delta']), f"puntos de {r['id']}: {pts} ({r['delta']:+})")
    d.switch_to.window(moviles[0]); d.set_window_size(400, 860)
    ok(esperar(lambda: d.find_element(By.ID, 'apResultado').is_displayed()), 'móvil: ve su resultado')
    time.sleep(0.5)
    d.save_screenshot(os.path.join(CAP, '5_movil_resultado.png'))
    clic(d.find_element(By.CSS_SELECTOR, '.tabs button[data-p=pCarrera]')); time.sleep(0.5)
    d.save_screenshot(os.path.join(CAP, '4_movil_carrera.png'))
    d.switch_to.window(pc); d.set_window_size(1500, 950)
    ronda = P(f'{E}.ronda')
    clic(d.find_element(By.ID, 'bNueva'))
    ok(esperar(lambda: P(f'{E}.ronda') == ronda + 1 and P(f'{E}.fase') == 'espera'), 'nueva carrera')
    d.switch_to.window(moviles[1])
    ok(esperar(lambda: d.find_element(By.ID, 'bListo').is_displayed()), 'móvil: puede volver a apostar')
    # carrera a velocidad real para ver animaciones y probar la pausa
    d.switch_to.window(pc)
    d.get(B + 'pantalla.html?local=1&auto&nueva&sala=VISU')
    esperar(lambda: P(f'window.__estampida && {E}.publicas.length') == 20)
    d.switch_to.window(moviles[0])
    d.get(B + 'movil.html?local=1&sala=VISU&id=v1&nombre=Ana&auto')
    esperar(lambda: d.find_elements(By.CSS_SELECTOR, '#elegir .opcion'))
    clic(d.find_elements(By.CSS_SELECTOR, '#elegir .opcion')[2])
    esperar(lambda: d.find_elements(By.CSS_SELECTOR, '#misCartas [data-elige]'))
    clic(d.find_elements(By.CSS_SELECTOR, '#misCartas [data-elige]')[0])
    clic(d.find_element(By.ID, 'bListo'))
    d.switch_to.window(pc)
    ok(esperar(lambda: P(f'{E}.fase') == 'carrera', 15), 'carrera real empieza')
    time.sleep(4); d.save_screenshot(os.path.join(CAP, '7_pc_presentacion.png'))
    ok(esperar(lambda: P(f'{E}.n') >= 3, 120), 'carrera real: salen cartas (tras la presentación)')
    time.sleep(0.9)
    d.save_screenshot(os.path.join(CAP, '6_pc_carrera.png'))
    clic(d.find_element(By.ID, 'bPausa'))
    time.sleep(1); n = P(f'{E}.n'); time.sleep(6)
    ok(P(f'{E}.n') == n, 'la pausa detiene la carrera')
    clic(d.find_element(By.ID, 'bPausa'))
    ok(esperar(lambda: P(f'{E}.n') > n, 15), 'al quitar la pausa sigue')
    for h in [pc] + moviles[:2]:
        d.switch_to.window(h)
        e = errores()
        ok(not e, 'sin errores de consola' + ('' if not e else ': ' + str(e[:2])))
finally:
    d.quit(); srv.shutdown()
print('\n' + (f'{len(fallos)} FALLOS' if fallos else 'Navegador: todas las pruebas OK'))
sys.exit(1 if fallos else 0)
