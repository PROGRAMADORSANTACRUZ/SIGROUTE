// Versículo del día para la pantalla de login.
//
// Se elige de una lista local en vez de consultar un servicio externo: el
// login es lo primero que carga todo el mundo cada mañana y no puede quedar
// colgado esperando a un sitio de terceros, ni fallar si el servidor no tiene
// salida a internet. La selección es determinista por fecha (día absoluto en
// hora Colombia): avanza uno por día y es estable durante toda la jornada.
//
// Texto: Reina-Valera 1960, la versión de uso corriente en Colombia.
// (mismo enfoque y lista que suite-santacruz/SIGNOM/signomina/versiculos.py)

const VERSICULOS: [string, string][] = [
  ["Todo lo puedo en Cristo que me fortalece.", "Filipenses 4:13"],
  ["Esfuérzate y sé valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo dondequiera que vayas.", "Josué 1:9"],
  ["Encomienda a Jehová tu camino, y confía en él; y él hará.", "Salmos 37:5"],
  ["Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres.", "Colosenses 3:23"],
  ["El que es fiel en lo muy poco, también en lo más es fiel.", "Lucas 16:10"],
  ["Jehová es mi pastor; nada me faltará.", "Salmos 23:1"],
  ["Fiel es Dios, por el cual fuisteis llamados a la comunión con su Hijo.", "1 Corintios 1:9"],
  ["Mira que te mando que te esfuerces y seas valiente.", "Josué 1:9"],
  ["Bástate mi gracia; porque mi poder se perfecciona en la debilidad.", "2 Corintios 12:9"],
  ["En el mundo tendréis aflicción; pero confiad, yo he vencido al mundo.", "Juan 16:33"],
  ["Los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.", "Isaías 40:31"],
  ["No os afanéis por el día de mañana, porque el día de mañana traerá su afán.", "Mateo 6:34"],
  ["Todo tiene su tiempo, y todo lo que se quiere debajo del cielo tiene su hora.", "Eclesiastés 3:1"],
  ["Mejores son dos que uno; porque tienen mejor paga de su trabajo.", "Eclesiastés 4:9"],
  ["El corazón del hombre piensa su camino; mas Jehová endereza sus pasos.", "Proverbios 16:9"],
  ["Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.", "Proverbios 16:3"],
  ["La respuesta amable quita la ira; mas la palabra áspera hace subir el furor.", "Proverbios 15:1"],
  ["Hierro con hierro se aguza; y así el hombre aguza el rostro de su amigo.", "Proverbios 27:17"],
  ["El que anda en integridad anda confiado.", "Proverbios 10:9"],
  ["Mejor es lo poco con justicia que la muchedumbre de frutos sin derecho.", "Proverbios 16:8"],
  ["¿Has visto hombre solícito en su trabajo? Delante de los reyes estará.", "Proverbios 22:29"],
  ["En toda labor hay fruto; mas las vanas palabras de los labios empobrecen.", "Proverbios 14:23"],
  ["Lámpara es a mis pies tu palabra, y lumbrera a mi camino.", "Salmos 119:105"],
  ["Este es el día que hizo Jehová; nos gozaremos y alegraremos en él.", "Salmos 118:24"],
  ["Jehová es mi luz y mi salvación; ¿de quién temeré?", "Salmos 27:1"],
  ["Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.", "Salmos 46:1"],
  ["Echa sobre Jehová tu carga, y él te sustentará.", "Salmos 55:22"],
  ["Enséñanos de tal modo a contar nuestros días, que traigamos al corazón sabiduría.", "Salmos 90:12"],
  ["Alaba, alma mía, a Jehová, y no olvides ninguno de sus beneficios.", "Salmos 103:2"],
  ["Si Jehová no edificare la casa, en vano trabajan los que la edifican.", "Salmos 127:1"],
  ["Amado, yo deseo que tú seas prosperado en todas las cosas, y que tengas salud.", "3 Juan 1:2"],
  ["Porque yo sé los pensamientos que tengo acerca de vosotros, pensamientos de paz, y no de mal, para daros el fin que esperáis.", "Jeremías 29:11"],
  ["El amor es sufrido, es benigno; el amor no tiene envidia.", "1 Corintios 13:4"],
  ["Sobrellevad los unos las cargas de los otros, y cumplid así la ley de Cristo.", "Gálatas 6:2"],
  ["No nos cansemos, pues, de hacer bien; porque a su tiempo segaremos, si no desmayamos.", "Gálatas 6:9"],
  ["Mas el fruto del Espíritu es amor, gozo, paz, paciencia, benignidad, bondad, fe, mansedumbre, templanza.", "Gálatas 5:22-23"],
  ["Sed benignos unos con otros, misericordiosos, perdonándoos unos a otros.", "Efesios 4:32"],
  ["Todo lo hacéis sin murmuraciones y contiendas.", "Filipenses 2:14"],
  ["Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.", "Filipenses 4:6"],
  ["Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.", "Filipenses 4:7"],
  ["Mi Dios, pues, suplirá todo lo que os falta conforme a sus riquezas en gloria en Cristo Jesús.", "Filipenses 4:19"],
  ["Estad siempre gozosos. Orad sin cesar. Dad gracias en todo.", "1 Tesalonicenses 5:16-18"],
  ["Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio.", "2 Timoteo 1:7"],
  ["Toda buena dádiva y todo don perfecto desciende de lo alto.", "Santiago 1:17"],
  ["Pero sed hacedores de la palabra, y no tan solamente oidores.", "Santiago 1:22"],
  ["Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.", "1 Pedro 5:7"],
  ["Amados, amémonos unos a otros; porque el amor es de Dios.", "1 Juan 4:7"],
  ["Confía en Jehová de todo tu corazón, y no te apoyes en tu propia prudencia.", "Proverbios 3:5"],
  ["Reconócelo en todos tus caminos, y él enderezará tus veredas.", "Proverbios 3:6"],
  ["El principio de la sabiduría es el temor de Jehová.", "Proverbios 9:10"],
  ["Buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.", "Mateo 6:33"],
  ["Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.", "Mateo 11:28"],
  ["Así alumbre vuestra luz delante de los hombres, para que vean vuestras buenas obras.", "Mateo 5:16"],
  ["Todas las cosas que queráis que los hombres hagan con vosotros, así también haced vosotros con ellos.", "Mateo 7:12"],
  ["Porque donde están dos o tres congregados en mi nombre, allí estoy yo en medio de ellos.", "Mateo 18:20"],
  ["Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien.", "Romanos 8:28"],
  ["Si Dios es por nosotros, ¿quién contra nosotros?", "Romanos 8:31"],
  ["Gozosos en la esperanza; sufridos en la tribulación; constantes en la oración.", "Romanos 12:12"],
  ["Si es posible, en cuanto dependa de vosotros, estad en paz con todos los hombres.", "Romanos 12:18"],
  ["No seas vencido de lo malo, sino vence con el bien el mal.", "Romanos 12:21"],
  ["Porque por fe andamos, no por vista.", "2 Corintios 5:7"],
  ["Cada uno dé como propuso en su corazón: no con tristeza, ni por necesidad, porque Dios ama al dador alegre.", "2 Corintios 9:7"],
  ["Es, pues, la fe la certeza de lo que se espera, la convicción de lo que no se ve.", "Hebreos 11:1"],
  ["Jesucristo es el mismo ayer, y hoy, y por los siglos.", "Hebreos 13:8"],
  ["Y si alguno de vosotros tiene falta de sabiduría, pídala a Dios, el cual da a todos abundantemente y sin reproche.", "Santiago 1:5"],
  ["Cantad a Jehová cántico nuevo; cantad a Jehová, toda la tierra.", "Salmos 96:1"],
  ["Bendito el varón que confía en Jehová, y cuya confianza es Jehová.", "Jeremías 17:7"],
  ["Por la misericordia de Jehová no hemos sido consumidos, porque nunca decayeron sus misericordias. Nuevas son cada mañana.", "Lamentaciones 3:22-23"],
  ["No con ejército, ni con fuerza, sino con mi Espíritu, ha dicho Jehová de los ejércitos.", "Zacarías 4:6"],
  ["Aunque la higuera no florezca, ni en las vides haya frutos... con todo, yo me alegraré en Jehová.", "Habacuc 3:17-18"],
];

// Día absoluto (días desde una época fija) en hora Colombia, para que el
// versículo cambie exactamente a medianoche Bogotá sin depender de la zona
// horaria del servidor.
function diaAbsolutoBogota(): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const epoca = Date.UTC(1970, 0, 1);
  const hoy = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  return Math.floor((hoy - epoca) / 86_400_000);
}

export function versiculoDelDia(): { texto: string; cita: string } {
  const [texto, cita] = VERSICULOS[diaAbsolutoBogota() % VERSICULOS.length];
  return { texto, cita };
}
