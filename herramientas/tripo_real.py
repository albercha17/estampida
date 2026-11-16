"""Paso de Tripo del modo Reales, automático (web de Tripo en el Chrome del puerto 9222, cuenta con créditos).

Uso: python herramientas/tripo_real.py <id>
  concepto.png -> Generate (55) -> Retopo Triangle 20000 (35) -> Auto Rig humanoide Mixamo (20)
  -> prueba las animaciones de ANIMS -> Export GLB con todas -> personajes/reales/<id>/modelo.glb
Si Cloudflare pide verificar que eres humano, el script espera a que lo hagas tú en esa ventana.
"""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = Path(__file__).resolve().parent.parent
DESCARGAS = Path.home() / "Downloads"
ANIMS = ("idle run fall cheer dance_01 defeat greet_01 hit_to_body_01 jump "
         "look_around stretch warm_up swagger standing_relax wait fold_arms agree "
         "clap laugh_01 laugh_02 scared_01 frightened afraid angry_01 complain_01 frustrated_01").split()


def conectar():
    o = webdriver.ChromeOptions()
    o.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    d = webdriver.Chrome(options=o)
    for h in d.window_handles:
        d.switch_to.window(h)
        if "tripo3d" in d.current_url:
            return d
    d.switch_to.new_window("tab")
    return d


def js(d, codigo, *args):
    return d.execute_script(codigo, *args)


def hay_texto(d, patron):
    return js(d, "const re=new RegExp(arguments[0]);return [...document.querySelectorAll('*')].some(x=>x.children.length==0&&x.offsetParent&&re.test((x.innerText||'').trim()))", patron)


def esperar(d, cond, maximo=900, paso=5, que=""):
    t0 = time.time()
    while time.time() - t0 < maximo:
        if cond():
            return True
        time.sleep(paso)
    raise RuntimeError("Tiempo agotado esperando " + que)


def boton(d, patron):
    r = js(d, """const re=new RegExp(arguments[0]);
const b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&!b.disabled&&re.test(b.innerText.replace(/\\s+/g,' ').trim())).pop();
if(b){b.click();return true}return false""", patron)
    if not r:
        raise RuntimeError("No encuentro el botón " + patron)


def menu(d, nombre):
    js(d, """const e=[...document.querySelectorAll('div,span')].filter(x=>x.offsetParent&&x.children.length<3&&x.innerText&&x.innerText.trim()===arguments[0]);
const x=e[e.length-1];(x.closest('[class*=item],[role=button],a,button')||x).click()""", nombre)
    time.sleep(4)


def ocupado(d):
    return hay_texto(d, r"^(Generating|Retopologizing|Rigging\.\.\.|In Queue)")


def abrir(d, url):
    d.get(url)
    esperar(d, lambda: "Verificación de seguridad" not in js(d, "return document.body.innerText") and
            js(d, "return !!document.querySelector('input[type=file]')"), 600, 3, "la página de Tripo (¿verificación de Cloudflare?)")


def main(pid):
    carpeta = RAIZ / "personajes" / "reales" / pid
    d = conectar()
    abrir(d, "https://studio.tripo3d.ai/workspace/generate")
    d.find_elements(By.CSS_SELECTOR, "input[type=file]")[0].send_keys(str(carpeta / "concepto.png"))
    time.sleep(6)
    boton(d, r"^Generate 55$")
    print("Generando…", flush=True)
    time.sleep(20)
    esperar(d, lambda: not ocupado(d), 900, 10, "la generación")
    print("Modelo:", d.current_url, flush=True)

    menu(d, "Retopo")
    js(d, "const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/^.?Triangle$/.test(b.innerText.trim()));b&&b.click()")
    time.sleep(1)
    js(d, """const i=[...document.querySelectorAll('input')].find(x=>/^\\d+$/.test(x.value));
const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,'20000');
i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));i.blur()""")
    time.sleep(1)
    boton(d, r"^Retopology 35$")
    print("Retopología…", flush=True)
    time.sleep(15)
    esperar(d, lambda: not ocupado(d), 900, 10, "la retopología")

    menu(d, "Rig")
    boton(d, r"^Auto Rig 20$")
    print("Esqueleto…", flush=True)
    time.sleep(15)
    if hay_texto(d, "^Polygon Limit"):
        raise RuntimeError("Tripo dice que sigue teniendo demasiados polígonos")
    esperar(d, lambda: not ocupado(d), 900, 10, "el esqueleto")

    js(d, "[...document.querySelectorAll('a,span,div')].find(x=>x.offsetParent&&x.children.length==0&&x.innerText.trim()==='animation').click()")
    animar_y_exportar(d, carpeta)


