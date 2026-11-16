"""Modo «Reales»: convierte la foto de una persona en un corredor 3D animado.

Pasos:
  1) python herramientas/crear_real.py concepto <foto.jpg> <id>
     ChatGPT (web, con la sesión del Chrome de Unlock-CA) dibuja a la persona como personaje de dibujos en
     POSE A, de cuerpo entero y fondo liso: la imagen ideal para que Tripo la convierta en 3D y le ponga esqueleto.
     -> personajes/reales/<id>/concepto.png   (la foto se copia a <id>/foto.* y NO se sube: está en .gitignore)
  2) Tripo (cuenta Pro, Chrome del puerto 9222): ver TRIPO más abajo -> personajes/reales/<id>/modelo.glb
  3) python herramientas/crear_real.py registrar <id> --nombre "Nombre" [--color "#hex"] [--lema "..."]
     Lo apunta en personajes/reales/personajes.json, hace el retrato del móvil y graba las frases del narrador.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = Path(__file__).resolve().parent.parent
REALES = RAIZ / "personajes" / "reales"
UNLOCK = Path.home() / "Documents" / "MIS PROGRAMAS" / "Unlock" / "Unlock-CA" / "herramientas"

# Lo que se le pide a ChatGPT. Todo lo que ayuda a Tripo a hacer un buen esqueleto: cuerpo entero, pose A,
# brazos y piernas separados del cuerpo, ropa ceñida, pelo que no tape hombros ni brazos, fondo liso, sin objetos.
PROMPT_CONCEPTO = """Convierte a la persona de la foto en un personaje 3D de dibujos animados (estilo película de animación, acabado de juguete de vinilo suave), para un videojuego de carreras.

PARECIDO: tiene que reconocerse que es esta persona: misma forma de cara, color y peinado del pelo, color de piel, cejas, barba o gafas si las tiene. Expresión simpática y con ganas de correr, boca cerrada sonriendo, ojos abiertos mirando al frente.

PROPORCIONES: cabeza algo grande (el cuerpo mide unas 4 cabezas), pero brazos, manos, piernas y pies bien formados y de tamaño normal.

ROPA: equipación deportiva ceñida (camiseta técnica de manga corta, pantalón corto de deporte, calcetines y zapatillas de correr), con los colores que lleve en la foto, SIN logotipos ni marcas. Nada suelto: sin capas, faldas largas, bolsos, mochilas ni accesorios colgando. Si tiene pelo largo, recogido en coleta o moño, que no tape los hombros ni los brazos.

POSE (muy importante): de pie, totalmente de frente, en POSE A: brazos estirados y separados del cuerpo unos 40 grados, palmas hacia abajo y dedos juntos; piernas rectas y un poco separadas (ancho de hombros); pies apoyados mirando al frente. Simétrico. Nada tapa nada: se ven las dos manos, los dos pies y la cabeza enteros.

IMAGEN: un solo personaje, de la cabeza a los pies, centrado y ocupando casi todo el alto, con un poco de margen. Fondo blanco liso, sin suelo, sin sombra, sin texto ni marcos. Luz suave y uniforme. Formato vertical."""

# Instrucciones para Tripo (las sigue Claude en la web de Tripo, studio.tripo3d.ai, o la persona a mano):
TRIPO = """
Comprobado con Alber (16 nov 2026), unos 110 créditos en total:
1. Workspace › Model › HD Model: subir concepto.png › Generate (55). ~3 min, sale con 1,9 M de caras.
2. Rig › Humanoid, esqueleto Mixamo › Auto Rig (20): avisa «Polygon Limit Exceeded» › Retopologize:
   Triangle, Smart Mesh, 20000 › Retopology (35). Luego otra vez Rig › Auto Rig (20).
   (Retopo: elegir Triangle y escribir 20000 en el número; por defecto sale Quad 10000.)
3. Animate › Preset: pulsar cada animación para probarla (gratis). Solo se pueden exportar las probadas:
   idle run fall cheer dance_01 defeat greet_01 hit_to_body_01 jump            (carrera)
   look_around stretch warm_up swagger standing_relax wait fold_arms agree     (gestos al estar parado)
   clap laugh_01 laugh_02 scared_01 frightened afraid angry_01 complain_01 frustrated_01  (reacciones)
