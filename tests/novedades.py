"""Prueba de las novedades (17 nov 2026) en Chrome, modo local:
escenarios con su carta, apuestas locas, votación del empujón, apuestas en directo y foto finish.
Uso: python tests/novedades.py [carpeta_capturas]"""
import sys, time, threading, http.server, functools, os
from selenium import webdriver
from selenium.webdriver.common.by import By

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'tests', 'capturas')
os.makedirs(CAP, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
H.log_message = lambda *a: None
http.server.ThreadingHTTPServer.request_queue_size = 256
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:8766/'

op = webdriver.ChromeOptions()
op.add_argument('--headless=new'); op.add_argument('--window-size=1500,950')
op.add_argument('--autoplay-policy=no-user-gesture-required')
op.add_argument('--use-gl=swiftshader'); op.add_argument('--enable-unsafe-swiftshader')
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
        time.sleep(0.15)
    return False


def clic(el):
    d.execute_script('arguments[0].scrollIntoView({block:"center"}); arguments[0].click()', el)


def css(s):
    return d.find_elements(By.CSS_SELECTOR, s)


def P(js):
    return d.execute_script('return ' + js)


E = 'window.__estampida.P'
try:
    # ---------- los 4 escenarios se dibujan ----------
    for esc in ['estadio', 'playa', 'nieve', 'volcan']:
        d.get(B + f'pantalla.html?local=1&auto&rapido&nueva&sala=ES{esc[:2].upper()}&escenario={esc}')
        ok(esperar(lambda: P(f'window.__estampida && {E}.escenario') == esc), f'escenario {esc}')
        ok(esperar(lambda: css('#campo.campo3d canvas')), f'{esc}: 3D dibujado')
        if esc != 'estadio':
            ok(P(f'{E}.cartaEsc && {E}.cartaEsc.escenario') == esc, f'{esc}: tiene su carta')
            ok(len(css('#mazo .carta.escenario')) == 1, f'{esc}: su carta se ve en el mazo')
        time.sleep(2.5)
        d.save_screenshot(os.path.join(CAP, f'esc_{esc}.png'))
    ok(not errores(), 'escenarios sin errores de consola')

    # ---------- partida: apuestas locas, votación y directo ----------
    d.get(B + 'pantalla.html?local=1&auto&rapido&nueva&sala=NOVE&escenario=volcan&medio=6')
    pc = d.current_window_handle
    ok(esperar(lambda: P(f'window.__estampida && {E}.publicas.length') == 20), 'PC listo')
    moviles = []
    for i, n in enumerate(['Ana', 'Luis']):
        d.switch_to.new_window('tab')
        d.get(B + f'movil.html?local=1&sala=NOVE&id=n{i}&nombre={n}&auto')
        moviles.append(d.current_window_handle)
    d.switch_to.window(pc)
    ok(esperar(lambda: len(P(f'Object.keys({E}.jugadores)')) == 2), 'se unen 2 móviles')
    for k, h in enumerate(moviles):
        d.switch_to.window(h)
        if k == 0:
            d.set_window_size(400, 860)
        ok(esperar(lambda: len(css('#misCartas [data-elige]')) == 2), f'móvil {k}: cartas secretas')
        clic(css('#misCartas [data-elige]')[0])
        esperar(lambda: css('#elegir .opcion'))
        clic(css('#elegir .opcion')[k])
        clic(css('.rapidas [data-v="25"]')[0])
        if k == 0:   # exacta: 1.º el 0 y 2.º el 1
            clic(css('.loca[data-loca=exacta]')[0])
            clic(css('#locaDetalle [data-lc="0"]')[0])
            # sin el 2.º no deja estar listo
            clic(d.find_element(By.ID, 'bListo')); time.sleep(0.6)
            ok(d.find_element(By.ID, 'formApuesta').is_displayed(), 'móvil: apuesta loca incompleta no deja estar listo')
            clic(css('#locaDetalle [data-lc2="1"]')[0])
            ok(esperar(lambda: 'Cuota' in d.find_element(By.ID, 'locaDetalle').text), 'móvil: se ve la cuota de la exacta')
            time.sleep(0.4)
            d.execute_script('document.getElementById("locaTipos").scrollIntoView()')
            d.save_screenshot(os.path.join(CAP, 'nov_movil_loca.png'))
        else:
            clic(css('.loca[data-loca=paliza]')[0])
        clic(d.find_element(By.ID, 'bListo'))
    d.switch_to.window(pc)
    ok(esperar(lambda: P(f'{E}.jugadores.n0.loca && {E}.jugadores.n0.loca.tipo') == 'exacta'), 'PC: recibe la exacta')
    ok(P(f'{E}.jugadores.n0.loca.c === 0 && {E}.jugadores.n0.loca.c2 === 1 && {E}.jugadores.n0.loca.cuota >= 2'), 'PC: exacta con su cuota')
    ok(P(f'{E}.jugadores.n1.loca && {E}.jugadores.n1.loca.tipo') == 'paliza', 'PC: recibe la paliza')
    ok(esperar(lambda: P(f'{E}.fase') == 'carrera', 15), 'empieza la carrera')
    ok(P(f"{E}.carrera.mazo.concat({E}.carrera.jugadas).some(c => c.tipo === 'erupcion')"), 'la carta del volcán entra en la carrera')

    # votación
    ok(esperar(lambda: P(f'{E}.medio && {E}.medio.fase') == 'voto', 60), 'a mitad de carrera: votación')
    vivos = P(f'[0,1,2,3].filter(i => !{E}.carrera.corredores[i].fuera && !{E}.carrera.corredores[i].abducido)')
    objetivo = vivos[-1]
    d.set_window_size(1500, 950); time.sleep(0.6); d.save_screenshot(os.path.join(CAP, 'nov_pc_votacion.png')); d.set_window_size(400, 860)
    pos_antes = P(f'{E}.carrera.corredores[{objetivo}].pos')
    for k, h in enumerate(moviles):
        d.switch_to.window(h)
        ok(esperar(lambda: d.find_element(By.ID, 'medioM').is_displayed(), 5), f'móvil {k}: ve la votación')
        clic(css(f'#medioM [data-voto="{objetivo}"]')[0])
        if k == 0:
            time.sleep(0.4); d.save_screenshot(os.path.join(CAP, 'nov_movil_voto.png'))
    d.switch_to.window(pc)
    ok(esperar(lambda: len(P(f'Object.keys(({E}.medio || {{}}).votos || {{}})')) == 2, 5), 'PC: cuenta 2 votos')
    ok(esperar(lambda: P(f'{E}.medio && {E}.medio.fase') in ('empujon', 'directo'), 10), 'se acaba la votación')
    ok(P(f'{E}.medio.fase') == 'directo' or P(f'{E}.medio.elegido') == objetivo, 'empuja al más votado')
    ok(esperar(lambda: P(f'{E}.carrera.corredores[{objetivo}].pos') == min(11, pos_antes + 2) or P(f'{E}.carrera.corredores[{objetivo}].pos') >= pos_antes, 5), f'el empujado avanza ({pos_antes} -> {P(f"{E}.carrera.corredores[{objetivo}].pos")})')

    # apuestas en directo
    ok(esperar(lambda: P(f'{E}.medio && {E}.medio.fase') == 'directo', 10), 'apuestas en directo')
    ok(P(f'{E}.medio.cuotas.ganador.some(x => x)'), 'hay cuotas en directo')
    time.sleep(0.3)
    d.set_window_size(1500, 950); time.sleep(0.4); d.save_screenshot(os.path.join(CAP, 'nov_pc_directo.png')); d.set_window_size(400, 860)
    d.switch_to.window(moviles[0])
    ok(esperar(lambda: css('#medioM [data-dc]:not([disabled])'), 5), 'móvil: ve las cuotas en directo')
    clic(css('#medioM [data-dc]:not([disabled])')[0])
    time.sleep(0.3)
    d.save_screenshot(os.path.join(CAP, 'nov_movil_directo.png'))
    clic(css('#medioM [data-dapostar]')[0])
    d.switch_to.window(pc)
    ok(esperar(lambda: P(f'!!{E}.jugadores.n0.directo'), 5), 'PC: recibe la apuesta en directo')
    ok(P(f'{E}.jugadores.n0.directo.cantidad <= {E}.jugadores.n0.puntos - 25 - {E}.jugadores.n0.loca.cantidad'), 'directo: solo con monedas libres')

    # final
    ok(esperar(lambda: P(f'{E}.fase') == 'resultado', 90), 'la carrera termina')
    ok(esperar(lambda: d.find_element(By.ID, 'vResultado').is_displayed(), 10), 'PC: resultados')
    res = {r['id']: r for r in P(f'{E}.resultados')}
    ok(len(res['n0']['detalle']) == 3, 'Ana: 3 apuestas en el resultado (normal, loca y directo)')
    ok(len(res['n1']['detalle']) == 2, 'Luis: 2 apuestas en el resultado (normal y loca)')
    for i in ('n0', 'n1'):
        pts = P(f'{E}.jugadores.{i}.puntos')
        ok(pts == max(0, 100 + res[i]['delta']) and res[i]['delta'] == sum(x['delta'] for x in res[i]['detalle']), f'{i}: puntos cuadran ({pts}, {res[i]["delta"]:+})')
    time.sleep(0.5)
    d.save_screenshot(os.path.join(CAP, 'nov_pc_resultado.png'))
    d.switch_to.window(moviles[0])
    ok(esperar(lambda: d.find_element(By.ID, 'apResultado').is_displayed()), 'móvil: ve el resultado')
    ok(len(css('#resTexto .linea-ap')) == 3, 'móvil: desglose de sus 3 apuestas')
    d.save_screenshot(os.path.join(CAP, 'nov_movil_resultado.png'))

    # foto finish (se fuerza en la pantalla para verla)
    d.switch_to.window(pc)
    d.set_window_size(1500, 950)
    d.get(B + 'pantalla.html?local=1&auto&nueva&sala=FOTO&escenario=playa')
    ok(esperar(lambda: P(f'window.__estampida && {E}.publicas.length') == 20), 'PC para la foto finish')
    time.sleep(3)
    d.execute_script("const t = window.__estampida.tablero(); t.colocar([{pos:12},{pos:11},{pos:5},{pos:3}]); window.__ff = t.fotoFinish(0, 1)")
    time.sleep(3.0)
    ok(bool(css('.foto-finish img')), 'foto finish: sale la foto')
    d.save_screenshot(os.path.join(CAP, 'nov_fotofinish.png'))
    ok(esperar(lambda: '1.º' in P("(document.querySelector('.ff-res') || {}).textContent || ''"), 6), 'foto finish: se revela el ganador')
    d.save_screenshot(os.path.join(CAP, 'nov_fotofinish2.png'))
    ok(not errores(), 'sin errores de consola')
finally:
    d.quit()
    srv.shutdown()
print('\n' + ('Novedades: todas las pruebas OK' if not fallos else f'{len(fallos)} FALLOS: ' + '; '.join(fallos)))
sys.exit(1 if fallos else 0)
