// Citations de développement personnel ; une par jour, dans l'ordre.
import { diffDays, today } from './util.js';

const QUOTES = [
  ['Un voyage de mille lieues commence toujours par un premier pas.', 'Lao Tseu'],
  ['Hâte-toi de bien vivre et songe que chaque jour est à lui seul une vie.', 'Sénèque'],
  ["Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.", 'Sénèque'],
  ["Fais de ta vie un rêve, et d'un rêve, une réalité.", 'Antoine de Saint-Exupéry'],
  ["On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.", 'Antoine de Saint-Exupéry'],
  ["Nous sommes ce que nous faisons de manière répétée. L'excellence n'est donc pas un acte, mais une habitude.", 'Will Durant'],
  ["Prends soin de ton corps, c'est le seul endroit où tu es obligée de vivre.", 'Jim Rohn'],
  ["La motivation vous fait commencer. L'habitude vous fait continuer.", 'Jim Ryun'],
  ["Le meilleur moment pour planter un arbre, c'était il y a vingt ans. Le deuxième meilleur moment, c'est maintenant.", 'Proverbe chinois'],
  ['Celui qui déplace une montagne commence par déplacer de petites pierres.', 'Confucius'],
  ['Rien n\'est permanent, sauf le changement.', 'Héraclite'],
  ["Il faut cultiver notre jardin.", 'Voltaire'],
  ['La patience est amère, mais son fruit est doux.', 'Jean-Jacques Rousseau'],
  ["Lire, c'est boire et manger. L'esprit qui ne lit pas maigrit comme le corps qui ne mange pas.", 'Victor Hugo'],
  ['La lecture est une amitié.', 'Marcel Proust'],
  ['Agis comme s\'il était impossible d\'échouer.', 'Dorothea Brande'],
  ["Le bonheur n'est pas quelque chose de prêt à l'emploi. Il vient de vos propres actions.", 'Dalaï-Lama'],
  ["La persévérance, c'est ce qui rend l'impossible possible, le possible probable et le probable certain.", 'Robert Half'],
  ["Le pessimiste voit la difficulté dans chaque opportunité, l'optimiste voit l'opportunité dans chaque difficulté.", 'Winston Churchill'],
  ["Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme.", 'Winston Churchill'],
  ["Ils ne savaient pas que c'était impossible, alors ils l'ont fait.", 'Mark Twain'],
  ["Le secret pour avancer, c'est de commencer.", 'Mark Twain'],
  ['La simplicité est la sophistication suprême.', 'Léonard de Vinci'],
  ["Le temps est ce que nous voulons le plus, mais ce que nous utilisons le plus mal.", 'William Penn'],
  ['Celui qui veut réussir trouve un moyen. Celui qui ne veut rien faire trouve une excuse.', 'Proverbe arabe'],
  ["La seule façon de faire du bon travail est d'aimer ce que vous faites.", 'Steve Jobs'],
  ["Le courage n'est pas l'absence de peur, mais la capacité de la vaincre.", 'Nelson Mandela'],
  ["Tout semble impossible jusqu'à ce que ce soit fait.", 'Nelson Mandela'],
  ["On n'est jamais aussi heureux ni aussi malheureux qu'on s'imagine.", 'La Rochefoucauld'],
  ['Ce que nous savons est une goutte d\'eau, ce que nous ignorons est un océan.', 'Isaac Newton'],
  ["Il n'y a pas de chemin vers le bonheur. Le bonheur, c'est le chemin.", 'Proverbe bouddhiste'],
  ["Prendre soin de soi n'est pas égoïste : c'est ce qui permet de prendre soin des autres.", 'Anonyme'],
  ["Le repos fait partie de l'entraînement.", 'Sagesse de coureur'],
  ["Chaque kilomètre parcouru est une victoire sur celle que tu étais hier.", 'Sagesse de coureur'],
  ['Cours avec ta tête les premiers kilomètres, avec ta personnalité ceux du milieu, et avec ton cœur la fin.', 'Mike Fanelli'],
  ["Ce n'est pas la montagne que nous conquérons, mais nous-mêmes.", 'Edmund Hillary'],
  ["La discipline est le pont entre les objectifs et leur réalisation.", 'Jim Rohn'],
  ["Fais aujourd'hui ce que d'autres ne veulent pas faire, demain tu vivras comme d'autres ne peuvent pas vivre.", 'Jerry Rice'],
  ["Le calme est le berceau de la force.", 'Josiah Gilbert Holland'],
  ["Une heure de lecture est le souverain remède contre les dégoûts de la vie.", 'Montesquieu'],
  ["Enseigner, c'est apprendre deux fois.", 'Joseph Joubert'],
  ["L'éducation est l'arme la plus puissante pour changer le monde.", 'Nelson Mandela'],
  ["Choisis un travail que tu aimes et tu n'auras pas à travailler un seul jour de ta vie.", 'Confucius'],
  ["Avance lentement, mais ne recule jamais.", 'Proverbe'],
  ["Le bonheur est la seule chose qui se double si on le partage.", 'Albert Schweitzer'],
];

export function quoteOfTheDay(day = today()) {
  const n = diffDays('2026-01-01', day);
  const [text, author] = QUOTES[((n % QUOTES.length) + QUOTES.length) % QUOTES.length];
  return { text, author };
}