4. Export: GLB, Export Skeleton sí, «Number of Animations» › Select All › Export (~6,6 MB).
   («Animation stay in Place» da igual: el juego quita el avance de la cadera.)
   Copiar el .glb de Descargas a personajes/reales/<id>/modelo.glb
El juego busca las animaciones por nombre (js/muneco3d.js, ANIMS).
"""


def concepto(foto, pid, extra=''):
    sys.path.insert(0, str(UNLOCK))
    import chatgpt_imagenes as cg  # noqa: E402
    carpeta = REALES / pid
    carpeta.mkdir(parents=True, exist_ok=True)
    foto = Path(foto)
    shutil.copy(foto, carpeta / ("foto" + foto.suffix.lower()))
    chat = cg.Chat(puerto=9222)
    # usar la pestaña de ChatGPT (o una nueva): nunca la de Tripo, que puede estar trabajando
    for h in chat.d.window_handles:
        chat.d.switch_to.window(h)
        if "chatgpt.com" in chat.d.current_url:
            break
    else:
        chat.d.switch_to.new_window("tab")
    chat.nuevo_chat()
    chat.adjuntar(foto)
    chat.enviar(PROMPT_CONCEPTO + ("\n\nADEMÁS: " + extra if extra else ""))
    src = chat.esperar_imagen()
    # a veces cuenta como «nueva» la miniatura de la foto adjunta: esperar a la imagen generada
    for _ in range(100):
        gen = chat.d.execute_script("const i=[...document.querySelectorAll('main img')].filter(x=>/generada|generated/i.test(x.alt||'')); return i.length ? i[i.length-1].src : null")
        if gen:
            src = gen
            break
        time.sleep(3)
    if not src:
        sys.exit("ChatGPT no ha devuelto imagen" + (" (límite de imágenes)" if chat.hay_limite() else ""))
    destino = carpeta / "concepto.png"
    if destino.exists():
        destino.rename(carpeta / f"concepto_{int(time.time())}.png")
    chat.descargar(src, destino)
    print("Concepto ->", destino)


def retrato(pid):
    """Retrato para el móvil: la cara y el pecho del concepto, en png con fondo transparente."""
    from PIL import Image
    im = Image.open(REALES / pid / "concepto.png").convert("RGBA")
    px = im.load()
    for y in range(im.height):              # fondo blanco -> transparente
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if r > 240 and g > 240 and b > 240:
                px[x, y] = (r, g, b, 0)
    caja = im.getchannel("A").getbbox()
    im = im.crop(caja)
    lado = im.width
    im = im.crop((0, 0, lado, min(im.height, int(lado * 1.0))))
    im.thumbnail((512, 512))
    im.save(REALES / pid / "retrato.png")


def registrar(pid, nombre, color, lema, emoji):
    if not (REALES / pid / "modelo.glb").exists():
        sys.exit(f"Falta personajes/reales/{pid}/modelo.glb (paso de Tripo)")
    retrato(pid)
    ruta = REALES / "personajes.json"
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    lista = [p for p in datos["personajes"] if p["id"] != "r_" + pid]
    lista.append({"id": "r_" + pid, "nombre": nombre, "emoji": emoji, "color": color, "lema": lema,
                  "imagen": f"reales/{pid}/retrato.png", "modelo": f"reales/{pid}/modelo.glb"})
    datos["personajes"] = lista
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(RAIZ / "herramientas" / "generar_voz.py")], check=False)
    print(f"Registrado {nombre}. Recuerda: python herramientas/version.py y publicar.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="paso", required=True)
    a = sub.add_parser("concepto"); a.add_argument("foto"); a.add_argument("id"); a.add_argument("--extra", default="", help="detalles: color de ojos, qué ignorar de la foto…")
    b = sub.add_parser("registrar"); b.add_argument("id"); b.add_argument("--nombre", required=True)
    b.add_argument("--color", default="#ff7043"); b.add_argument("--lema", default="¡A por todas!"); b.add_argument("--emoji", default="🏃")
    sub.add_parser("tripo")
    x = ap.parse_args()
    if x.paso == "concepto":
        concepto(x.foto, x.id, x.extra)
    elif x.paso == "registrar":
        registrar(x.id, x.nombre, x.color, x.lema, x.emoji)
    else:
        print(TRIPO)


if __name__ == "__main__":
    main()