def elegidas(d):
    """Abre «Choose Animations» del diálogo de exportar y devuelve cuántas animaciones tiene aplicadas (el «0/N»)."""
    boton(d, r"^Export$")
    time.sleep(3)
    js(d, """const n=[...document.querySelectorAll('*')].find(x=>x.children.length==0&&(x.innerText||'').trim()==='Number of Animations');
const r=n.getBoundingClientRect();document.elementFromPoint(r.x+150,r.y+r.height+30).click()""")
    time.sleep(3)
    n = js(d, """const t=[...document.querySelectorAll('*')].find(x=>x.children.length==0&&/^\\d+\\/\\d+$/.test((x.innerText||'').trim()));
return t ? Number(t.innerText.trim().split('/')[1]) : 0""")
    return n or 0


def cerrar_dialogos(d):
    from selenium.webdriver.common.keys import Keys
    for _ in range(3):
        d.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.5)
    js(d, "[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/close/i.test(b.getAttribute('aria-label')||'')).forEach(b=>b.click())")
    time.sleep(1)


def probar(d, a):
    return js(d, """const n=[...document.querySelectorAll('.group span')].find(x=>x.innerText&&x.innerText.trim()===arguments[0]);
if(!n)return false;n.scrollIntoView({block:'center'});n.closest('.group').querySelector('button').click();return true""", a)


def animar_y_exportar(d, carpeta):
    esperar(d, lambda: js(d, "return [...document.querySelectorAll('.group span')].some(x=>arguments[0].includes((x.innerText||'').trim()))", ANIMS), 240, 3, "las animaciones")
    pendientes = list(ANIMS)
    for vuelta in range(4):
        for a in pendientes:
            if not probar(d, a):
                print("  no existe:", a, flush=True)
            time.sleep(7)                      # Tripo tarda en aplicarla; si se pulsa otra antes, se pierde
        hechas = elegidas(d)
        print(f"Vuelta {vuelta + 1}: {hechas} de {len(ANIMS)} aplicadas", flush=True)
        if hechas >= len(ANIMS):
            break
        cerrar_dialogos(d)
        pendientes = list(ANIMS)          # no se sabe cuáles faltan: se repasan todas (las ya hechas no cuestan)
    # (el diálogo de elegir animaciones ya está abierto)
    antes = time.time()
    js(d, "const n=[...document.querySelectorAll('*')].find(x=>x.children.length==0&&(x.innerText||'').trim()==='Select All');(n.closest('button,label,[role=checkbox]')||n).click()")
    time.sleep(2)
    boton(d, r"^Export$")
    print("Exportando…", flush=True)

    def nuevo():
        fs = [f for f in DESCARGAS.glob("*.glb") if f.stat().st_mtime > antes]
        return fs and not list(DESCARGAS.glob("*.crdownload")) and fs
    esperar(d, lambda: bool(nuevo()), 600, 5, "la descarga")
    glb = max(nuevo(), key=lambda f: f.stat().st_mtime)
    (carpeta / "modelo.glb").write_bytes(glb.read_bytes())
    print("Listo ->", carpeta / "modelo.glb", f"({glb.stat().st_size // 1024} KB)")


def solo_animar(pid, modelo):
    """Repite solo las animaciones y la exportación de un modelo ya hecho (no gasta créditos)."""
    d = conectar()
    d.get("https://studio.tripo3d.ai/workspace/animate/" + modelo)
    time.sleep(8)
    animar_y_exportar(d, RAIZ / "personajes" / "reales" / pid)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "animar":     # python herramientas/tripo_real.py animar <id> <id_modelo_tripo>
        solo_animar(sys.argv[2], sys.argv[3])
    else:
        main(sys.argv[1])
