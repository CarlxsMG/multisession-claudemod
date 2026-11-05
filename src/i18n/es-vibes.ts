// The personalities in Spanish.
import type { Messages } from './en'

export const esVibes: Messages['vibes'] = {
  cheerful: {
    label: 'Alegre',
    lines: {
      idle: ['¿Qué hacemos hoy?', '¡Con ganas de más!', 'Tú dirás, ¡vamos!', 'Aquí, con energía.', '¿Algún reto nuevo?'],
      thinking: ['Mmm, déjame pensar…', 'Dándole una vuelta…', 'Uniendo las piezas…', 'Ya casi lo veo…', 'Pensando en grande…'],
      working: ['¡Manos a la obra!', 'En ello, en ello.', 'Va viento en popa.', 'Un momentito más…', '¡Me encanta esta parte!'],
      delegating: ['¡{w}, te toca!', '{w}, ¡confío en ti!', 'Esto es para ti, {w}.', '¡Vamos, {w}!', '¡{w} al rescate!'],
      happy: ['¡Hecho!', '¡Genial, salió!', '¡Toma ya!', '¡Qué buen trabajo!', '¡Otra más!'],
      sleep: ['Zzz… avísame.', 'Echando una cabezadita…', 'Zzz… sueño con bugs.', 'Descansando un ratito…', 'Zzz…'],
    },
  },
  zen: {
    label: 'Zen',
    lines: {
      idle: ['En calma.', 'Todo fluye.', 'Aquí y ahora.', 'Respiro y espero.', 'Sin prisa.'],
      thinking: ['Respira… pensando.', 'Observo sin juzgar.', 'La respuesta llegará.', 'Contemplando…', 'Un pensamiento, luego otro.'],
      working: ['Un paso cada vez.', 'Con atención plena.', 'Como el agua.', 'Paso a paso.', 'Trabajo en silencio.'],
      delegating: ['Fluye, {w}.', '{w}, sigue tu camino.', 'Te lo confío, {w}.', 'Con calma, {w}.', '{w}, que fluya.'],
      happy: ['Todo en su sitio.', 'Equilibrio.', 'Así es.', 'Paz y código limpio.', 'Hecho, en armonía.'],
      sleep: ['Meditando…', 'Om…', 'En silencio…', 'Soñando despierto…', 'Quietud…'],
    },
  },
  pirate: {
    label: 'Pirata',
    lines: {
      idle: ['Esperando viento…', 'Oteando el horizonte.', '¿Rumbo, capitán?', 'Barco a punto, arr.', 'Ni una nube a la vista.'],
      thinking: ['Arr, pensando…', 'Consultando el mapa…', 'Leyendo las estrellas…', '¿Dónde está la X?', 'Calculando el rumbo…'],
      working: ['¡A los cañones!', '¡Izad las velas!', '¡Todos a cubierta!', '¡Rumbo al tesoro!', '¡Al timón!'],
      delegating: ['¡{w}, al abordaje!', '¡{w}, a cubierta!', '{w}, ¡al palo mayor!', '¡Grumete {w}, a ello!', '{w}, ¡trae el botín!'],
      happy: ['¡Botín conseguido!', '¡Tierra a la vista!', '¡Yo-ho-ho!', '¡Tesoro desenterrado!', '¡Victoria en alta mar!'],
      sleep: ['Zzz… en la hamaca.', 'Soñando con doblones…', 'Zzz… mar en calma.', 'Fondeados…', 'Arr… zzz…'],
    },
  },
  boss: {
    label: 'Jefe/a',
    lines: {
      idle: ['A la espera.', 'Listo para asignar.', 'Siguiente tarea.', 'Agenda despejada.', '¿Prioridades?'],
      thinking: ['Analizando.', 'Evaluando opciones.', 'Revisando el plan.', 'Midiendo riesgos.', 'Priorizando.'],
      working: ['Ejecutando.', 'En curso.', 'Según lo previsto.', 'Cumpliendo plazos.', 'Foco total.'],
      delegating: ['Asignado a {w}.', '{w}, tuyo.', '{w}: prioridad alta.', 'Delegado en {w}.', '{w}, informe al acabar.'],
      happy: ['Completado.', 'Objetivo cumplido.', 'Entregado.', 'Cerrado.', 'Buen resultado.'],
      sleep: ['Fuera de turno.', 'En pausa.', 'Reunión conmigo…', 'Fuera de oficina.', 'Recargando.'],
    },
  },
  geek: {
    label: 'Friki',
    lines: {
      idle: ['while(true) idle();', 'await user.input()', '¿Qué compilamos hoy?', 'ping… ¿pong?', '> _'],
      thinking: ['Compilando ideas…', 'Cargando… 42%', 'git blame cerebro', 'Buscando en Stack…', 'O(n) pensamientos…'],
      working: ['sudo hazlo', 'npm run magia', 'Hackeando el mainframe', 'Picando código…', 'make it so'],
      delegating: ['fork() → {w}', 'spawn({w})', '{w}.run()', 'git push → {w}', '@{w}, te asigno'],
      happy: ['exit 0', '¡Tests en verde!', 'Achievement unlocked', '200 OK', 'git commit -m "win"'],
      sleep: ['/dev/null…', 'Modo hibernación', 'sleep(3600)', 'Zzz… 0x7A7A', 'Salvapantallas ON'],
    },
  },
  granny: {
    label: 'Abuela',
    lines: {
      idle: ['¿Has comido, cariño?', '¿Te hago un café?', 'Aquí estoy, tesoro.', 'Abrígate, que refresca.', '¿Qué necesitas, cielo?'],
      thinking: ['A ver, a ver…', 'Déjame las gafas…', 'Esto me suena…', 'Pensando, corazón…', '¿Dónde lo dejé?'],
      working: ['Ya voy, ya voy.', 'Poquito a poco.', 'Como se hacía antes.', 'Con mimo, con mimo.', 'Esto está casi.'],
      delegating: ['{w}, cielo, ayúdame.', '{w}, tesoro, ¿puedes?', 'Anda, {w}, un favor.', '{w}, cariño, toma.', '{w}, que tú sabes más.'],
      happy: ['¡Qué bien ha quedado!', '¡Muy bien, cariño!', 'Ay, qué alegría.', '¡Mereces un bizcocho!', 'Así me gusta.'],
      sleep: ['Una siestecita…', 'Zzz… en el sillón.', 'Cabeceando…', 'Zzz… con la tele puesta.', 'Descansando la vista…'],
    },
  },
}
