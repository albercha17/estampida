# Estampida

Juego mixto (tablero físico + PC + móviles) de carreras y apuestas.

- `pantalla.html`: en el PC o la tele. Saca 4 corredores al azar y 20 cartas, enseña el QR, lleva la carrera, el narrador y los puntos.
- `movil.html`: cada apostador. Ve su carta secreta (que entra en el mazo), apuesta y pulsa «Listo».
- La comunicación va por **Supabase Realtime** (canales de difusión, sin tablas). Con `?local=1` funciona en un solo navegador, sin internet (para probar).

## Reglas (versión 1)
- Tablero: 4 carriles, salida (casilla 0) y 12 casillas hasta la meta (zona de ensayo).
- Mazo de 62 cartas: 11 por carril (avanza 2/3/4, retrocede, tropiezo, sprint, placaje) y 18 globales (melé, estampida, viento, tarjeta amarilla, patada a seguir, pase adelantado, fisio, cambiazo, la grada empuja).
- Las cartas de carril hablan del carril, no del personaje, así sirven con cualquier corredor.
- Caído: su próximo avance solo sirve para levantarse. Si le vuelven a tirar estando en el suelo: lesión, retrocede 2.
- Amarilla: el que va primero pierde sus 2 próximos avances.
- Siempre hay ganador: si varios cruzan con la misma carta, gana el que llega más lejos, luego el que iba delante y, si no, foto finish. Si se acaba el mazo hay **prórroga**: se barajan las cartas jugadas y cada carta empuja además +1 a todos (tope de 30 cartas).
- Apuestas: 100 puntos al empezar. A **ganador** o a **podio** (1.º o 2.º). La cuota sale de simular 3000 carreras con las 20 cartas públicas (margen 0,9). Mínimo 5. Si alguien llega a 0, recibe 20 en la siguiente carrera.

## Personajes
Están en `personajes/personajes.json`. Para usar los tuyos, pon las imágenes (png con fondo transparente) en `personajes/` y añade `"imagen": "archivo.png"` a cada uno.

## Pruebas
```
node tests/motor.test.mjs        # reglas, ganador garantizado, apuestas
node tests/simular.mjs           # equilibrio (cada corredor gana ~25 %)
python tests/navegador.py        # PC + 3 móviles en Chrome (modo local)
python tests/supabase_real.py    # PC + móvil por Supabase de verdad
```
