"""Genera las frases del narrador (voz masculina natural, estilo locutor de carreras) en audio/.

Uso:  python herramientas/generar_voz.py          (solo genera lo que falte)
      python herramientas/generar_voz.py --todo   (lo rehace todo)
Hay que volver a ejecutarlo al añadir personajes a personajes/personajes.json.
Necesita: pip install edge-tts  (usa las voces neuronales de Microsoft, gratis)
"""
import asyncio, json, os, sys, unicodedata, re
import edge_tts

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(RAIZ, 'audio')
VOZ = 'es-ES-AlvaroNeural'
TODO = '--todo' in sys.argv

# estilo: (velocidad, tono). 'emocion' para los momentos fuertes.
ESTILO = {'normal': ('+15%', '+4Hz'), 'emocion': ('+25%', '+10Hz'), 'tope': ('+30%', '+14Hz'), 'calma': ('+5%', '+0Hz')}

# Frases con {P} (personaje): se generan para cada personaje.
POR_PERSONAJE = {
    'avanza1': ('normal', ['{P} avanza una casilla.', 'Una casillita para {P}.']),
    'avanza2': ('normal', ['¡{P} avanza dos!', '¡Dos casillas para {P}!']),
    'avanza3': ('emocion', ['¡{P} acelera! ¡Tres casillas!', '¡Qué zancada de {P}! ¡Tres más!']),
    'avanza4': ('tope', ['¡Vuela {P}! ¡Cuatro casillas de golpe!', '¡Increíble arrancada de {P}! ¡Cuatro!']),
    'retrocede': ('normal', ['¡Uy! ¡{P} resbala y pierde terreno!', '¡{P} da un paso atrás!']),
    'tropiezo': ('emocion', ['¡Se cae {P}! ¡Al suelo!', '¡Tropieza {P}! ¡Qué golpe, señores!']),
    'sprint': ('emocion', ['¡Sprint de {P}!', '¡{P} saca el sprint!']),
    'turbo': ('tope', ['¡TURBO para {P}! ¡Sale disparado!', '¡{P} enciende el turbo! ¡Cinco casillas!']),
    'atajo': ('tope', ['¡{P} encuentra un atajo! ¡Aparece junto al líder!']),
    'intercambio': ('tope', ['¡Intercambio! ¡{P} se cambia por el líder!']),
    'placaje': ('tope', ['¡Placaje brutal de {P}!', '¡{P} se lanza al placaje! ¡Qué impacto!']),
    'calambre': ('emocion', ['¡Calambre para {P}! ¡Retrocede tres!']),
    'roja': ('emocion', ['¡Tarjeta roja para {P}! ¡Castigado tres turnos!']),
    'lider': ('emocion', ['¡{P} se pone en cabeza!', '¡Nuevo líder: {P}!', '¡{P} toma el mando de la carrera!']),
    'recta': ('tope', ['¡Recta final! ¡{P} ya huele la meta!', '¡Entramos en la recta final con {P} delante!']),
    'gana': ('tope', ['¡{P}! ¡{P} gana la carrera! ¡Increíble!', '¡Y gana {P}! ¡Qué carrera, señores, qué carrera!']),
    'mediavuelta': ('emocion', ['¡{P} se da media vuelta! ¡Ahora corre hacia atrás!', '¡Pero qué hace {P}! ¡Se ha girado y va al revés!']),
    'meteorito': ('tope', ['¡Cuidado! ¡Un meteorito cae sobre {P}!', '¡Del cielo! ¡Un meteorito directo a {P}!']),
    'eliminado': ('tope', ['¡{P} queda eliminado! ¡Fuera de la carrera!', '¡Se acabó para {P}! ¡Eliminado!']),
    'ovni': ('tope', ['¡Un ovni! ¡Se están llevando a {P}!', '¡Abducción! ¡{P} sube a la nave espacial!']),
    'devuelve': ('tope', ['¡Vuelve el ovni! ¡Y suelta a {P} mucho más adelante!', '¡{P} cae del cielo! ¡Qué atajo espacial!']),
    'cohete': ('tope', ['¡{P} sale disparado en un cohete!', '¡Despega {P}! ¡Siete casillas por el aire!']),
    'bomba': ('emocion', ['¡{P} lleva una bomba! ¡Tic, tac!', '¡Atención! ¡Una bomba en la espalda de {P}!']),
    'explota': ('tope', ['¡BOOM! ¡Explota la bomba de {P}!', '¡Revienta la bomba! ¡{P} sale volando hacia atrás!']),
    # apuestas, rachas y votación (17 nov 2026)
    'favorito': ('emocion', ['¡{P} es el favorito del público! ¡Ahí va el dinero!', 'Las apuestas lo tienen claro: ¡{P} es el gran favorito!']),
    'sufren': ('emocion', ['¡Sufren los que apostaron por {P}!', '¡Ay, ay, ay! ¡Las apuestas por {P} tiemblan!']),
    'nadie': ('tope', ['¡Y ojo, que nadie ha apostado por {P}!', '¡Cuidado, que {P} va delante y nadie confió en esa carrera!']),
    'vienedeganar': ('emocion', ['¡Ojo con {P}, que viene de ganar la última carrera!', '¡{P} viene de ganar! ¿Repetirá?']),
    'empujon': ('tope', ['¡El público empuja a {P}! ¡Dos casillas!', '¡La grada ha votado! ¡Empujón para {P}!']),
    'presenta0': ('normal', ['Por el carril uno... ¡{P}!']),
    'presenta1': ('normal', ['Por el carril dos... ¡{P}!']),
    'presenta2': ('normal', ['En el carril tres... ¡{P}!']),
    'presenta3': ('normal', ['Y por el carril cuatro... ¡{P}!']),
}
# Frases generales.
GENERALES = {
    'mele': ('normal', ['¡Melé! ¡Todos avanzan uno!', '¡Empujan todos a la vez!']),
    'estampida': ('tope', ['¡ESTAMPIDA! ¡Todos avanzan dos!', '¡Estampida en el estadio!']),
    'viento': ('normal', ['Viento en contra. Todos retroceden.', '¡Qué ventolera! Todos para atrás.']),
    'patada': ('emocion', ['¡Patada a seguir para el último!', '¡El último recibe el balón y avanza tres!']),
    'grada': ('emocion', ['¡La grada empuja a los de atrás!', '¡El público se vuelca con los rezagados!']),
    'cambiazo': ('tope', ['¡Cambiazo! ¡El primero y el último se intercambian!', '¡No me lo puedo creer! ¡El líder pasa a ser el último!']),
    'reves': ('tope', ['¡Todo al revés! ¡La carrera se da la vuelta!', '¡Locura total! ¡El orden se invierte!']),
    'barro': ('emocion', ['¡Barro en la pista! ¡Los de cabeza se van al suelo!']),
    'junta': ('emocion', ['¡Melé general! ¡Todos juntos otra vez!', '¡Se reagrupa la carrera!']),
    'remontada': ('tope', ['¡Remontada! ¡El último avanza cinco!', '¡Atención a la remontada del último!']),
    'amarilla': ('emocion', ['¡Tarjeta amarilla para el líder!', '¡El árbitro saca la amarilla al primero!']),
    'adelantado': ('emocion', ['¡Pase adelantado! ¡El líder retrocede tres!', '¡Falta del líder! ¡Para atrás!']),
    'fisio': ('normal', ['Entra el fisio. Los caídos se recuperan.', '¡El fisio hace magia!']),
    'tornado': ('tope', ['¡Un tornado arrasa la pista! ¡Todos revueltos!', '¡Tornado! ¡Nadie sabe dónde va a caer!']),
    'secreta': ('emocion', ['¡Ojo! ¡Carta secreta!', '¡Atención, que llega una carta secreta!', '¡Carta secreta en juego!']),
    'nada': ('calma', ['No pasa nada.', 'Todo sigue igual.']),
    'igualada': ('emocion', ['¡Qué igualdad! ¡Están todos juntos!', '¡Carrera apretadísima!']),
    'prorroga': ('tope', ['¡Prórroga! ¡Esto no se ha acabado!']),
    'foto': ('tope', ['¡Foto finish! ¡Hay que mirar la foto!', '¡Llegan juntos! ¡Foto finish!']),
    'bienvenida': ('normal', ['¡Bienvenidos al estadio! Estos son los corredores de hoy.', '¡Buenas noches y bienvenidos a la carrera más loca!']),
    'arrancan': ('tope', ['¡Y arrancan! ¡Comienza la carrera!', '¡Salida! ¡Ya están en marcha!']),
    'apuestas': ('normal', ['¡Se cierran las apuestas!']),
    # votación del empujón y apuestas en directo
    'votacion': ('tope', ['¡Votación! ¿A quién empuja el público? ¡Diez segundos!', '¡Mitad de carrera! ¡Votad a quién le damos un empujón!']),
    'novoto': ('normal', ['Nadie ha votado. ¡Seguimos!']),
    'empatevoto': ('emocion', ['¡Empate en la votación! Lo decide la suerte...']),
    'directo': ('tope', ['¡Se abren las apuestas en directo! ¡Diez segundos!', '¡Apuestas en directo! ¡Con las cuotas de ahora mismo!']),
    'nova': ('emocion', ['¡No va más! ¡Seguimos con la carrera!', '¡Se cierran las apuestas en directo!']),
    # rachas y sorpresas
    'racha': ('emocion', ['¡Atención, que hay un apostador en racha!', '¡Hay alguien que no falla una! ¡Mirad la pantalla!']),
    'todo': ('tope', ['¡Alguien se lo ha jugado todo! ¡Todo al rojo!', '¡Madre mía! ¡Hay quien lo ha apostado todo!']),
    'sorpresa': ('tope', ['¡Nadie lo vio venir! ¡Qué sorpresa!', '¡Nadie había apostado por esa victoria! ¡Increíble!']),
    'pronostico': ('emocion', ['¡Se cumplen los pronósticos! ¡Gana el favorito!', '¡Lo que decían las apuestas! ¡Gana el favorito!']),
    'fotoespera': ('calma', ['Un momento... estamos mirando la foto...', 'Silencio en el estadio... el juez revisa la foto...']),
    # escenarios y sus cartas
    'esc_estadio': ('normal', ['¡Hoy corremos en el gran estadio!']),
    'esc_playa': ('emocion', ['¡Hoy corremos en la playa! ¡Cuidado con las olas!']),
    'esc_nieve': ('emocion', ['¡Carrera en la nieve! ¡Abrigaos bien!']),
    'esc_volcan': ('tope', ['¡Carrera junto al volcán! ¡Que no os pille la lava!']),
    'ola': ('tope', ['¡Ola gigante! ¡Arrastra a todos menos al último!', '¡Viene una ola enorme! ¡El último la surfea!']),
    'avalancha': ('tope', ['¡Avalancha! ¡Los de cabeza quedan enterrados!', '¡Cuidado! ¡Se viene la nieve encima de los primeros!']),
    'erupcion': ('tope', ['¡Erupción! ¡Llueve lava sobre la pista!', '¡El volcán despierta! ¡Lava para todos!']),
}


