# crew

[English](README.md)

Un plugin de Claude Code que convierte tu sesión en un equipo visible. Hablas solo con tu
orquestador, una mascota pixel-art que tú personalizas. Él delega el trabajo en workers
(subagentes en segundo plano, uno por repositorio o tarea) y los coordina, y cada worker aparece
en un panel junto al chat como un rombo de contorno en su color que trabaja, descansa, celebra o
falla en tiempo real.

## Qué hace

- **Un panel junto al chat** (`/crew`). Arriba, el orquestador sobre su podio con su nombre, su
  personalidad, el modelo con que trabaja la sesión y un bocadillo que sigue lo que está haciendo.
  A su lado, el interruptor **Delegar ON/OFF**, **Editar** y el uso de tu cuenta (`5h`, `sem` y
  la ventana semanal propia de Fable) en verde, amarillo desde el 50 % y rojo desde el 80 %.
- **Las fichas de los workers.** Una fila de rombos, uno por worker, cada uno en su color y con su
  pareja de signos. Una marca en la esquina dice qué hace (`+` arrancando, `|/-\` trabajando, `?`
  esperando, `.oO` pensando, `>` delegando, `*` celebrando, `✓` listo, `zZ` durmiendo, `!` falló,
  `x` detenido). Bajo su nombre, el paso de su plan (`3/5`), o lo que lleva su ejecución, o una
  palabra de cuatro letras (`init`, `wait`, `done`, `fail`, `stop`). Un worker libre o que ha
  terminado (listo, falló o detenido) sale de la fila a los pocos segundos, cuando su final ha
  dejado de destacar, pero sigue en la vista del equipo (`/crew equipo`), que lista cada worker con
  su estado, repositorio, tarea, lo que hace y el tiempo y las llamadas de su ejecución.
- **Los mensajes del equipo**: los dos más recientes como burbujas de chat que se van escribiendo,
  los anteriores como una línea discreta cada uno.
- **Delegación por defecto.** Con Delegar ON, el system prompt del orquestador y la descripción de
  la herramienta `delegate` le piden pasar al equipo todo salvo las respuestas rápidas, reutilizar
  el worker que ya conoce un área, lanzar en paralelo las partes independientes y reconducir a los
  workers con `SendMessage`. El brief se fija al cargar el plugin, para que la caché del prompt no
  se reescriba; los cambios posteriores le llegan al modelo en una nota `[crew]` breve con tu
  siguiente mensaje.
- **Tres herramientas para el orquestador.** `mcp__crew__delegate` da una tarea a un worker: el
  que nombres, el libre más reciente que trabajó en ese repositorio (conserva su contexto) o uno
  nuevo. `mcp__crew__roster` le lista el equipo al modelo. Los workers llaman a
  `mcp__crew__progress` para declarar su plan y el paso en que están.
- **Workers que informan breve y trabajan con cuidado.** Cada worker sabe que su informe vuelve a
  una conversación que debe quedarse pequeña: primero el resultado, luego los hechos. En un
  repositorio git hace commit de su trabajo en una rama o worktree `crew/*`, nunca en la rama
  principal salvo que lo hayas pedido.
- **Los workers hablan entre sí.** Un mensaje a un compañero ocupado le llega en su siguiente
  llamada a una herramienta; uno a un compañero libre lo despierta, y sale desde la conversación
  principal para que su informe vuelva al orquestador. Una tarea para un worker al que acaba de
  despertar otro worker espera y le llega cuando esa ejecución termina.
- **Burbujas en la conversación** (terminal). Lo que el orquestador manda a un worker, y lo que el
  worker le devuelve, se dibujan como burbujas en el color del worker:

  ```
  ╭─ Nova → Pip · Arreglar tests ─────╮
  │ Run the tests and fix what fails. │
  ╰─ nuevo · ! Bolt trabaja aquí ─────╯
  ╭─ Pip → Nova · ✓ listo · 2m 5s ─╮
  │ Arreglar tests                 │
  ╰────────────────────────────────╯
  ```

  Es solo dibujo: lo que se guarda y lo que lee cualquier modelo no cambia. Con ctrl+o cada una se
  ve entera.
- **Progreso que no lee ningún modelo.** Una línea de estado bajo el prompt
  (`crew · Pip 3/5 6m Arreglar tests · Bolt leyendo 4m`), un aviso flotante cuando termina una
  ejecución, una línea en la conversación por cada mensaje entre workers y un aviso cada 3 minutos
  mientras alguien trabaja (solo si algo cambió), cerrado con un resumen de la ronda. Lo único del
  progreso que lee un modelo es el paso de un worker activo en el roster.
- **Tu mascota.** Un editor con pestañas para su carácter, cara, cabeza, cuerpo, extras y
  compartir. Seis personalidades (alegre, zen, pirata, jefe/a, friki, abuela) colorean cómo habla.
  Sus frases fijas van rotando, y Haiku escribe un lote extra una vez por personalidad, que se
  guarda entre sesiones.
- **Códigos para compartir.** `/crew codigo` copia un código `CREW1.…` que otra persona importa
  con `/crew importar <código>`.
- **Inglés y español.** La interfaz sigue el ajuste de idioma de Claude Code, o la opción
  `language` del plugin.

## Instalarlo

Desde Claude Code:

```
/plugin marketplace add CarlxsMG/multisession-claudemod
/plugin install crew@multisession-claudemod
```

O desde una terminal:

```
claude plugin marketplace add CarlxsMG/multisession-claudemod
claude plugin install crew@multisession-claudemod --scope user
```

Luego abre el panel con `/crew`. Se activa o desactiva desde `/plugin`.

Para trabajar en el propio plugin, mira [CONTRIBUTING.md](CONTRIBUTING.md) (en inglés).

## Requisitos

- Claude Code 2.1.318 o posterior (la versión con que pasan los tests y la validación en CI).
- Para el panel acoplado a la derecha: una terminal ancha a pantalla completa (desde unas 110–144
  columnas). En una más estrecha, el panel se abre encima del prompt.
- Para ver el uso: una suscripción de Claude. Con una API key no aparece.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/crew` | Abre el panel |
| `/crew equipo` | Todos los workers, uno por fila |
| `/crew editar` | Personaliza tu mascota |
| `/crew msg <worker> <texto>` | Manda un mensaje a un worker |
| `/crew codigo` | Copia el código de tu mascota |
| `/crew importar <código>` | Importa una mascota desde un código |
| `/crew aleatorio` | Mascota al azar (conserva nombre y frase) |
| `/crew modo on\|off` | Si el orquestador delega solo, o no |
| `/crew limpiar` | Quita del panel los workers terminados |
| `/crew progreso` | Un aviso de cómo van los workers, ahora |
| `/crew progreso 1m\|2m\|3m\|5m\|10m\|off` | Cada cuánto llegan los avisos (3m por defecto) |

Los verbos en inglés (`team`, `edit`, `code`, `import`, `random`, `mode`, `clear`, `progress`)
funcionan en cualquier idioma. Con el panel enfocado, Tab recorre sus botones y Enter los pulsa. En
el editor: `r` aleatorio, `l` listo (`d` en inglés) y, en Compartir, `c` copia el código.

## Ajustes

- **Idioma** (opción `language` del plugin: `auto`, `en` o `es`; `auto` por defecto). Con `auto`,
  el crew habla el idioma del ajuste `language` de Claude Code (`Español`, `spanish`, `es-ES`…), e
  inglés si nombra uno que el crew no tiene. Todo lo que lee un modelo sigue en inglés, hable la
  interfaz lo que hable.
- **Delegación** (`/crew modo on|off`, o el interruptor del panel). Se guarda entre sesiones.
- **Cada cuánto llegan los avisos** (`/crew progreso 1m|2m|3m|5m|10m|off`). Se guarda entre
  sesiones. `off` quita los avisos y el resumen de la ronda, no la línea de estado, las líneas de
  final ni el panel.
- **La consulta del uso.** La ventana semanal de Fable solo está en `/usage`, así que el crew se la
  pide a un `claude -p` sin plugins ni sesión (la petición `get_usage` del SDK: no gasta tokens,
  unos 3 s en segundo plano), como mucho cada 3 minutos y solo desde una sesión interactiva o con
  la app de escritorio o un editor conectados. Una sesión `-p` nunca la pide. Las ventanas de 5
  horas y semanal las da el motor.

## Compatibilidad

- macOS, Linux y Windows. En Windows, `repo` admite `C:\ruta`, `c:/ruta`, la forma de Git Bash
  (`/c/ruta`), rutas relativas con cualquier barra, `~\ruta` (la carpeta de usuario,
  `USERPROFILE`, aunque no haya `HOME`) y rutas de red (`\\servidor\recurso`); mayúsculas y barras
  distintas cuentan como el mismo repositorio.
- La terminal dibuja las figuras como celdas y las repinta en su sitio; la app de escritorio, los
  editores y el móvil las dibujan en SVG. Las burbujas de la conversación son solo de la terminal.
- Se ve igual en Windows Terminal y en el Terminal de macOS: las marcas son caracteres que tienen
  Cascadia Mono, SF Mono y Menlo.
- En Terminal.app, que Claude Code pinta con 256 colores, cada color de las figuras se toma del
  xterm más cercano a ojo, salvo con `COLORTERM=truecolor` (macOS 26 o posterior) o
  `FORCE_COLOR=3`. Para que las figuras se vean sin rayas, usa Menlo Regular con espaciado de
  caracteres 1 y de línea 0,805, y desactiva «Unicode East Asian Ambiguous characters are wide».

## Problemas frecuentes

- **El panel no se abre.** Solo se abre con una superficie conectada (una terminal o una app), y se
  abre cuando se conecta una. Ejecuta `/crew`.
- **`delegate` no arranca nada en el modo auto de la app de escritorio.** El modo auto revisa solo
  las llamadas que escribe el modelo, así que la llamada a Agent que hace `delegate` se queda sin
  veredicto. `delegate` le dice entonces al orquestador que arranque él el worker con la
  herramienta Agent, y el crew toma ese agente como el worker.
- **No aparece el uso.** Usas una API key, o la sesión es una `-p` sin interfaz.
- **La interfaz sale en otro idioma.** Ajusta la opción `language` del plugin, o el ajuste
  `language` de Claude Code.
- **Figuras con rayas en Terminal.app.** Mira los ajustes de fuente en Compatibilidad.

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) explica la preparación, las comprobaciones y las convenciones;
[ARCHITECTURE.md](ARCHITECTURE.md), cómo funciona el plugin, con un glosario; y
[docs/i18n.md](docs/i18n.md), cómo se traducen los textos de la interfaz. Están en inglés.

## Licencia

[MIT](LICENSE)
