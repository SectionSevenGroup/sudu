#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);

// 1) Homepage: wire the first-scroll statement guard without altering the
// authored page or its existing reveal engine.
let index = read('index.html');
if (!index.includes('js/home-scroll-fade-fix.js')) {
  index = index.replace('</helmet>', '<script src="js/home-scroll-fade-fix.js" defer></script>\n</helmet>');
  write('index.html', index);
}

// 2) Contact FAQ: these rows are generated from Component state, so they were
// not in the i18n dictionary and therefore stayed English even when the rest of
// the page changed language. Add exact-source rows to the existing dictionary;
// its MutationObserver then handles both initial render and FAQ expansion.
let i18n = read('i18n.js');
const faqRows = `
["What types of projects do you take on?", "Quels types de projets réalisez-vous ?", "¿Qué tipos de proyectos realizan?", "Welche Arten von Projekten übernehmen Sie?", "どのようなプロジェクトに対応していますか？"],
["Residential, hospitality, retail, commercial, and community work, from concept studies to full architectural services. No project is too early: some of our best work starts as a feasibility question.", "Résidentiel, hôtellerie, commerce, projets commerciaux et communautaires, des études conceptuelles aux services architecturaux complets. Il n'est jamais trop tôt : certains de nos meilleurs projets commencent par une simple question de faisabilité.", "Residencial, hospitalidad, comercio, proyectos comerciales y comunitarios, desde estudios conceptuales hasta servicios completos de arquitectura. Nunca es demasiado pronto: algunos de nuestros mejores proyectos comienzan con una pregunta de viabilidad.", "Wohn-, Gastronomie-, Einzelhandels-, Gewerbe- und Gemeinschaftsprojekte, von Konzeptstudien bis zu vollständigen Architektenleistungen. Es ist nie zu früh: Einige unserer besten Projekte beginnen mit einer Machbarkeitsfrage.", "住宅、ホスピタリティ、リテール、商業、コミュニティのプロジェクトに、コンセプトスタディから一連の建築サービスまで対応します。早すぎる段階というものはありません。優れた仕事の多くは、実現可能性についての問いから始まります。"],
["Where do you work?", "Où travaillez-vous ?", "¿Dónde trabajan?", "Wo arbeiten Sie?", "どの地域で仕事をしていますか？"],
["The studio is based in Alberta, with projects across Western Canada and select work beyond. Distance has never been the deciding factor.", "Le studio est basé en Alberta, avec des projets partout dans l'Ouest canadien et certains mandats ailleurs. La distance n'a jamais été le facteur déterminant.", "El estudio tiene su sede en Alberta, con proyectos en todo el oeste de Canadá y trabajos seleccionados en otros lugares. La distancia nunca ha sido el factor decisivo.", "Das Studio hat seinen Sitz in Alberta und arbeitet in ganz Westkanada sowie bei ausgewählten Projekten darüber hinaus. Entfernung war nie der entscheidende Faktor.", "スタジオはアルバータを拠点とし、カナダ西部全域を中心に、選定した地域外のプロジェクトにも取り組んでいます。距離だけで仕事を決めることはありません。"],
["How does a project start?", "Comment un projet commence-t-il ?", "¿Cómo comienza un proyecto?", "Wie beginnt ein Projekt?", "プロジェクトはどのように始まりますか？"],
["With a conversation. We then scope a concept phase first, so you can see a direction, a budget picture, and how we work together before committing to the full journey.", "Par une conversation. Nous définissons ensuite une première phase de concept afin que vous puissiez voir une direction, une première lecture du budget et notre façon de travailler ensemble avant de vous engager dans l'ensemble du processus.", "Con una conversación. Después definimos primero una fase de concepto para que pueda ver una dirección, una imagen inicial del presupuesto y cómo trabajamos juntos antes de comprometerse con todo el proceso.", "Mit einem Gespräch. Danach definieren wir zunächst eine Konzeptphase, damit Sie Richtung, Budgetrahmen und unsere Zusammenarbeit kennenlernen können, bevor Sie sich auf den gesamten Prozess festlegen.", "まずは対話からです。その後、最初にコンセプト段階の範囲を定め、方向性、予算の見通し、そして私たちとの進め方を確認してから、全体のプロセスへ進めます。"],
["Do you handle both architecture and interiors?", "Prenez-vous en charge à la fois l'architecture et les intérieurs ?", "¿Se encargan tanto de arquitectura como de interiores?", "Übernehmen Sie sowohl Architektur als auch Innenräume?", "建築とインテリアの両方に対応していますか？"],
["Yes, and branded environments too. The work is strongest when one team holds the building, the interior, and the brand as a single idea.", "Oui, ainsi que les environnements de marque. Le travail est le plus fort lorsqu'une même équipe tient le bâtiment, l'intérieur et la marque comme une seule idée.", "Sí, y también entornos de marca. El trabajo es más sólido cuando un solo equipo entiende el edificio, el interior y la marca como una única idea.", "Ja, ebenso Markenräume. Die Arbeit ist am stärksten, wenn ein Team Gebäude, Innenraum und Marke als eine einzige Idee zusammenführt.", "はい。ブランド空間にも対応します。建物、インテリア、ブランドをひとつの考えとして同じチームが扱うとき、仕事は最も強くなります。"],
["What does engaging SuDu cost?", "Combien coûte un mandat avec SuDu ?", "¿Cuánto cuesta trabajar con SuDu?", "Was kostet die Beauftragung von SuDu?", "SuDuへの依頼費用はどのくらいですか？"],
["Fees are scoped per project: fixed for defined phases, transparent throughout. An initial conversation costs nothing.", "Les honoraires sont définis selon chaque projet : fixes pour les phases clairement établies et transparents tout au long du processus. La première conversation est sans frais.", "Los honorarios se definen según cada proyecto: fijos para fases claramente definidas y transparentes durante todo el proceso. La conversación inicial no tiene costo.", "Die Honorare werden projektbezogen festgelegt: fest für klar definierte Phasen und während des gesamten Prozesses transparent. Ein erstes Gespräch ist kostenlos.", "費用はプロジェクトごとに設定します。明確に定義した各段階は固定費とし、全体を通して透明性を保ちます。最初の相談に費用はかかりません。"],
["Do you work with existing consultants or builders?", "Travaillez-vous avec des consultants ou des entrepreneurs déjà en place ?", "¿Trabajan con consultores o constructores existentes?", "Arbeiten Sie mit bereits beauftragten Fachplanern oder Bauunternehmen?", "既存のコンサルタントや施工者とも仕事をしますか？"],
["Regularly. We collaborate with allied practices, including MES Architecture and DIALOG, and we are comfortable joining teams a client has already assembled.", "Régulièrement. Nous collaborons avec des pratiques partenaires, notamment MES Architecture et DIALOG, et nous sommes à l'aise de rejoindre des équipes déjà constituées par le client.", "Con frecuencia. Colaboramos con estudios aliados, incluidos MES Architecture y DIALOG, y nos integramos con facilidad en equipos que el cliente ya haya conformado.", "Regelmäßig. Wir arbeiten mit Partnerbüros wie MES Architecture und DIALOG zusammen und können uns problemlos in Teams integrieren, die ein Kunde bereits zusammengestellt hat.", "日常的に行っています。MES ArchitectureやDIALOGを含む協働事務所と連携しており、クライアントがすでに編成したチームへ加わることにも慣れています。"]`;

if (!i18n.includes('["What types of projects do you take on?"')) {
  const marker = '\n];\nvar DICT=';
  if (!i18n.includes(marker)) throw new Error('Could not locate i18n dictionary terminator');
  i18n = i18n.replace(marker, ',\n' + faqRows.trim() + marker);
  write('i18n.js', i18n);
}

console.log('Applied homepage first-scroll and FAQ i18n regression fixes.');