def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


async def generar(texto, estilo, ruta, sem):
    if os.path.exists(ruta) and not TODO:
        return False
    vel, tono = ESTILO[estilo]
    async with sem:
        for intento in range(4):
            try:
                await edge_tts.Communicate(texto, VOZ, rate=vel, pitch=tono).save(ruta)
                return True
            except Exception as e:
                if intento == 3:
                    print('ERROR', ruta, e)
                await asyncio.sleep(2)
    return False


async def main():
    os.makedirs(AUDIO, exist_ok=True)
    personajes = []
    for cat in ('personajes.json', '3d-bumeran/personajes.json', 'reales/personajes.json'):     # todos los catálogos
        ruta = os.path.join(RAIZ, 'personajes', cat)
        if os.path.exists(ruta):
            with open(ruta, encoding='utf-8') as f:
                personajes += json.load(f)['personajes']
    sem = asyncio.Semaphore(6)
    tareas, indice = [], {}
    for clave, (estilo, frases) in GENERALES.items():
        for i, fr in enumerate(frases):
            nombre = f'{clave}__{i}.mp3'
            indice.setdefault(clave, {}).setdefault('_', []).append(nombre)
            tareas.append(generar(fr, estilo, os.path.join(AUDIO, nombre), sem))
    for p in personajes:
        pid = slug(p['id'])
        for clave, (estilo, frases) in POR_PERSONAJE.items():
            for i, fr in enumerate(frases):
                nombre = f'{clave}__{pid}__{i}.mp3'
                indice.setdefault(clave, {}).setdefault(p['id'], []).append(nombre)
                tareas.append(generar(fr.replace('{P}', p['nombre']), estilo, os.path.join(AUDIO, nombre), sem))
    hechos = await asyncio.gather(*tareas)
    with open(os.path.join(AUDIO, 'indice.json'), 'w', encoding='utf-8') as f:
        json.dump(indice, f, ensure_ascii=False, indent=0)
    print(f'{sum(hechos)} audios nuevos, {len(tareas)} en total, voz {VOZ}')


asyncio.run(main())
