// Banque de questions trivia FC Barcelona pour le quiz quotidien.
// Le quiz du jour est sélectionné de façon déterministe à partir de la date :
// tous les utilisateurs ont le même quiz le même jour, et il change chaque jour.
//
// Rotation : la banque entière est mélangée (graine = numéro de cycle) puis parcourue
// 5 questions par jour. Sur un cycle complet (floor(N/5) jours) aucune question ne se
// répète ; au cycle suivant la banque est re-mélangée → les regroupements changent.
// Les réponses sont en plus mélangées chaque jour (la bonne n'est jamais au même endroit).

import { quizDayKey, quizDayNumber } from '../utils/quizDay';
import { QUIZ_QUESTIONS_EXTRA } from './quizBankExtra';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  category: 'Histoire' | 'Joueurs' | 'Palmarès' | 'Stade & Club' | 'Culture';
}

// Pour chaque question, la bonne réponse est en première position dans la source —
// l'ordre est mélangé à l'exécution, donc la position réelle varie chaque jour.
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { id: 'q1', question: 'En quelle année le FC Barcelone a-t-il été fondé ?', options: ['1899', '1902', '1909', '1925'], correctIndex: 0, category: 'Histoire' },
  { id: 'q2', question: 'Qui est le fondateur du club ?', options: ['Joan Gamper', 'Josep Sunyol', 'Walter Wild', 'Joan Laporta'], correctIndex: 0, category: 'Histoire' },
  { id: 'q3', question: 'Quelle est la devise officielle du club ?', options: ['Més que un club', 'Força Barça', 'Visca Catalunya', 'Sempre units'], correctIndex: 0, category: 'Culture' },
  { id: 'q4', question: 'Comment surnomme-t-on les supporters du Barça ?', options: ['Culés', 'Merengues', 'Colchoneros', 'Péricos'], correctIndex: 0, category: 'Culture' },
  { id: 'q5', question: 'Comment s\'appelle le stade du Barça ?', options: ['Camp Nou', 'Santiago Bernabéu', 'Mestalla', 'Metropolitano'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q6', question: 'En quelle année le Camp Nou a-t-il été inauguré ?', options: ['1957', '1947', '1967', '1977'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q7', question: 'Comment s\'appelle le centre de formation du club ?', options: ['La Masia', 'La Fábrica', 'La Cantera', 'El Vivero'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q8', question: 'Combien de Ligues des Champions le Barça a-t-il remportées ?', options: ['5', '3', '4', '6'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q9', question: 'Qui est le meilleur buteur de l\'histoire du club ?', options: ['Lionel Messi', 'Luis Suárez', 'László Kubala', 'César'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q10', question: 'Combien de Ballons d\'Or Lionel Messi a-t-il gagnés au total ?', options: ['8', '6', '7', '9'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q11', question: 'Quel entraîneur a remporté le sextuplé en 2009 ?', options: ['Pep Guardiola', 'Frank Rijkaard', 'Luis Enrique', 'Johan Cruyff'], correctIndex: 0, category: 'Histoire' },
  { id: 'q12', question: 'Qui a marqué le but vainqueur de la 1re C1 (1992, Wembley) ?', options: ['Ronald Koeman', 'Hristo Stoichkov', 'Romário', 'Michael Laudrup'], correctIndex: 0, category: 'Histoire' },
  { id: 'q13', question: 'Quel était l\'adversaire de la finale C1 1992 ?', options: ['Sampdoria', 'Milan AC', 'Ajax', 'Bayern Munich'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q14', question: 'Que désignait le trio offensif "MSN" ?', options: ['Messi-Suárez-Neymar', 'Messi-Sánchez-Neymar', 'Munir-Suárez-Neymar', 'Messi-Suárez-Naldo'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q15', question: 'Qui a marqué le but de la "remontada" (6-1 vs PSG, 2017) à la 95e ?', options: ['Sergi Roberto', 'Neymar', 'Lionel Messi', 'Luis Suárez'], correctIndex: 0, category: 'Histoire' },
  { id: 'q16', question: 'Comment surnomme-t-on le jeu de possession du Barça ?', options: ['Tiki-taka', 'Catenaccio', 'Gegenpressing', 'Total Football'], correctIndex: 0, category: 'Culture' },
  { id: 'q17', question: 'Quel capitaine emblématique a pris sa retraite en 2014 ?', options: ['Carles Puyol', 'Xavi', 'Andrés Iniesta', 'Sergio Busquets'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q18', question: 'Quel gardien a gardé les buts lors des C1 2006, 2009 et 2011 ?', options: ['Víctor Valdés', 'José Pinto', 'Claudio Bravo', 'Pepe Reina'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q19', question: 'Quel gardien allemand est arrivé au club en 2014 ?', options: ['Marc-André ter Stegen', 'Manuel Neuer', 'Kevin Trapp', 'Bernd Leno'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q20', question: 'Contre quel club se joue "El Clásico" ?', options: ['Real Madrid', 'Atlético Madrid', 'Valence', 'Séville'], correctIndex: 0, category: 'Culture' },
  { id: 'q21', question: 'Contre quel club se joue le derby de Barcelone (derbi barceloní) ?', options: ['Espanyol', 'Girona', 'Real Betis', 'Villarreal'], correctIndex: 0, category: 'Culture' },
  { id: 'q22', question: 'Comment s\'appelle l\'hymne du club ?', options: ['El Cant del Barça', 'Hala Barça', 'Blau i Grana', 'Visca el Barça'], correctIndex: 0, category: 'Culture' },
  { id: 'q23', question: 'Quel Brésilien a remporté le Ballon d\'Or 2005 au Barça ?', options: ['Ronaldinho', 'Rivaldo', 'Ronaldo', 'Romário'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q24', question: 'Quel Brésilien a remporté le Ballon d\'Or 1999 au Barça ?', options: ['Rivaldo', 'Ronaldinho', 'Romário', 'Denílson'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q25', question: 'Quel joueur a fait un transfert controversé vers le Real en 2000 ?', options: ['Luís Figo', 'Ronaldo', 'Michael Laudrup', 'Bernd Schuster'], correctIndex: 0, category: 'Histoire' },
  { id: 'q26', question: 'À quelle période Diego Maradona a-t-il joué au Barça ?', options: ['1982-1984', '1978-1980', '1985-1987', '1990-1992'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q27', question: 'Quel Bulgare a remporté le Ballon d\'Or 1994 au Barça ?', options: ['Hristo Stoichkov', 'Dimitar Berbatov', 'Lyuboslav Penev', 'Yordan Letchkov'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q28', question: 'Quel est l\'équipementier actuel du club ?', options: ['Nike', 'Adidas', 'Puma', 'Kappa'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q29', question: 'Quelle ONG figurait sur le maillot dès 2006 ?', options: ['UNICEF', 'Croix-Rouge', 'WWF', 'Médecins Sans Frontières'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q30', question: 'Quelles sont les couleurs historiques du club ?', options: ['Bleu et grenat', 'Rouge et or', 'Bleu et blanc', 'Rouge et bleu ciel'], correctIndex: 0, category: 'Culture' },
  { id: 'q31', question: 'Quel jeune ailier né en 2007 a explosé en 2023-2024 ?', options: ['Lamine Yamal', 'Ansu Fati', 'Gavi', 'Pedri'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q32', question: 'Quel milieu néerlandais est arrivé de l\'Ajax en 2019 ?', options: ['Frenkie de Jong', 'Matthijs de Ligt', 'Donny van de Beek', 'Quincy Promes'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q33', question: 'Quel défenseur est arrivé de Séville en 2022 ?', options: ['Jules Koundé', 'Clément Lenglet', 'Samuel Umtiti', 'Marlon'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q34', question: 'Quel attaquant polonais est arrivé en 2022 ?', options: ['Robert Lewandowski', 'Arkadiusz Milik', 'Krzysztof Piątek', 'Piotr Zieliński'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q35', question: 'Quel attaquant camerounais a brillé au Barça dans les années 2000 ?', options: ['Samuel Eto\'o', 'Vincent Aboubakar', 'Pierre Webó', 'Mohammadou Idrissou'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q36', question: 'Quel entraîneur a remporté le triplé en 2015 ?', options: ['Luis Enrique', 'Pep Guardiola', 'Ernesto Valverde', 'Quique Setién'], correctIndex: 0, category: 'Histoire' },
  { id: 'q37', question: 'Quel était l\'adversaire de la finale C1 2015 ?', options: ['Juventus', 'Bayern Munich', 'Atlético Madrid', 'Liverpool'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q38', question: 'Quel était l\'adversaire des finales C1 2009 et 2011 ?', options: ['Manchester United', 'Chelsea', 'Arsenal', 'Inter Milan'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q39', question: 'Quel était l\'adversaire de la finale C1 2006 ?', options: ['Arsenal', 'Chelsea', 'Juventus', 'Milan AC'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q40', question: 'Qui est le président du club depuis 2021 ?', options: ['Joan Laporta', 'Josep Maria Bartomeu', 'Sandro Rosell', 'Josep Lluís Núñez'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q41', question: 'Quel Néerlandais a dirigé la "Dream Team" (1988-1996) ?', options: ['Johan Cruyff', 'Rinus Michels', 'Louis van Gaal', 'Frank Rijkaard'], correctIndex: 0, category: 'Histoire' },
  { id: 'q42', question: 'Quel a été le 1er club espagnol à réaliser le triplé (2009) ?', options: ['FC Barcelone', 'Real Madrid', 'Valence', 'Atlético Madrid'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q43', question: 'Combien de trophées comptait le sextuplé de 2009 ?', options: ['6', '4', '5', '7'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q44', question: 'Quel est le nom commercial du stade depuis 2022 ?', options: ['Spotify Camp Nou', 'Nike Camp Nou', 'Estadi Blaugrana', 'Camp Nou Arena'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q45', question: 'Dans quel stade le Barça a-t-il joué pendant la rénovation du Camp Nou ?', options: ['Montjuïc (Lluís Companys)', 'Cornellà-El Prat', 'Sarrià', 'Mestalla'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q46', question: 'Quelle joueuse du Barça a remporté le Ballon d\'Or 2021 et 2022 ?', options: ['Alexia Putellas', 'Aitana Bonmatí', 'Caroline Graham Hansen', 'Jennifer Hermoso'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q47', question: 'Quelle joueuse du Barça a remporté le Ballon d\'Or 2023 et 2024 ?', options: ['Aitana Bonmatí', 'Alexia Putellas', 'Salma Paralluelo', 'Mariona Caldentey'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q48', question: 'Comment s\'appelle l\'équipe réserve du club ?', options: ['Barça Atlètic (Barça B)', 'Barça C', 'Juvenil A', 'Barça Academy'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q49', question: 'Quelle était la capacité du Camp Nou avant rénovation ?', options: ['~99 000', '~80 000', '~110 000', '~65 000'], correctIndex: 0, category: 'Stade & Club' },
  { id: 'q50', question: 'Quel défenseur français a soulevé la C1 2011 après une greffe du foie ?', options: ['Éric Abidal', 'Samuel Umtiti', 'Jérémy Mathieu', 'Lilian Thuram'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q51', question: 'Quel coach a été champion 2012-2013 avec 100 points ?', options: ['Tito Vilanova', 'Pep Guardiola', 'Gerardo Martino', 'Luis Enrique'], correctIndex: 0, category: 'Histoire' },
  { id: 'q52', question: 'Quel milieu défensif "sentinelle" a quitté le club en 2023 ?', options: ['Sergio Busquets', 'Xavi', 'Ivan Rakitić', 'Andrés Iniesta'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q53', question: 'Contre qui Iniesta a-t-il marqué un but décisif en demie C1 2009 ?', options: ['Chelsea', 'Arsenal', 'Inter Milan', 'Liverpool'], correctIndex: 0, category: 'Histoire' },
  { id: 'q54', question: 'Quel numéro mythique Messi a-t-il porté la majorité de sa carrière au Barça ?', options: ['10', '9', '19', '30'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q55', question: 'Avec quel numéro Messi a-t-il fait ses débuts en équipe première ?', options: ['30', '19', '10', '9'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q56', question: 'Quel numéro portait Johan Cruyff joueur ?', options: ['14', '9', '10', '8'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q57', question: 'Que récompense le trophée "Pichichi" ?', options: ['Le meilleur buteur de Liga', 'Le meilleur gardien', 'Le meilleur jeune', 'Le MVP de la saison'], correctIndex: 0, category: 'Culture' },
  { id: 'q58', question: 'La Supercoupe d\'Espagne oppose le champion de Liga au vainqueur de quoi ?', options: ['La Copa del Rey', 'La Supercoupe UEFA', 'La Ligue des Champions', 'La Liga 2'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q59', question: 'En quelle année le Barça a-t-il gagné sa 1re Coupe du monde des clubs ?', options: ['2009', '2011', '2006', '2015'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q60', question: 'Quel attaquant brésilien "phénomène" a joué une saison au Barça en 1996-97 ?', options: ['Ronaldo', 'Romário', 'Rivaldo', 'Ronaldinho'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q61', question: 'Contre quel club le Barça a-t-il gagné la Coupe des Coupes 1997 ?', options: ['PSG', 'Fiorentina', 'Arsenal', 'Lazio'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q62', question: 'À quel poste jouait Ronald Koeman, buteur de la finale 1992 ?', options: ['Défenseur', 'Attaquant', 'Gardien', 'Ailier'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q63', question: 'Quel est le surnom de Lionel Messi ?', options: ['La Pulga', 'El Pistolero', 'El Niño', 'La Joya'], correctIndex: 0, category: 'Culture' },
  { id: 'q64', question: 'Dans quelle ville s\'est jouée la finale C1 2009 (vs Man Utd) ?', options: ['Rome', 'Berlin', 'Londres', 'Paris'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q65', question: 'Dans quelle ville s\'est jouée la finale C1 2015 (vs Juventus) ?', options: ['Berlin', 'Rome', 'Lisbonne', 'Milan'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q66', question: 'Dans quelle ville s\'est jouée la finale C1 2006 (vs Arsenal) ?', options: ['Paris', 'Athènes', 'Glasgow', 'Moscou'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q67', question: 'Quel était le score de la finale C1 2009 face à Manchester United ?', options: ['2-0', '3-1', '1-0', '2-1'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q68', question: 'Quel était le score de la finale C1 2011 face à Manchester United ?', options: ['3-1', '2-0', '2-1', '4-0'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q69', question: 'Comment a-t-on surnommé le 5-0 infligé au Real en 2010 sous Guardiola ?', options: ['La Manita', 'La Remontada', 'La Goleada', 'Le Clásico du siècle'], correctIndex: 0, category: 'Histoire' },
  { id: 'q70', question: 'Qui détient le record de buts sur une année civile (91 en 2012) ?', options: ['Lionel Messi', 'Cristiano Ronaldo', 'Robert Lewandowski', 'Luis Suárez'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q71', question: 'La Masia a notamment formé Messi, Xavi, Iniesta et… ?', options: ['Sergio Busquets', 'Luis Suárez', 'Neymar', 'Dani Alves'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q72', question: 'De quel club venait Dani Alves, latéral droit légendaire ?', options: ['Séville', 'Porto', 'Santos', 'Fluminense'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q73', question: 'De quel club est arrivé Neymar en 2013 ?', options: ['Santos', 'Flamengo', 'São Paulo', 'Palmeiras'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q74', question: 'Vers quel club Neymar a-t-il quitté le Barça en 2017 ?', options: ['PSG', 'Real Madrid', 'Manchester City', 'Juventus'], correctIndex: 0, category: 'Histoire' },
  { id: 'q75', question: 'Quel montant record a coûté le transfert de Neymar au PSG ?', options: ['222 M€', '100 M€', '150 M€', '300 M€'], correctIndex: 0, category: 'Histoire' },
  { id: 'q76', question: 'De quel club est arrivé Luis Suárez en 2014 ?', options: ['Liverpool', 'Ajax', 'Atlético Madrid', 'Inter Milan'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q77', question: 'En quelle année Xavi est-il devenu entraîneur du Barça ?', options: ['2021', '2019', '2023', '2020'], correctIndex: 0, category: 'Histoire' },
  { id: 'q78', question: 'Quel club du Qatar Xavi dirigeait-il avant le Barça ?', options: ['Al-Sadd', 'Al-Rayyan', 'Al-Duhail', 'Al-Gharafa'], correctIndex: 0, category: 'Histoire' },
  { id: 'q79', question: 'Le surnom "Rey de Copas" vient du record du club dans quelle compétition ?', options: ['La Copa del Rey', 'La Ligue des Champions', 'La Supercoupe', 'La Liga'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q80', question: 'Dans quelle ville le club a-t-il été fondé ?', options: ['Barcelone', 'Madrid', 'Gérone', 'Tarragone'], correctIndex: 0, category: 'Histoire' },
  { id: 'q81', question: 'De quelle région le club est-il un symbole identitaire ?', options: ['La Catalogne', 'Le Pays basque', 'La Galice', 'L\'Andalousie'], correctIndex: 0, category: 'Culture' },
  { id: 'q82', question: 'Dans quelle langue sont écrits le nom "Barça" et l\'hymne ?', options: ['Le catalan', 'Le castillan', 'Le basque', 'Le galicien'], correctIndex: 0, category: 'Culture' },
  { id: 'q83', question: 'Quel croate, finaliste du Mondial 2018, a joué au Barça de 2014 à 2020 ?', options: ['Ivan Rakitić', 'Luka Modrić', 'Marcelo Brozović', 'Mateo Kovačić'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q84', question: 'En quelle année le Barça féminin a-t-il gagné sa 1re Ligue des Champions ?', options: ['2021', '2019', '2017', '2023'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q85', question: 'Quel club le Barça féminin a-t-il battu 4-0 en finale C1 2021 ?', options: ['Chelsea', 'Lyon', 'Wolfsbourg', 'PSG'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q86', question: 'Quel numéro portait Carles Puyol ?', options: ['5', '3', '4', '2'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q87', question: 'En quelle année est arrivé Thierry Henry au Barça ?', options: ['2007', '2005', '2009', '2010'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q88', question: 'Combien de fois le Barça a-t-il gagné la Coupe du monde des clubs (FIFA) ?', options: ['3', '1', '2', '4'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q89', question: 'Quel club a battu le record de Gerd Müller sur une année avec Messi en 2012 ?', options: ['Aucun, c\'est Messi (91 buts)', 'Le Real Madrid', 'Le Bayern', 'Manchester City'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q90', question: 'Quel championnat le Barça dispute-t-il ?', options: ['LaLiga', 'La Serie A', 'La Bundesliga', 'La Ligue 1'], correctIndex: 0, category: 'Culture' },
  { id: 'q91', question: 'De quelle nationalité est Robert Lewandowski ?', options: ['Polonaise', 'Tchèque', 'Allemande', 'Croate'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q92', question: 'De quelle nationalité est le milieu Pedri ?', options: ['Espagnole', 'Portugaise', 'Argentine', 'Brésilienne'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q93', question: 'À quel poste joue Marc-André ter Stegen ?', options: ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q94', question: 'L\'écusson du club arbore la croix de quel saint ?', options: ['Saint Georges', 'Saint Jacques', 'Saint André', 'Saint Martin'], correctIndex: 0, category: 'Culture' },
  { id: 'q95', question: 'Combien de titres de Liga le Barça compte-t-il (parmi les plus titrés) ?', options: ['Plus de 25', 'Environ 10', 'Environ 15', 'Plus de 40'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q96', question: 'Combien de fois (environ) le Barça a-t-il gagné la Coupe du Roi (record) ?', options: ['Plus de 30', 'Plus de 50', 'Environ 20', 'Environ 10'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q97', question: 'Quel duo a marqué lors de la finale C1 2009 (2-0) ?', options: ['Eto\'o et Messi', 'Messi et Villa', 'Xavi et Iniesta', 'Henry et Eto\'o'], correctIndex: 0, category: 'Palmarès' },
  { id: 'q98', question: 'Quel jeune milieu espagnol, né en 2004, s\'est imposé vers 2021-2022 ?', options: ['Gavi', 'Pedri', 'Fermín', 'Casadó'], correctIndex: 0, category: 'Joueurs' },
  { id: 'q99', question: 'Quel mot complète la devise : "Més que un ___" ?', options: ['club', 'país', 'equip', 'somni'], correctIndex: 0, category: 'Culture' },
  { id: 'q100', question: 'Combien de fois (environ) Messi a-t-il été champion de Liga avec le Barça ?', options: ['10', '5', '15', '3'], correctIndex: 0, category: 'Joueurs' },
];

export const DAILY_QUESTION_COUNT = 5;

// Banque complète = questions historiques + extension. L'import est fait ici (et non
// l'inverse) pour que `quizBankExtra` puisse réutiliser le type `QuizQuestion`.
const ALL_QUESTIONS: QuizQuestion[] = [...QUIZ_QUESTIONS, ...QUIZ_QUESTIONS_EXTRA];

/** Nombre de jours consécutifs sans qu'une question ne se répète. */
export const DAYS_WITHOUT_REPEAT = Math.floor(ALL_QUESTIONS.length / DAILY_QUESTION_COUNT);

// Identifiant de la journée de quiz (bascule à 9h, heure de Paris — pas à minuit,
// et pas dans le fuseau de l'appareil : tout le monde a le même quiz au même moment).
export function getTodayKey(date = new Date()): string {
  return quizDayKey(date);
}

// Numéro de journée (graine déterministe), aligné sur la bascule de 9h Paris
function dayNumber(date = new Date()): number {
  return quizDayNumber(date);
}

// PRNG déterministe (mulberry32) → mélanges reproductibles à partir d'une graine.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mélange les réponses d'une question (la bonne n'est plus toujours au même endroit)
function shuffleOptions(q: QuizQuestion, seed: number): QuizQuestion {
  const order = q.options.map((_, i) => i);
  const rand = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map(i => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

// Ordre de passage FIXE de la banque, mélangé une seule fois.
//
// Remélanger la banque à chaque cycle (ce que faisait la version précédente) ne
// garantit l'absence de répétition que pour un utilisateur qui commence pile au
// début d'un cycle : à cheval sur deux cycles, les tirages se recoupent et une
// question peut retomber au bout de quelques semaines. Avec un ordre fixe parcouru
// en boucle, TOUTE fenêtre de `DAYS_WITHOUT_REPEAT` jours consécutifs couvre la
// banque exactement une fois — la garantie vaut quel que soit le jour de départ.
const ROTATION = seededShuffle(ALL_QUESTIONS, 20260722);

// Sélectionne les questions du jour de façon déterministe.
// - Parcours en boucle de l'ordre fixe → aucune répétition sur 3 mois glissants.
// - Mélange des réponses (graine = jour + question) → position de la bonne réponse variable.
export function getDailyQuestions(date = new Date()): QuizQuestion[] {
  const perDay = DAILY_QUESTION_COUNT;
  const usable = DAYS_WITHOUT_REPEAT * perDay; // ignore le reliquat (< 5 questions)

  const day = dayNumber(date);
  const start = (((day * perDay) % usable) + usable) % usable;

  return ROTATION
    .slice(start, start + perDay)
    .map((q, i) => shuffleOptions(q, (day + 1) * 1000 + i));
}
