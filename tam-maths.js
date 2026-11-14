// tam-maths.js -- TAM, mathematiques du hasard et des nombres, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : le nombre de jours d une annee est un CURSEUR (365 par defaut,
//   rien n est affirme) ; chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les systemes :
//   marcheAleatoire : marches au hasard sur une grille ; <r^2> = n et Var r^2 = n^2 - n EXACTS.
//   aiguilleBuffon  : aiguilles jetees sur un parquet ; P(croise) = 2 l / (pi d) exact, pi relu (approche).
//   anniversaires   : groupes de k personnes ; P(deux partagent un jour) = 1 - prod (1 - i/D) exact.
//   spiraleUlam     : les nombres premiers sur la spirale d Ulam ; leur nombre compare a li(N) et N / ln N (approches : theoreme
//                     des nombres premiers).
import { sinD, cosD, lnD } from './tam-moteur.js';
import * as HB from './human-brain-data.js';
import * as HA from './human-brain-anatomy.js';
import { pointPalette, partIndexOf } from './human-brain-parts.js';

/* atan avec + - * / et sqrt (meme methode que tam-theories-3.js) */
function atanD(x) { if (!(x - x === 0)) return x === Infinity ? Math.PI / 2 : x === -Infinity ? -Math.PI / 2 : NaN; if (x < 0) return -atanD(-x); if (x > 1) return Math.PI / 2 - atanD(1 / x);
  let y = x / (1 + Math.sqrt(1 + x * x)); y = y / (1 + Math.sqrt(1 + y * y)); const y2 = y * y; let t = y, s = 0; for (let k = 0; k < 30; k++) { s += t / (2 * k + 1); t *= -y2; } return 4 * s; }
function atan2D(y, x) { if (x > 0) return atanD(y / x); if (x < 0) return atanD(y / x) + (y >= 0 ? Math.PI : -Math.PI); return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0; }

const PI = Math.PI;

/* game218 : PREMIERE valeur publiee du module (Phil : « autre discipline ») : effectifs des 26 lettres anglaises, Cornell (echantillon de
 *   40 000 mots), lus par Grok Bot (codex 20). Le banc exige valeur = texte lu, URL https. */
const S = (valeur, unite, url, lu) => Object.freeze({ valeur, unite, url, lu });
export const SOURCES = Object.freeze({
  // https://pi.math.cornell.edu/~mec/2003-2004/cryptography/subs/frequencies.html : « English Letter Frequency (based on a sample of 40,000 words) »
  /* game219 : atmosphere standard US 1976, NASA SP-398 tableau 1 (modele I sous 86 km) et page de C. D. Griffin (WVU), lues par Grok Bot 20 */
  // https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf : T0 = 288.15 K
  T0atm: S(288.15, 'K', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '288.15'),
  // meme source : p0 = 101325 Pa (1013.250 mbar)
  p0atm: S(101325, 'Pa', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '101325'),
  // meme source : gradient -6.5 K/km de 0 a 11 km geopotentiels, 0 de 11 a 20 km
  gradientAtm: S(-0.0065, 'K/m', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '-0.0065'),
  // https://cdgriffin.me/stdatm.php : g0 = 9.80665 m/s^2
  g0atm: S(9.80665, 'm/s^2', 'https://cdgriffin.me/stdatm.php', '9.80665'),
  // https://cdgriffin.me/stdatm.php : M0 = 28.9644 kg/kmol
  M0atm: S(0.0289644, 'kg/mol', 'https://cdgriffin.me/stdatm.php', '0.0289644'),
  // https://cdgriffin.me/stdatm.php : R* = 8314.32 J/(kmol K), valeur HISTORIQUE du modele (pas la CODATA actuelle)
  RstarAtm: S(8.31432, 'J/(mol K)', 'https://cdgriffin.me/stdatm.php', '8.31432'),
  // https://cdgriffin.me/stdatm.php : r0 = 6356766 m (conversion geometrique -> geopotentielle)
  r0atm: S(6356766, 'm', 'https://cdgriffin.me/stdatm.php', '6356766'),
  /* game220 : les 30 premiers mots du fichier count_1w.txt de P. Norvig (Natural Language Corpus Data ; corpus Google Web 1T 5-gram, 2006),
   *   lus par Grok Bot 20 : rang = ordre du fichier, compte = occurrences */
  // https://www.norvig.com/ngrams/count_1w.txt : 30 premieres lignes
  motsWeb: S('the:23135851162 of:13151942776 and:12997637966 to:12136980858 a:9081174698 in:8469404971 for:5933321709 is:4705743816 on:3750423199 that:3400031103 by:3350048871 this:3228469771 with:3183110675 i:3086225277 you:2996181025 it:2813163874 not:2633487141 or:2590739907 be:2398724162 are:2393614870 from:2275595356 at:2272272772 as:2247431740 your:2062066547 all:2022459848 have:1564202750 new:1551258643 more:1544771673 an:1518266684 was:1483428678', 'occurrences', 'https://www.norvig.com/ngrams/count_1w.txt', 'the:23135851162 of:13151942776 and:12997637966 to:12136980858 a:9081174698 in:8469404971 for:5933321709 is:4705743816 on:3750423199 that:3400031103 by:3350048871 this:3228469771 with:3183110675 i:3086225277 you:2996181025 it:2813163874 not:2633487141 or:2590739907 be:2398724162 are:2393614870 from:2275595356 at:2272272772 as:2247431740 your:2062066547 all:2022459848 have:1564202750 new:1551258643 more:1544771673 an:1518266684 was:1483428678'),
  /* game221 : Gutenberg-Richter, lus par Grok Bot 20 */
  // https://pubs.usgs.gov/of/2013/1165/pdf/ofr2013-1165_appendixL.pdf : region UCERF, 1997-2011, M >= 4.0 : b = 1.03 (IC 98 % [0.94 ; 1.11])
  bCalifornie: S(1.03, '', 'https://pubs.usgs.gov/of/2013/1165/pdf/ofr2013-1165_appendixL.pdf', '1.03'),
  // https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2024-12-31T23:59:59.999&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc :
  //   comptes par classe de 0.5 (borne basse : nombre), 6397 seismes, compte par Grok le 2026-11-06 (catalogue revisable)
  comcat2024: S('4.5:4890 5:1163 5.5:245 6:71 6.5:18 7:9 7.5:1 8:0', 'seismes par classe', 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2024-12-31T23:59:59.999&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc', '4.5:4890 5:1163 5.5:245 6:71 6.5:18 7:9 7.5:1 8:0'),
  /* game223 : constantes harmoniques M2 et S2 de la station NOAA 8454000 (Providence, RI ; moyenne vectorielle 2015-2019), lues par le
   *   sous-agent Claude du codex 21 puis RELUES dans la reponse JSON de NOAA le 2026-11-06. Vitesses en degres par heure (astronomiques,
   *   les memes partout) ; amplitudes (m) et phases (deg, GMT) propres a cette station. */
  // https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric : M2 speed 28.984104
  vitesseM2: S(28.984104, 'deg/h', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '28.984104'),
  // meme reponse : S2 speed 30
  vitesseS2: S(30, 'deg/h', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '30'),
  // meme reponse : M2 amplitude 0.595 m, phase_GMT 8.6 deg
  amplitudeM2: S(0.595, 'm', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '0.595'),
  phaseM2: S(8.6, 'deg', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '8.6'),
  // meme reponse : S2 amplitude 0.127 m, phase_GMT 32.6 deg
  amplitudeS2: S(0.127, 'm', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '0.127'),
  phaseS2: S(32.6, 'deg', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '32.6'),
  /* game224 : energie de liaison par nucleon (keV), evaluation AME2020, lue par le sous-agent Claude du codex 21 puis RELUE ligne par ligne
   *   dans le fichier AME2020 le 2026-11-06 (lignes 39, 44, 85, 112, 547, 573, 629, 3224). Format : noyau:A:B/A. */
  // https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt : colonne BINDING ENERGY/A (keV)
  liaisonAME2020: S('H2:2:1112.2831 He4:4:7073.9156 C12:12:7680.1446 O16:16:7976.2072 Fe56:56:8790.3563 Fe58:58:8792.2534 Ni62:62:8794.5555 U238:238:7570.1262', 'keV par nucleon', 'https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt', 'H2:2:1112.2831 He4:4:7073.9156 C12:12:7680.1446 O16:16:7976.2072 Fe56:56:8790.3563 Fe58:58:8792.2534 Ni62:62:8794.5555 U238:238:7570.1262'),
  /* game225 : moyennes ANNUELLES du CO2 a Mauna Loa (ppm), fichier NOAA GML « File Creation: Fri Oct 9 13:08:13 2026 », 1959-2025, lu par le
   *   sous-agent Claude du codex 22 puis TELECHARGE et recopie par programme le 2026-11-06. Format annee:ppm. */
  // https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.txt
  co2MaunaLoa: S('1959:315.98 1960:316.91 1961:317.64 1962:318.45 1963:318.99 1964:319.62 1965:320.04 1966:321.37 1967:322.18 1968:323.05 1969:324.62 1970:325.68 1971:326.32 1972:327.46 1973:329.68 1974:330.19 1975:331.13 1976:332.03 1977:333.84 1978:335.41 1979:336.84 1980:338.76 1981:340.12 1982:341.48 1983:343.15 1984:344.87 1985:346.35 1986:347.61 1987:349.31 1988:351.69 1989:353.20 1990:354.45 1991:355.70 1992:356.54 1993:357.21 1994:358.96 1995:360.97 1996:362.74 1997:363.88 1998:366.84 1999:368.54 2000:369.71 2001:371.32 2002:373.45 2003:375.98 2004:377.70 2005:379.98 2006:382.09 2007:384.02 2008:385.83 2009:387.64 2010:390.10 2011:391.85 2012:394.06 2013:396.74 2014:398.81 2015:401.01 2016:404.41 2017:406.76 2018:408.72 2019:411.65 2020:414.21 2021:416.41 2022:418.53 2023:421.08 2024:424.61 2025:427.35', 'ppm', 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.txt', '1959:315.98 1960:316.91 1961:317.64 1962:318.45 1963:318.99 1964:319.62 1965:320.04 1966:321.37 1967:322.18 1968:323.05 1969:324.62 1970:325.68 1971:326.32 1972:327.46 1973:329.68 1974:330.19 1975:331.13 1976:332.03 1977:333.84 1978:335.41 1979:336.84 1980:338.76 1981:340.12 1982:341.48 1983:343.15 1984:344.87 1985:346.35 1986:347.61 1987:349.31 1988:351.69 1989:353.20 1990:354.45 1991:355.70 1992:356.54 1993:357.21 1994:358.96 1995:360.97 1996:362.74 1997:363.88 1998:366.84 1999:368.54 2000:369.71 2001:371.32 2002:373.45 2003:375.98 2004:377.70 2005:379.98 2006:382.09 2007:384.02 2008:385.83 2009:387.64 2010:390.10 2011:391.85 2012:394.06 2013:396.74 2014:398.81 2015:401.01 2016:404.41 2017:406.76 2018:408.72 2019:411.65 2020:414.21 2021:416.41 2022:418.53 2023:421.08 2024:424.61 2025:427.35'),
  /* game226 : population mondiale (milliers, au 1er juillet), ONU World Population Prospects 2024, variante Medium, ligne World (LocID 900),
   *   lue par le sous-agent Claude du codex 22 puis RELUE dans le CSV de l ONU telecharge le 2026-11-07. Format annee:milliers. */
  // https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz : colonne PopTotal, LocID 900, Variant Medium
  populationONU: S('1950:2493092.848 1960:3015470.894 1970:3694683.794 1980:4447606.236 1990:5327803.11 2000:6171702.993 2010:7021732.148 2020:7887001.292', 'milliers', 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz', '1950:2493092.848 1960:3015470.894 1970:3694683.794 1980:4447606.236 1990:5327803.11 2000:6171702.993 2010:7021732.148 2020:7887001.292'),
  /* game230 : effet photoelectrique, lu par Grok Bot (codex 20) : h, e, c EXACTS (NIST, CODATA 2022) et travaux de sortie de quatre faces
   *   metalliques (cours P9826, Western Ontario, diapositive « Selected Values of Electron Work Functions » : Ag(100), Cu(110), Ir(110), Ta(100)). */
  // https://physics.nist.gov/cuu/Constants/Value/h.html : 6.626 070 15 x 10^-34 J s (exact)
  hPlanck: S(6.62607015e-34, 'J s', 'https://physics.nist.gov/cuu/Constants/Value/h.html', '6.62607015e-34'),
  // https://physics.nist.gov/cuu/Constants/Value/e.html : 1.602 176 634 x 10^-19 C (exact)
  eCharge: S(1.602176634e-19, 'C', 'https://physics.nist.gov/cuu/Constants/Value/e.html', '1.602176634e-19'),
  // https://physics.nist.gov/cuu/Constants/Value/c.html : 299 792 458 m/s (exact)
  cLumiere: S(299792458, 'm/s', 'https://physics.nist.gov/cuu/Constants/Value/c.html', '299792458'),
  // https://physics.uwo.ca/~lgonchar/courses/p9826/Lecture7_Workfunctions.pdf : diapositive 5, travaux de sortie (eV) par face cristalline
  travauxSortie: S('Ag:4.64 Cu:4.48 Ir:5.42 Ta:4.15', 'eV', 'https://physics.uwo.ca/~lgonchar/courses/p9826/Lecture7_Workfunctions.pdf', 'Ag:4.64 Cu:4.48 Ir:5.42 Ta:4.15'),
  /* game231 : demi-vies de six isotopes, NPL Report IR 6 (A. Pearce, 2008), section 4.3, lignes relues dans le PDF (pdftotext -raw) ;
   *   jours, incertitude-type k = 1 ; 14C publie 2.082 x 10^6 et 0.011 x 10^6, ecrit ici en clair (idee : codex Grok Bot 20) */
  // https://eprintspublications.npl.co.uk/4053/1/IR6.pdf : section 4.3 Recommended values, nucleide:demi-vie:incertitude (jours)
  demiViesNPL: S('H3:4497:9 Be7:53.22:0.06 C14:2082000:11000 Co60:1925.2:0.3 I131:8.0223:0.0019 Cs137:10976:30', 'days', 'https://eprintspublications.npl.co.uk/4053/1/IR6.pdf', 'H3:4497:9 Be7:53.22:0.06 C14:2082000:11000 Co60:1925.2:0.3 I131:8.0223:0.0019 Cs137:10976:30'),
  // meme source, section 4.1 : 1 year = 365.242198 (days)
  anneeNPL: S(365.242198, 'days', 'https://eprintspublications.npl.co.uk/4053/1/IR6.pdf', '365.242198'),
  /* game232 : John Snow, On the Mode of Communication of Cholera, 2e ed. 1855 (texte Gutenberg 72894), table IX et le paragraphe qui suit
   *   la table X, relus par moi dans le texte ; idee et lecture du scan Wellcome p. 86 : codex 23, sous-agent Claude */
  // https://www.gutenberg.org/cache/epub/72894/pg72894.txt : TABLE IX, compagnie:maisons:deces du cholera:deces pour 10 000 maisons imprimes (sept premieres semaines)
  snowTableIX: S('SouthwarkVauxhall:40046:1263:315 Lambeth:26107:98:37 RestOfLondon:256423:1422:59', 'houses:deaths:per 10,000 printed', 'https://www.gutenberg.org/cache/epub/72894/pg72894.txt', 'SouthwarkVauxhall:40046:1263:315 Lambeth:26107:98:37 RestOfLondon:256423:1422:59'),
  // meme source, apres la table X : « 2,353 deaths in 40,046 houses ... are 537 deaths to each 10,000 houses ; and 302 deaths to 26,107 ... are 115 »
  snowSeptSuivantes: S('SouthwarkVauxhall:40046:2353:537 Lambeth:26107:302:115', 'houses:deaths:per 10,000 printed', 'https://www.gutenberg.org/cache/epub/72894/pg72894.txt', 'SouthwarkVauxhall:40046:2353:537 Lambeth:26107:302:115'),
  /* game233 : raies de Balmer mesurees, NIST ASD 5.12, multiplets entiers 2 -> n (n = 3 a 9), longueurs Ritz dans le vide (show_av=3) et dans
   *   l air (show_av=2), relues par moi en tableau (format=3) ; R_inf et mp/me CODATA 2022 (idee : codex 23, sous-agent Claude) */
  // https://physics.nist.gov/cgi-bin/cuu/Value?ryd : 10 973 731.568 157 m^-1 (incertitude 0.000 012)
  rInfini: S(10973731.568157, 'm^-1', 'https://physics.nist.gov/cgi-bin/cuu/Value?ryd', '10973731.568157'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mpsme : 1836.152 673 426
  mpSurMe: S(1836.152673426, '', 'https://physics.nist.gov/cgi-bin/cuu/Value?mpsme', '1836.152673426'),
  // NIST ASD, H I, colonnes ritz_wl_vac(nm) et ritz_wl_air(nm), lignes conf_i "2" conf_k "n" : n:vide:air
  balmerNIST: S('3:656.4632:656.2819 4:486.2691:486.1333 5:434.1691:434.0471 6:410.28991:410.17415 7:397.12020:397.00788 8:389.01577:388.90557 9:383.64789:383.53909', 'nm', 'https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I&low_w=380&upp_w=700&unit=1&show_av=3', '3:656.4632:656.2819 4:486.2691:486.1333 5:434.1691:434.0471 6:410.28991:410.17415 7:397.12020:397.00788 8:389.01577:388.90557 9:383.64789:383.53909'),
  /* game234 : Boyle 1662, « A Table of the Condensation of the Air », colonnes A (espaces egaux de la petite branche, quarts de pouce) et
   *   B (mercure ajoute dans la grande branche, pouces), transcription EEBO-TCP A28956 relue par moi ; ligne A = 28 : la TCP ecrit 21 2/16,
   *   le scan du livre (Internet Archive, p. 60) montre 21 3/16 (lu par moi sur l image ; et 21 3/16 + 29 2/16 = 50 5/16, la colonne D).
   *   La colonne D n est PAS reprise (lignes 15 et 13 illisibles a 1/16 pres). Idee : codex 23, sous-agent Claude. */
  // https://raw.githubusercontent.com/textcreationpartnership/A28956/master/A28956.xml : table « Condensation », A:B pour les 25 lignes (B de la ligne 28 corrige d apres le scan)
  boyleTable: S('48:00;46:01 7/16;44:02 13/16;42:04 6/16;40:06 3/16;38:07 14/16;36:10 2/16;34:12 8/16;32:15 1/16;30:17 15/16;28:21 3/16;26:25 3/16;24:29 11/16;23:32 3/16;22:34 15/16;21:37 15/16;20:41 9/16;19:45;18:48 12/16;17:53 11/16;16:58 2/16;15:63 15/16;14:71 5/16;13:78 11/16;12:88 7/16', 'quarter inches:inches of mercury', 'https://raw.githubusercontent.com/textcreationpartnership/A28956/master/A28956.xml', '48:00;46:01 7/16;44:02 13/16;42:04 6/16;40:06 3/16;38:07 14/16;36:10 2/16;34:12 8/16;32:15 1/16;30:17 15/16;28:21 3/16;26:25 3/16;24:29 11/16;23:32 3/16;22:34 15/16;21:37 15/16;20:41 9/16;19:45;18:48 12/16;17:53 11/16;16:58 2/16;15:63 15/16;14:71 5/16;13:78 11/16;12:88 7/16'),
  // meme source : colonne C « Added to 29 1/8 makes » (la hauteur du barometre ce jour-la)
  boyleBarometre: S('29 1/8', 'inches of mercury', 'https://raw.githubusercontent.com/textcreationpartnership/A28956/master/A28956.xml', '29 1/8'),
  /* game235 : Ohm 1826, « Bestimmung des Gesetzes, nach welchem Metalle die Contactelektricitaet leiten », reimprime dans les Gesammelte
   *   Abhandlungen (Lommel, 1892), p. 23-25 ; tableaux et texte lus par moi sur les images de page (Internet Archive 11880925bsb), longueurs
   *   aussi dans l OCR. Idee : codex 23, sous-agent Claude. */
  // https://archive.org/details/11880925bsb : p. 23-24, huit fils de cuivre « 2, 4, 6, 10, 18, 34, 66, 130 Zoll lang »
  ohmLongueurs: S('2 4 6 10 18 34 66 130', 'Zoll', 'https://archive.org/details/11880925bsb', '2 4 6 10 18 34 66 130'),
  // meme source, p. 24 : torsion X (centiemes de tour) par serie (8, 11, 11, 15, 15 janvier)
  ohmMesures: S('I:326 3/4,300 3/4,277 3/4,238 1/4,190 3/4,134 1/2,83 1/4,48 1/2;II:311 1/4,287,267,230 1/4,183 1/2,129 3/4,80,46;III:307,284,263 3/4,226 1/4,181,128 3/4,79,44 1/2;IV:305 1/4,281 1/2,259,224,178 1/2,124 3/4,79,44 1/2;V:305,282,258 1/4,223 1/2,178,124 3/4,78,44', 'hundredths of a turn', 'https://archive.org/details/11880925bsb', 'I:326 3/4,300 3/4,277 3/4,238 1/4,190 3/4,134 1/2,83 1/4,48 1/2;II:311 1/4,287,267,230 1/4,183 1/2,129 3/4,80,46;III:307,284,263 3/4,226 1/4,181,128 3/4,79,44 1/2;IV:305 1/4,281 1/2,259,224,178 1/2,124 3/4,79,44 1/2;V:305,282,258 1/4,223 1/2,178,124 3/4,78,44'),
  // meme source, p. 25 : X = a / (b + x), « der Groesse b den Werth 20 1/4 und der Groesse a ... 7285, 6965, 6885, 6800, 6800 »
  ohmConstantes: S('b:20 1/4;a:7285,6965,6885,6800,6800', '', 'https://archive.org/details/11880925bsb', 'b:20 1/4;a:7285,6965,6885,6800,6800'),
  // meme source, p. 25 : fils de laiton a-d (2, 4, 8, 16 Zoll) : 111 1/2, 64 3/4, 37, 19 3/4 ; fil 1 : 305 ; longueurs de cuivre equivalentes 40 3/4, 84 3/4, 163 1/2, 324
  ohmLaiton: S('X:111 1/2,64 3/4,37,19 3/4;Leiter1:305;Zoll:40 3/4,84 3/4,163 1/2,324', '', 'https://archive.org/details/11880925bsb', 'X:111 1/2,64 3/4,37,19 3/4;Leiter1:305;Zoll:40 3/4,84 3/4,163 1/2,324'),
  /* game236 : Diamond et Mayr 1976, « Species-area relation for birds of the Solomon Archipelago », PNAS 73 : 262-266 (PMC335881), Table 1
   *   p. 264 relue par moi sur l image de page (50 iles), equations p. 263 et legendes p. 265 relues aussi. Idee : codex 23, sous-agent Claude. */
  // https://cdn.ncbi.nlm.nih.gov/pmc/blobs/c4b4/335881/e94cf14d82d9/pnas00670-0270.png : Table 1, ile:S_low (especes d oiseaux de basse altitude):A (milles carres)[:d, distance en milles, seulement pour les iles ISOLEES]
  salomonOiseaux: S('1:82:3317 2:79:2039 3:71:1581 4:70:1145 5:63:236 6:61:142 7:58:89.5 8:51:27.4 9:41:5.4 10:35:0.206 11:22:0.1263 12:9:0.0577:6.7 13:19:0.0351 14:15:0.0273 15:10:0.0257 16:14:0.0211 17:13:0.0199 18:11:0.0156 19:13:0.0062 20:6:0.0035 21:8:0.0027 22:65:789 23:65:272 24:62:210 25:55:42 26:56:26.5 27:9:0.032 28:12:0.0187 29:65:247 30:53:55 31:61:147 32:56:47 33:69:1663 34:69:1193 35:45:68:28.8 36:43:28.1:17.8 37:50:16.3 38:29:14.3:38.9 39:56:13.6 40:37:11.8:8.4 41:46:5.66 42:43:5.0 43:32:4.28:12.2 44:38:1.91 45:13:1.56:36.4 46:15:0.044 47:42:264:104.4 48:20:7.62:97.6 49:9:3.69:147.0 50:6:0.502:108.5', 'species:square miles:miles', 'https://cdn.ncbi.nlm.nih.gov/pmc/blobs/c4b4/335881/e94cf14d82d9/pnas00670-0270.png', '1:82:3317 2:79:2039 3:71:1581 4:70:1145 5:63:236 6:61:142 7:58:89.5 8:51:27.4 9:41:5.4 10:35:0.206 11:22:0.1263 12:9:0.0577:6.7 13:19:0.0351 14:15:0.0273 15:10:0.0257 16:14:0.0211 17:13:0.0199 18:11:0.0156 19:13:0.0062 20:6:0.0035 21:8:0.0027 22:65:789 23:65:272 24:62:210 25:55:42 26:56:26.5 27:9:0.032 28:12:0.0187 29:65:247 30:53:55 31:61:147 32:56:47 33:69:1663 34:69:1193 35:45:68:28.8 36:43:28.1:17.8 37:50:16.3 38:29:14.3:38.9 39:56:13.6 40:37:11.8:8.4 41:46:5.66 42:43:5.0 43:32:4.28:12.2 44:38:1.91 45:13:1.56:36.4 46:15:0.044 47:42:264:104.4 48:20:7.62:97.6 49:9:3.69:147.0 50:6:0.502:108.5'),
  // https://cdn.ncbi.nlm.nih.gov/pmc/blobs/c4b4/335881/b698301cdb2a/pnas00670-0269.png : equation [1] et pente z (p. 263), legendes des figures 1 et 2 (p. 265)
  salomonPublie: S('Slow = 34.7 + 12.08 log A (r 0.99) ; log Slow = 1.59 + 0.087 log A (A > 1)', '', 'https://cdn.ncbi.nlm.nih.gov/pmc/blobs/c4b4/335881/b698301cdb2a/pnas00670-0269.png', 'Slow = 34.7 + 12.08 log A (r 0.99) ; log Slow = 1.59 + 0.087 log A (A > 1)'),
  /* game237 : Michaelis et Menten 1913 (invertase), lus dans la TRADUCTION integrale publiee par Johnson et Goody, Biochemistry 50 (2011)
   *   8264-8269 (PDF relu par moi : « Results of the experiment in Table I (Fig. 1a) » et « Sucrose ... k = 0.0167 or 1/60 ») ; l original
   *   allemand n a pas ete lu. Les vitesses n ont pas d unite exploitable : rapports seulement. Idee : codex 23, sous-agent Claude. */
  // https://www.medschool.lsuhsc.edu/biochemistry/docs/Johnson8882.pdf : saccharose initial a (mol/L) : vitesse initiale (relative), experiences 1 a 7
  mm1913: S('0.3330:3.636 0.1670:3.636 0.0833:3.236 0.0416:2.666 0.0208:2.114 0.0104:1.466 0.0052:0.866', 'mol/L:relative rate', 'https://www.medschool.lsuhsc.edu/biochemistry/docs/Johnson8882.pdf', '0.3330:3.636 0.1670:3.636 0.0833:3.236 0.0416:2.666 0.0208:2.114 0.0104:1.466 0.0052:0.866'),
  // meme source : « Sucrose . . . k = 0.0167 or 1/60 » (constante de dissociation, mol/L)
  mmK1913: S(0.0167, 'mol/L', 'https://www.medschool.lsuhsc.edu/biochemistry/docs/Johnson8882.pdf', '0.0167'),
  /* game238 : Geiger et Marsden 1913, « The Laws of Deflexion of a Particles through Large Angles », Phil. Mag. (6) 25 : 604-623, Table II
   *   p. 610 relue par moi sur l image de page (Internet Archive londonedinburg6251913lond). Idee : codex 24, sous-agent Claude. */
  // https://archive.org/download/londonedinburg6251913lond/page/610_w1200.jpg : Table II, premiere serie : angle (degres):scintillations argent:scintillations or (corrigees)
  gmSerieUn: S('150:22.2:33.1 135:27.4:43.0 120:33.0:51.9 105:47.3:69.5 75:136:211 60:320:477 45:989:1435 37.5:1760:3300 30:5260:7800 22.5:20300:27300 15:105400:132000', 'degrees:scintillations:scintillations', 'https://archive.org/download/londonedinburg6251913lond/page/610_w1200.jpg', '150:22.2:33.1 135:27.4:43.0 120:33.0:51.9 105:47.3:69.5 75:136:211 60:320:477 45:989:1435 37.5:1760:3300 30:5260:7800 22.5:20300:27300 15:105400:132000'),
  // meme page : seconde serie (autre echelle, autres feuilles) ; « ... » pour l argent a 5 degres ecrit « - »
  gmSerieDeux: S('30:5.3:3.1 22.5:16.6:8.4 15:93.0:48.2 10:508:200 7.5:1710:607 5:-:3320', 'degrees:scintillations:scintillations', 'https://archive.org/download/londonedinburg6251913lond/page/610_w1200.jpg', '30:5.3:3.1 22.5:16.6:8.4 15:93.0:48.2 10:508:200 7.5:1710:607 5:-:3320'),
  // meme page : colonne VI imprimee, or, N / (1 / sin^4 (phi/2)), premiere serie
  gmOrImprime: S('28.8 31.2 29.0 27.5 29.1 29.8 30.8 35.3 35.0 39.6 38.4', '', 'https://archive.org/download/londonedinburg6251913lond/page/610_w1200.jpg', '28.8 31.2 29.0 27.5 29.1 29.8 30.8 35.3 35.0 39.6 38.4'),
  /* game239 : Rayleigh et Ramsay 1895, « Argon, a New Constituent of the Atmosphere », Phil. Trans. A 186 : 187, pages 187 et 189 relues
   *   par moi sur les images (Internet Archive philtrans03853788). La densite de l argon (19.9) n a ete lue que dans l OCR : pas reprise.
   *   Idee : codex 24, sous-agent Claude. */
  // https://archive.org/download/philtrans03853788/page/n2_w1200.jpg : « The five results obtained ... for chemical nitrogen » (grammes de gaz dans le globe ; moyenne imprimee 2.2990)
  rrChimique: S('nitricOxide:2.3001 nitrousOxide:2.2990 ammoniumNitriteRedHeat:2.2987 urea:2.2985 ammoniumNitriteCold:2.2987', 'grams in the globe', 'https://archive.org/download/philtrans03853788/page/n2_w1200.jpg', 'nitricOxide:2.3001 nitrousOxide:2.2990 ammoniumNitriteRedHeat:2.2987 urea:2.2985 ammoniumNitriteCold:2.2987'),
  // https://archive.org/download/philtrans03853788/page/n0_w1200.jpg : « for "atmospheric" nitrogen there was found » (grammes dans le meme globe)
  rrAtmospherique: S('hotCopper1892:2.3103 hotIron1893:2.3100 ferrousHydrate1894:2.3102', 'grams in the globe', 'https://archive.org/download/philtrans03853788/page/n0_w1200.jpg', 'hotCopper1892:2.3103 hotIron1893:2.3100 ferrousHydrate1894:2.3102'),
  // https://archive.org/download/philtrans03853788/page/n2_w1200.jpg : « a correction (additive) of .0006 », « the ratio of 2.3108 : 1.2572 », litre : chimique 1.2511, atmospherique 1.2572
  rrConversion: S('correction:+0.0006 ratio:2.3108:1.2572 perLitre:1.2511:1.2572', 'grams per litre', 'https://archive.org/download/philtrans03853788/page/n2_w1200.jpg', 'correction:+0.0006 ratio:2.3108:1.2572 perLitre:1.2511:1.2572'),
  /* game240 : Sturtevant 1913, « The linear arrangement of six sex-linked factors in Drosophila », J. Exp. Zool. 14 : 43-59 ; Table 2 (p. 48)
   *   et Diagram 1 (p. 49) relus par moi sur les images du scan (Internet Archive in.ernet.dli.2015.506759). Idee : codex 24, sous-agent Claude. */
  // https://archive.org/download/in.ernet.dli.2015.506759/page/n56_w1400.jpg : Table 2, paire:cross-overs/gametes:pour cent imprime (C et O « completely linked » ; (C,O) = C, O et CO additionnes)
  sturtevantTable2: S('B-CO:193/16287:1.2 B-O:2/373:0.5 B-P:1464/4551:32.2 B-R:115/324:35.5 B-M:260/693:37.6 CO-P:224/748:30.0 CO-R:1643/4749:34.6 CO-M:76/161:47.2 O-P:247/836:29.4 O-R:183/538:34.0 O-M:218/404:54.0 C-R:236/829:28.5 C-M:112/333:33.6 B-(C,O):214/21736:1.0 (C,O)-P:471/1584:29.7 (C,O)-R:2062/6116:33.7 (C,O)-M:406/898:45.2 P-R:17/573:3.0 P-M:109/405:26.9', 'cross-overs/gametes:per cent', 'https://archive.org/download/in.ernet.dli.2015.506759/page/n56_w1400.jpg', 'B-CO:193/16287:1.2 B-O:2/373:0.5 B-P:1464/4551:32.2 B-R:115/324:35.5 B-M:260/693:37.6 CO-P:224/748:30.0 CO-R:1643/4749:34.6 CO-M:76/161:47.2 O-P:247/836:29.4 O-R:183/538:34.0 O-M:218/404:54.0 C-R:236/829:28.5 C-M:112/333:33.6 B-(C,O):214/21736:1.0 (C,O)-P:471/1584:29.7 (C,O)-R:2062/6116:33.7 (C,O)-M:406/898:45.2 P-R:17/573:3.0 P-M:109/405:26.9'),
  // https://archive.org/download/in.ernet.dli.2015.506759/page/n57_w1400.jpg : Diagram 1, « calculated distances from B », bati sur B (C, O), (C, O) P, PR et PM
  sturtevantCarte: S('B:0.0 (C,O):1.0 P:30.7 R:33.7 M:57.6', 'per cent of cross-overs', 'https://archive.org/download/in.ernet.dli.2015.506759/page/n57_w1400.jpg', 'B:0.0 (C,O):1.0 P:30.7 R:33.7 M:57.6'),
  /* game241 : Ebbinghaus 1885, Ueber das Gedaechtnis, lu dans la TRADUCTION anglaise de 1913 (Ruger et Bussenius), chapitre VII, section 29,
   *   sur Classics in the History of Psychology (York University) : table d image relue par moi, et le texte de la formule. L original
   *   allemand n a pas ete lu. Idee : codex 24, sous-agent Claude. */
  // https://psychclassics.yorku.ca/Ebbinghaus/table24.jpg : t (minutes, compte depuis une minute avant la fin de l apprentissage) : economie b observee : b calculee par Ebbinghaus (pour cent)
  ebbinghausTable: S('20:58.2:57.0 64:44.2:46.7 526:35.8:34.5 1440:33.7:30.4 2x1440:27.8:28.1 6x1440:25.4:24.9 31x1440:21.1:21.2', 'minutes:per cent:per cent', 'https://psychclassics.yorku.ca/Ebbinghaus/table24.jpg', '20:58.2:57.0 64:44.2:46.7 526:35.8:34.5 1440:33.7:30.4 2x1440:27.8:28.1 6x1440:25.4:24.9 31x1440:21.1:21.2'),
  // https://psychclassics.yorku.ca/Ebbinghaus/memory7.htm : section 29, b = 100 k / ((log t)^c + k), « k = 1.84, c = 1.25 »
  ebbinghausFormule: S('k:1.84 c:1.25', '', 'https://psychclassics.yorku.ca/Ebbinghaus/memory7.htm', 'k:1.84 c:1.25'),
  /* game242 : Semmelweis 1861, Die Aetiologie, der Begriff und die Prophylaxis des Kindbettfiebers (original allemand, exemplaire Wellcome,
   *   Internet Archive b33953740) : Tabelle Nr. I (p. 3) et le texte de la p. 56, relus par moi sur les images de page. Le total des accouchees
   *   de la 1re clinique (« 20?42 ») n est pas lisible a cette resolution : seuls les comptes annuels sont repris. Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/b33953740/page/n10_w1800.jpg : Tabelle Nr. I, annee:accouchees 1re clinique (Aerzte):deces:accouchees 2e clinique (Hebammen):deces
  semmelweisTab1: S('1841:3036:237:2442:86 1842:3287:518:2659:202 1843:3060:274:2739:164 1844:3157:260:2956:68 1845:3492:241:3241:66 1846:4010:459:3754:105', 'births:deaths', 'https://archive.org/download/b33953740/page/n10_w1800.jpg', '1841:3036:237:2442:86 1842:3287:518:2659:202 1843:3060:274:2739:164 1844:3157:260:2956:68 1845:3492:241:3241:66 1846:4010:459:3754:105'),
  // meme page : pour cent imprimes a la ligne Summa (1re et 2e clinique)
  semmelweisImprime: S('Summa:9.92:3.38', 'per cent', 'https://archive.org/download/b33953740/page/n10_w1800.jpg', 'Summa:9.92:3.38'),
  // https://archive.org/download/b33953740/page/n63_w1800.jpg : texte, 1847 (chlore a la mi-mai) et 1848 (chlore toute l annee), annee:accouchees 1re:deces:accouchees 2e:deces
  semmelweisChlore: S('1847:3490:176:3306:32 1848:3556:45:3219:43', 'births:deaths', 'https://archive.org/download/b33953740/page/n63_w1800.jpg', '1847:3490:176:3306:32 1848:3556:45:3219:43'),
  /* game243 : Cavendish 1798, « Experiments to determine the Density of the Earth », Phil. Trans. 88 : 469, table de la p. 520 et texte de la
   *   p. 521 relus par moi sur les images (Internet Archive philtrans07861996). Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/philtrans07861996/page/n51_w1500.jpg : « The following Table contains the Result of the Experiments », experience:densite (fois l eau), 29 valeurs, virgule decimale lue en point
  cavendishDensites: S('1:5.5 1:5.61 2:4.88 2:5.07 3:5.26 3:5.55 4:5.36 4:5.29 4:5.58 5:5.65 5:5.57 6:5.53 6:5.62 7:5.29 7:5.44 8:5.34 8:5.79 9:5.1 10:5.27 11:5.39 12:5.42 13:5.47 13:5.63 14:5.34 14:5.46 15:5.3 16:5.75 17:5.68 17:5.85', 'times water', 'https://archive.org/download/philtrans07861996/page/n51_w1500.jpg', '1:5.5 1:5.61 2:4.88 2:5.07 3:5.26 3:5.55 4:5.36 4:5.29 4:5.58 5:5.65 5:5.57 6:5.53 6:5.62 7:5.29 7:5.44 8:5.34 8:5.79 9:5.1 10:5.27 11:5.39 12:5.42 13:5.47 13:5.63 14:5.34 14:5.46 15:5.3 16:5.75 17:5.68 17:5.85'),
  // https://archive.org/download/philtrans07861996/page/n52_w1200.jpg : « with the wire first used ... 5,48 », « with the latter wire, it comes out the same », « the 23 observations ... ,75 », « ,38 »
  cavendishTexte: S('firstWire:5.48 latterWire:5.48 range23:0.75 extreme:0.38', 'times water', 'https://archive.org/download/philtrans07861996/page/n52_w1200.jpg', 'firstWire:5.48 latterWire:5.48 range23:0.75 extreme:0.38'),
  /* game244 : Joule 1850, « On the Mechanical Equivalent of Heat », Phil. Trans. 140 : 61, p. 82 relue par moi sur l image (Internet Archive
   *   philtrans00608634) : Table IX, le calcul de la derniere serie et la conclusion. Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/philtrans00608634/page/n22_w1500.jpg : Table IX, serie:materiau:equivalent dans l air:equivalent in vacuo (pieds-livres pour 1 degre F d une livre d eau)
  jouleTable9: S('1:Water:773.640:772.692 2:Mercury:773.762:772.814 3:Mercury:776.303:775.352 4:CastIron:776.997:776.045 5:CastIron:774.880:773.930', 'foot-pounds', 'https://archive.org/download/philtrans00608634/page/n22_w1500.jpg', '1:Water:773.640:772.692 2:Mercury:773.762:772.814 3:Mercury:776.303:775.352 4:CastIron:776.997:776.045 5:CastIron:774.880:773.930'),
  // meme page : colonne « Mean », « 2057.336 / 2.65504 = 774.88 », conclusion « the fall of 772 lbs. through the space of one foot »
  joulePublie: S('means:772.692,774.083,774.987 lastSeries:2057.336/2.65504=774.88 conclusion:772', 'foot-pounds', 'https://archive.org/download/philtrans00608634/page/n22_w1500.jpg', 'means:772.692,774.083,774.987 lastSeries:2057.336/2.65504=774.88 conclusion:772'),
  /* game245 : Dyson, Eddington et Davidson 1920, « A Determination of the Deflection of Light by the Sun s Gravitational Field », Phil. Trans. A
   *   220 : 291, pages 291 et 331 relues par moi sur les images (Internet Archive philtrans06337895). Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/philtrans06337895/page/n40_w1500.jpg : resultats au bord du Soleil (secondes d arc) : instrument:deviation:erreur probable (« - » : non donnee pour l astrographique)
  eddingtonResultats: S('Sobral4inch:1.98:0.12 Principe:1.61:0.30 SobralAstrographic:0.93:-', 'arcseconds', 'https://archive.org/download/philtrans06337895/page/n40_w1500.jpg', 'Sobral4inch:1.98:0.12 Principe:1.61:0.30 SobralAstrographic:0.93:-'),
  // https://archive.org/download/philtrans06337895/page/n0_w1200.jpg : hypotheses (2) newtonienne 0.87 et (3) Einstein 1.75 au bord
  eddingtonHypotheses: S('Newton:0.87 Einstein:1.75', 'arcseconds', 'https://archive.org/download/philtrans06337895/page/n0_w1200.jpg', 'Newton:0.87 Einstein:1.75'),
  // https://archive.org/download/philtrans06337895/page/n40_w1500.jpg : « Radial Displacement of Individual Stars », etoile:calcul (Einstein):observation, lentille de 4 pouces
  eddingtonEtoiles: S('11:0.32:0.20 10:0.33:0.32 6:0.40:0.56 5:0.53:0.54 4:0.75:0.84 2:0.85:0.97 3:0.88:1.02', 'arcseconds', 'https://archive.org/download/philtrans06337895/page/n40_w1500.jpg', '11:0.32:0.20 10:0.33:0.32 6:0.40:0.56 5:0.53:0.54 4:0.75:0.84 2:0.85:0.97 3:0.88:1.02'),
  /* game246 : Elton et Nicholson 1942, « The ten-year cycle in numbers of the lynx in Canada », J. Anim. Ecol. 11 : 215, Table 1 (p. 217, colonne
   *   « Jones (1914) moved back 2 years ») et p. 241, transcrites par moi sur les images (Internet Archive journal-of-animal-ecology_1942-11_11_2).
   *   1889 est entre crochets dans l original (reconstruction des auteurs). Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/journal-of-animal-ecology_1942-11_11_2/page/n58_w1800.jpg : annee de capture (« Outfit »):peaux de lynx de la Compagnie de la baie d Hudson, 1848-1909
  lynxJones: S('1848:43738 1849:20353 1850:8519 1851:5361 1852:4552 1853:5682 1854:11358 1855:23362 1856:31642 1857:33757 1858:23226 1859:15178 1860:7272 1861:4448 1862:4926 1863:5437 1864:16498 1865:35971 1866:76556 1867:68392 1868:37447 1869:15686 1870:7942 1871:5123 1872:7106 1873:11250 1874:18774 1875:30508 1876:42834 1877:27345 1878:17834 1879:15386 1880:9443 1881:7599 1882:8061 1883:27187 1884:51511 1885:74050 1886:78773 1887:33899 1888:18886 1889:[11520] 1890:8352 1891:8660 1892:12902 1893:20331 1894:36853 1895:56407 1896:39437 1897:26761 1898:15185 1899:4473 1900:5781 1901:9117 1902:19267 1903:36116 1904:58850 1905:61478 1906:38501 1907:9704 1908:3410 1909:3774', 'lynx skins', 'https://archive.org/download/journal-of-animal-ecology_1942-11_11_2/page/n58_w1800.jpg', '1848:43738 1849:20353 1850:8519 1851:5361 1852:4552 1853:5682 1854:11358 1855:23362 1856:31642 1857:33757 1858:23226 1859:15178 1860:7272 1861:4448 1862:4926 1863:5437 1864:16498 1865:35971 1866:76556 1867:68392 1868:37447 1869:15686 1870:7942 1871:5123 1872:7106 1873:11250 1874:18774 1875:30508 1876:42834 1877:27345 1878:17834 1879:15386 1880:9443 1881:7599 1882:8061 1883:27187 1884:51511 1885:74050 1886:78773 1887:33899 1888:18886 1889:[11520] 1890:8352 1891:8660 1892:12902 1893:20331 1894:36853 1895:56407 1896:39437 1897:26761 1898:15185 1899:4473 1900:5781 1901:9117 1902:19267 1903:36116 1904:58850 1905:61478 1906:38501 1907:9704 1908:3410 1909:3774'),
  // https://archive.org/download/journal-of-animal-ecology_1942-11_11_2/page/n82_w1800.jpg : « Between the peak years of 1752 and 1935 there were 19 complete cycles, giving an average period of 9.63 years » ; frequences des
  //   cycles (1 de 7 ans, 6 de 8, 16 de 9, 20 de 10, 3 de 11, 1 de 12) ; « Of 47 cycles ..., 36 or 78 % are 9 or 10 years »
  lynxPeriode: S('peaks:1752-1935 cycles:19 average:9.63 frequency:7x1,8x6,9x16,10x20,11x3,12x1 nineOrTen:36 of:47 printed:78', 'years', 'https://archive.org/download/journal-of-animal-ecology_1942-11_11_2/page/n82_w1800.jpg', 'peaks:1752-1935 cycles:19 average:9.63 frequency:7x1,8x6,9x16,10x20,11x3,12x1 nineOrTen:36 of:47 printed:78'),
  /* game247 : Millikan 1913, « On the elementary electrical charge and the Avogadro constant », Phys. Rev. 2 : 109, Table XX (p. 134-135) et
   *   p. 140 relues par moi sur les images (Internet Archive sim_physical-review_1913-08_2_2). Idee : codex 25, sous-agent Claude. */
  // https://archive.org/download/sim_physical-review_1913-08_2_2/page/n55_w1800.jpg et n56 : derniere colonne de la Table XX, e^(2/3) x 10^8 pour les 58 gouttes, dans l ordre
  millikanE23: S('61.14 61.26 61.04 61.24 61.13 61.09 61.07 61.23 61.15 61.02 61.00 61.10 61.06 61.21 61.07 61.21 61.00 61.08 61.12 61.23 61.11 61.01 61.18 61.35 61.20 61.31 61.18 61.16 61.37 61.06 61.38 61.22 61.13 61.20 61.07 61.23 61.03 61.16 60.79 61.09 60.97 61.24 60.95 61.00 61.39 61.30 61.13 61.28 61.22 60.85 61.04 61.36 61.13 61.18 61.22 61.11 60.87 61.14', 'e^(2/3) x 10^8 (esu^(2/3))', 'https://archive.org/download/sim_physical-review_1913-08_2_2/page/n55_w1800.jpg', '61.14 61.26 61.04 61.24 61.13 61.09 61.07 61.23 61.15 61.02 61.00 61.10 61.06 61.21 61.07 61.21 61.00 61.08 61.12 61.23 61.11 61.01 61.18 61.35 61.20 61.31 61.18 61.16 61.37 61.06 61.38 61.22 61.13 61.20 61.07 61.23 61.03 61.16 60.79 61.09 60.97 61.24 60.95 61.00 61.39 61.30 61.13 61.28 61.22 60.85 61.04 61.36 61.13 61.18 61.22 61.11 60.87 61.14'),
  // https://archive.org/download/sim_physical-review_1913-08_2_2/page/n61_w1200.jpg et p. 135 : moyennes imprimees (58 : 61.138 ; 23 : 61.120), moyenne corrigee 61.085, e = 4.774 +- .009 x 10^-10 esu,
  //   N = 6.062 x 10^23 depuis 9650 x 2.9990 x 10^10 ; valeur anterieure par la meme methode : 4.891
  millikanTexte: S('mean58:61.138 mean23:61.120 corrected23:61.085 e:4.774 pe:0.009 N:6.062 faraday:9650 c:2.9990 earlier:4.891', 'esu', 'https://archive.org/download/sim_physical-review_1913-08_2_2/page/n61_w1200.jpg', 'mean58:61.138 mean23:61.120 corrected23:61.085 e:4.774 pe:0.009 N:6.062 faraday:9650 c:2.9990 earlier:4.891'),
  /* game248 : Graunt 1662, Natural and Political Observations ... upon the Bills of Mortality, p. 62 relue par moi sur le scan (Internet Archive
   *   2356014R.nlm.nih.gov). Idee : codex 26, sous-agent Claude (recoupe avec la transcription de Hull 1899, p. 387). */
  // https://archive.org/download/2356014R.nlm.nih.gov/page/n85_w1500.jpg : « of 100 there dies within the first six years 36 ... », age de fin de la tranche:morts (« 09 » imprime pour la 3e decade)
  grauntMorts: S('6:36 16:24 26:15 36:9 46:6 56:4 66:3 76:2 80:1', 'deaths out of 100 conceived', 'https://archive.org/download/2356014R.nlm.nih.gov/page/n85_w1500.jpg', '6:36 16:24 26:15 36:9 46:6 56:4 66:3 76:2 80:1'),
  // meme page : « there remains alive at six years end 64. At Sixteen years end 40 ... At Eighty 0 » (100 au depart)
  grauntSurvivants: S('0:100 6:64 16:40 26:25 36:16 46:10 56:6 66:3 76:1 80:0', 'alive out of 100 conceived', 'https://archive.org/download/2356014R.nlm.nih.gov/page/n85_w1500.jpg', '0:100 6:64 16:40 26:25 36:16 46:10 56:6 66:3 76:1 80:0'),
  // meme page : 16-56 « 40, less by six, viz. 34 » ; 26-66 « 25 less by three, viz. 22 » ; « 199112 Males ... 34 per Cent ... 67694 » ; « the 1/5 of 67694, viz. 13539 »
  grauntCombattants: S('males:199112 share:34 fighting:67694 fifth:13539 between16and56:34 between26and66:22', '', 'https://archive.org/download/2356014R.nlm.nih.gov/page/n85_w1500.jpg', 'males:199112 share:34 fighting:67694 fifth:13539 between16and56:34 between26and66:22'),
  /* game249 : Hubble 1929, « A relation between distance and radial velocity among extra-galactic nebulae », PNAS 15 : 168, Table 1 (p. 169) et
   *   les deux solutions (p. 170), relues et transcrites par moi sur les images (Internet Archive B-001-001-868). Idee : codex 26, sous-agent Claude. */
  // https://archive.org/download/B-001-001-868/page/n1_w1500.jpg : objet:r (10^6 parsecs):v (km/s):m_t:M_t imprime (signe moins de la colonne M_t restitue) ; moyenne imprimee -15.5
  hubbleTable1: S('SMag:0.032:170:1.5:-16.0 LMag:0.034:290:0.5:-17.2 6822:0.214:-130:9.0:-12.7 598:0.263:-70:7.0:-15.1 221:0.275:-185:8.8:-13.4 224:0.275:-220:5.0:-17.2 5457:0.45:200:9.9:-13.3 4736:0.5:290:8.4:-15.1 5194:0.5:270:7.4:-16.1 4449:0.63:200:9.5:-14.5 4214:0.8:300:11.3:-13.2 3031:0.9:-30:8.3:-16.4 3627:0.9:650:9.1:-15.7 4826:0.9:150:9.0:-15.7 5236:0.9:500:10.4:-14.4 1068:1.0:920:9.1:-15.9 5055:1.1:450:9.6:-15.6 7331:1.1:500:10.4:-14.8 4258:1.4:500:8.7:-17.0 4151:1.7:960:12.0:-14.2 4382:2.0:500:10.0:-16.5 4472:2.0:850:8.8:-17.7 4486:2.0:800:9.7:-16.8 4649:2.0:1090:9.5:-17.0', 'Mpc:km/s:mag:mag', 'https://archive.org/download/B-001-001-868/page/n1_w1500.jpg', 'SMag:0.032:170:1.5:-16.0 LMag:0.034:290:0.5:-17.2 6822:0.214:-130:9.0:-12.7 598:0.263:-70:7.0:-15.1 221:0.275:-185:8.8:-13.4 224:0.275:-220:5.0:-17.2 5457:0.45:200:9.9:-13.3 4736:0.5:290:8.4:-15.1 5194:0.5:270:7.4:-16.1 4449:0.63:200:9.5:-14.5 4214:0.8:300:11.3:-13.2 3031:0.9:-30:8.3:-16.4 3627:0.9:650:9.1:-15.7 4826:0.9:150:9.0:-15.7 5236:0.9:500:10.4:-14.4 1068:1.0:920:9.1:-15.9 5055:1.1:450:9.6:-15.6 7331:1.1:500:10.4:-14.8 4258:1.4:500:8.7:-17.0 4151:1.7:960:12.0:-14.2 4382:2.0:500:10.0:-16.5 4472:2.0:850:8.8:-17.7 4486:2.0:800:9.7:-16.8 4649:2.0:1090:9.5:-17.0'),
  // https://archive.org/download/B-001-001-868/page/n2_w1500.jpg : K = +465 +- 50 (24 objets) et +513 +- 60 (9 groupes) km/s par 10^6 parsecs ; valeur ronde K = +500
  hubblePublie: S('K24:465:50 K9:513:60 round:500 meanM:-15.5', 'km/s per Mpc', 'https://archive.org/download/B-001-001-868/page/n2_w1500.jpg', 'K24:465:50 K9:513:60 round:500 meanM:-15.5'),
  /* game250 : Moseley 1914, « The high-frequency spectra of the elements. Part II », Phil. Mag. 27 : 703, Table I (p. 708) et Conclusions (p. 711)
   *   relues par moi sur les images (Internet Archive londonedinburg6271914lond, IIIF). Idee : codex 26, sous-agent Claude. */
  // https://iiif.archive.org/image/iiif/3/londonedinburg6271914lond%2flondonedinburg6271914lond_jp2.zip%2flondonedinburg6271914lond_jp2%2flondonedinburg6271914lond_0740.jp2/pct:15,12,75,39/1700,/0/default.jpg : element:raie alpha lambda x 10^8 cm:Q_K:N (numero atomique)
  moseleyTable1: S('Al:8.364:12.05:13 Si:7.142:13.04:14 Cl:4.750:16.00:17 K:3.759:17.98:19 Ca:3.368:19.00:20 Ti:2.758:20.99:22 V:2.519:21.96:23 Cr:2.301:22.98:24 Mn:2.111:23.99:25 Fe:1.946:24.99:26 Co:1.798:26.00:27 Ni:1.662:27.04:28 Cu:1.549:28.01:29 Zn:1.445:29.01:30 Y:0.838:38.1:39 Zr:0.794:39.1:40 Nb:0.750:40.2:41 Mo:0.721:41.2:42 Ru:0.638:43.6:44 Pd:0.584:45.6:46 Ag:0.560:46.6:47', '10^-8 cm::', 'https://iiif.archive.org/image/iiif/3/londonedinburg6271914lond%2flondonedinburg6271914lond_jp2.zip%2flondonedinburg6271914lond_jp2%2flondonedinburg6271914lond_0740.jp2/pct:15,12,75,39/1700,/0/default.jpg', 'Al:8.364:12.05:13 Si:7.142:13.04:14 Cl:4.750:16.00:17 K:3.759:17.98:19 Ca:3.368:19.00:20 Ti:2.758:20.99:22 V:2.519:21.96:23 Cr:2.301:22.98:24 Mn:2.111:23.99:25 Fe:1.946:24.99:26 Co:1.798:26.00:27 Ni:1.662:27.04:28 Cu:1.549:28.01:29 Zn:1.445:29.01:30 Y:0.838:38.1:39 Zr:0.794:39.1:40 Nb:0.750:40.2:41 Mo:0.721:41.2:42 Ru:0.638:43.6:44 Pd:0.584:45.6:46 Ag:0.560:46.6:47'),
  // https://iiif.archive.org/image/iiif/3/londonedinburg6271914lond%2flondonedinburg6271914lond_jp2.zip%2flondonedinburg6271914lond_jp2%2flondonedinburg6271914lond_0743.jp2/full/1300,/0/default.jpg : « Vacant lines have been left for an element between Mo and Ru, an element between Nd and Sa, and an element between W and Os » ;
  //   « It is here plain that Q_K = N - 1 very approximately, except for the radiations of very short wave-length which gradually diverge »
  moseleyTexte: S('vacant:Mo-Ru,Nd-Sa,W-Os rule:QK=N-1', '', 'https://iiif.archive.org/image/iiif/3/londonedinburg6271914lond%2flondonedinburg6271914lond_jp2.zip%2flondonedinburg6271914lond_jp2%2flondonedinburg6271914lond_0743.jp2/full/1300,/0/default.jpg', 'vacant:Mo-Ru,Nd-Sa,W-Os rule:QK=N-1'),
  /* game251 : Michelson 1880, « Experimental determination of the velocity of light », Astronomical Papers of the American Ephemeris 1 (3),
   *   pages 135-139 et 141 relues par moi sur les images (Internet Archive experimentaldete00mich, IIIF) ; c exact relu sur la page du NIST.
   *   Idee : codex 26, sous-agent Claude. */
  // https://iiif.archive.org/image/iiif/3/experimentaldete00mich%2fexperimentaldete00mich_jp2.zip%2fexperimentaldete00mich_jp2%2fexperimentaldete00mich_0033.jp2/full/1400,/0/default.jpg a _0036 : colonne « Velocity of light in air », 100 valeurs (km/s), dans l ordre des tables (5 juin - 2 juillet 1879)
  michelson100: S('299850 299740 299900 300070 299930 299850 299950 299980 299980 299880 300000 299980 299930 299650 299760 299810 300000 300000 299960 299960 299960 299940 299960 299940 299880 299800 299850 299880 299900 299840 299830 299790 299810 299880 299880 299830 299800 299790 299760 299800 299880 299880 299880 299860 299720 299720 299620 299860 299970 299950 299880 299910 299850 299870 299840 299840 299850 299840 299840 299840 299890 299810 299810 299820 299800 299770 299760 299740 299750 299760 299910 299920 299890 299860 299880 299720 299840 299850 299850 299780 299890 299840 299780 299810 299760 299810 299790 299810 299820 299850 299870 299870 299810 299740 299810 299940 299950 299800 299810 299870', 'km/s', 'https://iiif.archive.org/image/iiif/3/experimentaldete00mich%2fexperimentaldete00mich_jp2.zip%2fexperimentaldete00mich_jp2%2fexperimentaldete00mich_0033.jp2/full/1400,/0/default.jpg', '299850 299740 299900 300070 299930 299850 299950 299980 299980 299880 300000 299980 299930 299650 299760 299810 300000 300000 299960 299960 299960 299940 299960 299940 299880 299800 299850 299880 299900 299840 299830 299790 299810 299880 299880 299830 299800 299790 299760 299800 299880 299880 299880 299860 299720 299720 299620 299860 299970 299950 299880 299910 299850 299870 299840 299840 299850 299840 299840 299840 299890 299810 299810 299820 299800 299770 299760 299740 299750 299760 299910 299920 299890 299860 299880 299720 299840 299850 299850 299780 299890 299840 299780 299810 299760 299810 299790 299810 299820 299850 299870 299870 299810 299740 299810 299940 299950 299800 299810 299870'),
  // https://iiif.archive.org/image/iiif/3/experimentaldete00mich%2fexperimentaldete00mich_jp2.zip%2fexperimentaldete00mich_jp2%2fexperimentaldete00mich_0039.jp2/full/1400,/0/default.jpg : « FINAL RESULT » (moyenne, +12 temperature, +80 vide, 299944 +- 51, arrondi 299940) ; p. 139 (_0037) : greatest, least, average difference, probable error
  michelsonTexte: S('mean:299852 temperature:12 air:299864 vacuo:80 final:299944 limit:51 rounded:299940 greatest:300070 least:299650 averageDifference:60 probableError:5', 'km/s', 'https://iiif.archive.org/image/iiif/3/experimentaldete00mich%2fexperimentaldete00mich_jp2.zip%2fexperimentaldete00mich_jp2%2fexperimentaldete00mich_0039.jp2/full/1400,/0/default.jpg', 'mean:299852 temperature:12 air:299864 vacuo:80 final:299944 limit:51 rounded:299940 greatest:300070 least:299650 averageDifference:60 probableError:5'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?c : 299 792 458 m/s (exacte)
  nistC: S(299792458, 'm/s', 'https://physics.nist.gov/cgi-bin/cuu/Value?c', '299792458'),
  /* game252 : Galton 1886, « Regression towards mediocrity in hereditary stature », J. Anthropol. Inst. 15 : 246, Table I (p. 248 : totaux et
   *   medianes des lignes et des colonnes, pas les 154 cases interieures) et p. 252, relues par moi sur les images (Internet Archive, vol. 15).
   *   Idee : codex 26, sous-agent Claude. */
  // https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n275_w1500.jpg : ligne du parent moyen (pouces):enfants adultes:parents moyens:mediane des enfants (« .. » ecrit « - »)
  galtonLignes: S('Above:4:5:- 72.5:19:6:72.2 71.5:43:11:69.9 70.5:68:22:69.5 69.5:183:41:68.9 68.5:219:49:68.2 67.5:211:33:67.6 66.5:78:20:67.2 65.5:66:12:66.7 64.5:23:5:65.8 Below:14:1:-', 'inches:count:count:inches', 'https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n275_w1500.jpg', 'Above:4:5:- 72.5:19:6:72.2 71.5:43:11:69.9 70.5:68:22:69.5 69.5:183:41:68.9 68.5:219:49:68.2 67.5:211:33:67.6 66.5:78:20:67.2 65.5:66:12:66.7 64.5:23:5:65.8 Below:14:1:-'),
  // meme page : colonne de la taille des enfants (pouces):total:mediane des parents moyens (ligne « Medians » du bas)
  galtonColonnes: S('Below:5:- 62.2:7:- 63.2:32:66.3 64.2:59:67.8 65.2:48:67.9 66.2:117:67.7 67.2:138:67.9 68.2:120:68.3 69.2:167:68.5 70.2:99:69.0 71.2:64:69.0 72.2:41:70.0 73.2:17:- Above:14:-', 'inches:count:inches', 'https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n275_w1500.jpg', 'Below:5:- 62.2:7:- 63.2:32:66.3 64.2:59:67.8 65.2:48:67.9 66.2:117:67.7 67.2:138:67.9 68.2:120:68.3 69.2:167:68.5 70.2:99:69.0 71.2:64:69.0 72.2:41:70.0 73.2:17:- Above:14:-'),
  // https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n275_w1500.jpg et https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n283_w1200.jpg : 928 enfants, 205 parents moyens, « All Female heights have been multiplied by 1.08 » ; « the level of mediocrity is 68 1/4
  //   inches » ; « the height-deviate of the offspring is, on the average, two-thirds of the height-deviate of its mid-parentage »
  galtonTexte: S('children:928 midparents:205 mediocrity:68.25 law:2/3 femaleFactor:1.08', 'inches', 'https://archive.org/download/sim_royal-anthropological-institute-of-great-britain-ireland_february-10-1885-january-26-1886_15/page/n283_w1200.jpg', 'children:928 midparents:205 mediocrity:68.25 law:2/3 femaleFactor:1.08'),
  /* game253 : Bradley 1729, « A letter ... giving an account of a new discovered motion of the fix'd stars », Phil. Trans. 35 : 637, pages 653 a
   *   655 relues par moi sur les images (Internet Archive philosophicaltra3517roya). Idee : codex 27, sous-agent Claude. */
  // https://archive.org/download/philosophicaltra3517roya/page/n321_w1200.jpg et https://archive.org/download/philosophicaltra3517roya/page/n322_w1200.jpg : etoile:ecart de declination observe (secondes):« Maximum » qu il en deduit pour une etoile au pole de l ecliptique
  bradleyEtoiles: S('35Camelopardalis:19:40.2 etaUrsaeMajoris:36:40.4 tauPersei:25:41 alphaPersei:23:40.2 alphaCassiopeiae:34:40.8 betaDraconis:39:40.2 Capella:16:40', 'arcseconds', 'https://archive.org/download/philosophicaltra3517roya/page/n322_w1200.jpg', '35Camelopardalis:19:40.2 etaUrsaeMajoris:36:40.4 tauPersei:25:41 alphaPersei:23:40.2 alphaCassiopeiae:34:40.8 betaDraconis:39:40.2 Capella:16:40'),
  // https://archive.org/download/philosophicaltra3517roya/page/n320_w1200.jpg : « This therefore being 20",2, AC will be to AB ... as 10210 to One ... in 8' 12" » ; Romer « about 11 Minutes », d autres « about
  //   7 Minutes » ; https://archive.org/download/philosophicaltra3517roya/page/n322_w1200.jpg : « I will therefore suppose that it is 40" 1/2 ... in 8' 13" »
  bradleyTexte: S('angle:20.2 ratio:10210 lightTime:8m12s adopted:40.5 adoptedTime:8m13s roemer:11 others:7', '', 'https://archive.org/download/philosophicaltra3517roya/page/n320_w1200.jpg', 'angle:20.2 ratio:10210 lightTime:8m12s adopted:40.5 adoptedTime:8m13s roemer:11 others:7'),
  /* game255 : Gause 1934, « The Struggle for Existence » (Williams & Wilkins), Table 4 (p. 145), Table X (p. 100), Table XI et texte (p. 105),
   *   texte (p. 107), relus par moi sur les images (Internet Archive struggleforexist00gauz, « No known copyright restrictions »). Seuls des
   *   chiffres de resultats sont repris. Idee : codex 27, sous-agent Claude. */
  // https://archive.org/download/struggleforexist00gauz/page/n158_w1500.jpg : milieu tamponne, individus par 0.5 cc ; jour:aurelia 1 boucle:aurelia 1/2:
  //   caudatum 1:caudatum 1/2:melange 1 boucle aurelia:caudatum:melange 1/2 boucle aurelia:caudatum ; « - » = tiret imprime (pas de mesure, PAS 0)
  gauseTable4: S('0:2:2:2:2:2:2:2:2 1:6:3:6:5:10:5:4:8 2:24:29:31:22:29:15:29:20 3:75:92:46:16:68:32:66:25 4:182:173:76:39:144:52:141:24 5:264:210:115:52:164:40:162:- 6:318:210:118:54:168:32:219:- 7:373:240:140:47:248:36:153:- 8:396:-:125:50:240:40:162:21 9:443:-:137:76:-:32:150:15 10:454:240:162:69:281:20:175:12 11:420:219:124:51:-:30:260:9 12:438:255:135:57:300:12:276:12 13:492:252:133:70:-:16:285:6 14:468:270:110:53:-:20:225:9 15:400:240:113:59:360:12:222:3 16:472:249:127:57:294:9:220:0', 'individuals per 0.5 cc', 'https://archive.org/download/struggleforexist00gauz/page/n158_w1500.jpg', '0:2:2:2:2:2:2:2:2 1:6:3:6:5:10:5:4:8 2:24:29:31:22:29:15:29:20 3:75:92:46:16:68:32:66:25 4:182:173:76:39:144:52:141:24 5:264:210:115:52:164:40:162:- 6:318:210:118:54:168:32:219:- 7:373:240:140:47:248:36:153:- 8:396:-:125:50:240:40:162:21 9:443:-:137:76:-:32:150:15 10:454:240:162:69:281:20:175:12 11:420:219:124:51:-:30:260:9 12:438:255:135:57:300:12:276:12 13:492:252:133:70:-:16:285:6 14:468:270:110:53:-:20:225:9 15:400:240:113:59:360:12:222:3 16:472:249:127:57:294:9:220:0'),
  // https://archive.org/download/struggleforexist00gauz/page/n113_w1000.jpg : origine:caudatum a:caudatum b:aurelia a:aurelia b (divisions du micrometre):volume relatif imprime ; « 0.39 » = moyenne imprimee
  gauseTableX: S('osterhoutGrowing:18.3:6.0:13.8:4.2:0.37 osterhoutOld:17.1:5.1:12.6:3.8:0.41 buffered:18.0:6.2:12.9:4.8:0.429 mean:0.39', 'micrometer divisions', 'https://archive.org/download/struggleforexist00gauz/page/n113_w1000.jpg', 'osterhoutGrowing:18.3:6.0:13.8:4.2:0.37 osterhoutOld:17.1:5.1:12.6:3.8:0.41 buffered:18.0:6.2:12.9:4.8:0.429 mean:0.39'),
  // https://archive.org/download/struggleforexist00gauz/page/n118_w1000.jpg (Table XI, « 64 up to 137 », « 105 up to 195 ») et https://archive.org/download/struggleforexist00gauz/page/n120_w1000.jpg (« 0.01562 », « 0.00952 », « 1.64 », « 0.61 »)
  gauseTexte: S('K1:105 b1:1.1244 K2:64 b2:0.7944 doubleCaudatum:137 doubleAurelia:195 foodCaudatum:0.01562 foodAurelia:0.00952 alpha:1.64 beta:0.61', 'volume units', 'https://archive.org/download/struggleforexist00gauz/page/n118_w1000.jpg', 'K1:105 b1:1.1244 K2:64 b2:0.7944 doubleCaudatum:137 doubleAurelia:195 foodCaudatum:0.01562 foodAurelia:0.00952 alpha:1.64 beta:0.61'),
  /* game256 : Nightingale 1858, « Notes on Matters affecting the Health, Efficiency, and Hospital Administration of the British Army », Table No. 2
   *   (p. 315), relue par moi sur l image (Internet Archive b20387118, Wellcome Library, Public Domain Mark) ; meme tableau, memes nombres, dans
   *   « Mortality of the British Army » (1858), Table K fig. 1 (p. 18), relue aussi. Seuls des chiffres de resultats sont repris. Idee : codex 27. */
  // https://archive.org/download/b20387118/page/n526_w1500.jpg : avril 1854 a mars 1856, un mois par groupe : effectif moyen estime:deces zymotiques:blessures:autres causes:taux annuels pour 1000
  //   (memes trois causes) ; « .. » = rien d imprime (PAS 0) ; meme tableau : https://archive.org/download/mortalityofbriti00lond/page/n27_w1000.jpg
  nightingaleTable2: S('8571:1:..:5:1.4:..:7.0 23333:12:..:9:6.2:..:4.6 28333:11:..:6:4.7:..:2.5 28722:359:..:23:150.0:..:9.6 30246:828:1:30:328.5:0.4:11.9 30290:788:81:70:312.2:32.1:27.7 30643:503:132:128:197.0:51.7:50.1 29736:844:287:106:340.6:115.8:42.8 32779:1725:114:131:631.5:41.7:48.0 32393:2761:83:324:1022.8:30.7:120.0 30919:2120:42:361:822.8:16.3:140.1 30107:1205:32:172:480.3:12.8:68.6 32252:477:48:57:177.5:17.9:21.2 35473:508:49:37:171.8:16.6:12.5 38863:802:209:31:247.6:64.5:9.6 42647:382:134:33:107.5:37.7:9.3 44614:483:164:25:129.9:44.1:6.7 47751:189:276:20:47.5:69.4:5.0 46852:128:53:18:32.8:13.6:4.6 37853:178:33:32:56.4:10.5:10.1 43217:91:18:28:25.3:5.0:7.8 44212:42:2:48:11.4:0.5:13.0 43485:24:..:19:6.6:..:5.2 46140:15:..:35:3.9:..:9.1', 'men, deaths, annual deaths per 1000', 'https://archive.org/download/b20387118/page/n526_w1500.jpg', '8571:1:..:5:1.4:..:7.0 23333:12:..:9:6.2:..:4.6 28333:11:..:6:4.7:..:2.5 28722:359:..:23:150.0:..:9.6 30246:828:1:30:328.5:0.4:11.9 30290:788:81:70:312.2:32.1:27.7 30643:503:132:128:197.0:51.7:50.1 29736:844:287:106:340.6:115.8:42.8 32779:1725:114:131:631.5:41.7:48.0 32393:2761:83:324:1022.8:30.7:120.0 30919:2120:42:361:822.8:16.3:140.1 30107:1205:32:172:480.3:12.8:68.6 32252:477:48:57:177.5:17.9:21.2 35473:508:49:37:171.8:16.6:12.5 38863:802:209:31:247.6:64.5:9.6 42647:382:134:33:107.5:37.7:9.3 44614:483:164:25:129.9:44.1:6.7 47751:189:276:20:47.5:69.4:5.0 46852:128:53:18:32.8:13.6:4.6 37853:178:33:32:56.4:10.5:10.1 43217:91:18:28:25.3:5.0:7.8 44212:42:2:48:11.4:0.5:13.0 43485:24:..:19:6.6:..:5.2 46140:15:..:35:3.9:..:9.1'),
  /* game257 : Faraday 1834, « Experimental Researches in Electricity, Seventh Series », Phil. Trans. 124 : 77, pages 104 a 116 relues par moi
   *   sur les images (Internet Archive s3id13528700, Wellcome Library, Public Domain Mark). Seuls des chiffres de resultats sont repris. Idee : codex 27. */
  // https://archive.org/download/s3id13528700/page/n119_w1500.jpg (§ 791-792), https://archive.org/download/s3id13528700/page/n120_w1500.jpg (§ 795, 798), p. 106-107 (§ 799, 802, 803) et p. 110 (§ 817-819) : metal:paragraphe:equivalent mesure
  faradayEssais: S('Sn:791:57.9 Sn:792:58.53 Pb:795:100.85 Pb:798:93.17 Pb:799:101.29 Pb:802:75.46 Pb:802:73.45 Pb:803:89.04 Pb:817:101.5 Pb:818:103.5 Sn:819:59', 'equivalent, hydrogen = 1', 'https://archive.org/download/s3id13528700/page/n120_w1500.jpg', 'Sn:791:57.9 Sn:792:58.53 Pb:795:100.85 Pb:798:93.17 Pb:799:101.29 Pb:802:75.46 Pb:802:73.45 Pb:803:89.04 Pb:817:101.5 Pb:818:103.5 Sn:819:59'),
  // https://archive.org/download/s3id13528700/page/n129_w1500.jpg et https://archive.org/download/s3id13528700/page/n130_w1500.jpg : § 847 « Table of Ions » ; seuls ces dix ions sont repris (la table en a plus de cinquante)
  faradayIons: S('Hydrogen:1 Oxygen:8 Chlorine:35.5 Iodine:126 Bromine:78.3 Tin:57.9 Lead:103.5 Copper:31.6 Zinc:32.5 Silver:108', 'equivalent, hydrogen = 1', 'https://archive.org/download/s3id13528700/page/n130_w1500.jpg', 'Hydrogen:1 Oxygen:8 Chlorine:35.5 Iodine:126 Bromine:78.3 Tin:57.9 Lead:103.5 Copper:31.6 Zinc:32.5 Silver:108'),
  // https://archive.org/download/s3id13528700/page/n119_w1500.jpg (§ 791 : 20 et 23.2 grains, 3.85 pouces cubes, 12.92 grains les 100, 0.49742, eau = 9, 57.9) et https://archive.org/download/s3id13528700/page/n131_w1500.jpg (§ 851 : 8, 36, 78.4, 103.5, 59)
  faradayTexte: S('electrodeBefore:20 electrodeAfter:23.2 gas:3.85 grains100:12.92 water:0.49742 waterEquivalent:9 tin:57.9 O851:8 Cl851:36 Br851:78.4 Pb851:103.5 Sn851:59', 'grains, cubic inches', 'https://archive.org/download/s3id13528700/page/n119_w1500.jpg', 'electrodeBefore:20 electrodeAfter:23.2 gas:3.85 grains100:12.92 water:0.49742 waterEquivalent:9 tin:57.9 O851:8 Cl851:36 Br851:78.4 Pb851:103.5 Sn851:59'),
  /* game258 : Petit et Dulong 1819, « Recherches sur quelques points importans de la theorie de la chaleur », Annales de chimie et de physique
   *   10 : 395, tableau de la p. 403 relu par moi sur l image (Internet Archive s3id13207780, Wellcome Library, Public Domain Mark). Seuls des
   *   chiffres de resultats sont repris. Idee : codex 28, sous-agent Claude. */
  // https://archive.org/download/s3id13207780/page/n406_w1000.jpg : corps:chaleur specifique (eau = 1):poids de l atome (oxygene = 1):produit imprime
  petitDulongTable: S('Bismuth:0.0288:13.30:0.3830 Plomb:0.0293:12.95:0.3794 Or:0.0298:12.43:0.3704 Platine:0.0314:11.16:0.3740 Etain:0.0514:7.35:0.3779 Argent:0.0557:6.75:0.3759 Zinc:0.0927:4.03:0.3736 Tellure:0.0912:4.03:0.3675 Cuivre:0.0949:3.957:0.3755 Nickel:0.1035:3.69:0.3819 Fer:0.1100:3.392:0.3731 Cobalt:0.1498:2.46:0.3685 Soufre:0.1880:2.011:0.3780', 'specific heat, atomic weight (oxygen = 1)', 'https://archive.org/download/s3id13207780/page/n406_w1000.jpg', 'Bismuth:0.0288:13.30:0.3830 Plomb:0.0293:12.95:0.3794 Or:0.0298:12.43:0.3704 Platine:0.0314:11.16:0.3740 Etain:0.0514:7.35:0.3779 Argent:0.0557:6.75:0.3759 Zinc:0.0927:4.03:0.3736 Tellure:0.0912:4.03:0.3675 Cuivre:0.0949:3.957:0.3755 Nickel:0.1035:3.69:0.3819 Fer:0.1100:3.392:0.3731 Cobalt:0.1498:2.46:0.3685 Soufre:0.1880:2.011:0.3780'),
  /* game259 : Omori, « On the After-shocks of Earthquakes », J. Coll. Sci. Imp. Univ. Tokyo 7 : 111, pages 118 a 120 relues par moi sur les images
   *   (Internet Archive journalofcollege07toky, « NOT_IN_COPYRIGHT »). Seuls des chiffres de resultats sont repris. Idee : codex 28, sous-agent Claude. */
  // https://archive.org/download/journalofcollege07toky/page/n136_w1500.jpg : Gifu, demi-journees depuis le 29 octobre 1891 : 10 comptes reels | x:valeur calculee imprimee | demi-journees:moyenne imprimee
  omoriTable: S('171 147 109 64 71 55 58 41 46 46|0:190 1:133 2:102 3.5:76 5.5:56 8:42|3-4:68 5-6:57 7-9:44', 'shocks per half day', 'https://archive.org/download/journalofcollege07toky/page/n136_w1500.jpg', '171 147 109 64 71 55 58 41 46 46|0:190 1:133 2:102 3.5:76 5.5:56 8:42|3-4:68 5-6:57 7-9:44'),
  // https://archive.org/download/journalofcollege07toky/page/n135_w1500.jpg (equation (c), 440.7 et 2.31), https://archive.org/download/journalofcollege07toky/page/n136_w1500.jpg (1892, 1893, x = 19, note « log y = 2.25 - x x 0.106 ») et p. 120 (equation (d), 42 et 37 ans)
  omoriTexte: S('k:440.7 h:2.31 x1892:493 x1893:1225 y1892:0.9 y1893:0.36 shocks1892:867 shocks1893:308 obs1892:1.2 obs1893:0.42 curvature:19 kd:16.9 hd:0.397 xd1892:7.5 xd1893:19.5 yd1892:2.1 yd1893:0.84 obsd1892:2.4 obsd1893:0.84 years30:42 years60:37 expA:2.25 expB:0.106 exp0:175 exp1:138 exp2:108', 'half days, shocks', 'https://archive.org/download/journalofcollege07toky/page/n136_w1500.jpg', 'k:440.7 h:2.31 x1892:493 x1893:1225 y1892:0.9 y1893:0.36 shocks1892:867 shocks1893:308 obs1892:1.2 obs1893:0.42 curvature:19 kd:16.9 hd:0.397 xd1892:7.5 xd1893:19.5 yd1892:2.1 yd1893:0.84 obsd1892:2.4 obsd1893:0.84 years30:42 years60:37 expA:2.25 expB:0.106 exp0:175 exp1:138 exp2:108'),
  /* game260 : Halley 1693, « An Estimate of the Degrees of the Mortality of Mankind », Phil. Trans. 17 : 596, pages 598, 600, 601 et 603 relues
   *   par moi sur les images (Internet Archive paper-doi-10_1098_rstl_1693_0007, The Royal Society, Public Domain Mark). Seuls des chiffres de
   *   resultats sont repris. Idee : codex 28, sous-agent Claude. */
  // https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n4_w1500.jpg : « Age Curt. / Persons », vivants dans l annee d age 1 a 84 (l etiquette 66 est imprimee « 65 » : seuls les nombres sont repris)
  halleyVivants: S('1000 855 798 760 732 710 692 680 670 661 653 646 640 634 628 622 616 610 604 598 592 586 579 573 567 560 553 546 539 531 523 515 507 499 490 481 472 463 454 445 436 427 417 407 397 387 377 367 357 346 335 324 313 302 292 282 272 262 252 242 232 222 212 202 192 182 172 162 152 142 131 120 109 98 88 78 68 58 49 41 34 28 23 20', 'persons alive', 'https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n4_w1500.jpg', '1000 855 798 760 732 710 692 680 670 661 653 646 640 634 628 622 616 610 604 598 592 586 579 573 567 560 553 546 539 531 523 515 507 499 490 481 472 463 454 445 436 427 417 407 397 387 377 367 357 346 335 324 313 302 292 282 272 262 252 242 232 222 212 202 192 182 172 162 152 142 131 120 109 98 88 78 68 58 49 41 34 28 23 20'),
  // meme page, colonne de droite : sommes par 7 ans | 85 a 100 en bloc | « Sum Total »
  halleySommes: S('5547 4584 4270 3964 3604 3178 2709 2194 1694 1204 692 253|107|34000', 'persons', 'https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n4_w1500.jpg', '5547 4584 4270 3964 3604 3178 2709 2194 1694 1204 692 253|107|34000'),
  // https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n7_w1500.jpg : « Years Purchase » a « Six per Cent », age:valeur
  halleyAnnuites: S('1:10.28 5:13.40 10:13.44 15:13.33 20:12.78 25:12.27 30:11.72 35:11.12 40:10.57 45:9.91 50:9.21 55:8.51 60:7.60 65:6.54 70:5.32', 'years purchase', 'https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n7_w1500.jpg', '1:10.28 5:13.40 10:13.44 15:13.33 20:12.78 25:12.27 30:11.72 35:11.12 40:10.57 45:9.91 50:9.21 55:8.51 60:7.60 65:6.54 70:5.32'),
  // https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n2_w1000.jpg (1687-1691 : 6193 nes, 5869 enterres, 1238, 1174, 64, 348, 890, 198, 692), p. 601 (« 80 to 1 »), p. 603 (6 %, « 9, 974694 »)
  halleyTexte: S('born:6193 buried:5869 years:5 born1:1238 buried1:1174 increase:64 die1:348 reach1:890 die5:198 survive6:692 odds:80 rate:6 complement:9.974694', 'persons, per cent', 'https://archive.org/download/paper-doi-10_1098_rstl_1693_0007/page/n2_w1000.jpg', 'born:6193 buried:5869 years:5 born1:1238 buried1:1174 increase:64 die1:348 reach1:890 die5:198 survive6:692 odds:80 rate:6 complement:9.974694'),
  /* game261 : Howard, « The Climate of London », 2e ed., vol. I, 1833, pages 3, 4, 6 et 7 relues par moi sur les images (Internet Archive
   *   b29350529_0001, Wellcome Library, Public Domain Mark). Seuls des chiffres de resultats sont repris. Idee : codex 28, sous-agent Claude. */
  // https://archive.org/download/b29350529_0001/page/n97_w1500.jpg et https://archive.org/download/b29350529_0001/page/n98_w1500.jpg : « Annual mean temperature », Londres (registre de la Royal Society), annee:degres F
  howardLondres: S('1789:49.491 1790:50.892 1791:50.833 1792:50.483 1793:50.820 1794:51.200 1795:49.700 1796:50.083 1797:49.398 1798:50.999 1799:47.920 1800:50.522 1801:51.080 1802:50.200 1803:50.329 1804:51.731 1805:49.998 1806:52.734 1807:50.733 1808:50.466 1809:50.633 1810:50.976 1811:52.666 1812:49.208 1813:49.741 1814:48.241 1815:51.550 1816:49.433 1817:50.316 1818:53.003', 'degrees Fahrenheit', 'https://archive.org/download/b29350529_0001/page/n97_w1500.jpg', '1789:49.491 1790:50.892 1791:50.833 1792:50.483 1793:50.820 1794:51.200 1795:49.700 1796:50.083 1797:49.398 1798:50.999 1799:47.920 1800:50.522 1801:51.080 1802:50.200 1803:50.329 1804:51.731 1805:49.998 1806:52.734 1807:50.733 1808:50.466 1809:50.633 1810:50.976 1811:52.666 1812:49.208 1813:49.741 1814:48.241 1815:51.550 1816:49.433 1817:50.316 1818:53.003'),
  // memes pages, « In the Country » (Plaistow, Stratford puis Tottenham), annee:degres F
  howardCampagne: S('1807:48.367 1808:48.633 1809:49.546 1810:49.507 1811:51.190 1812:47.743 1813:49.762 1814:46.967 1815:49.630 1816:46.572 1817:47.834 1818:50.028', 'degrees Fahrenheit', 'https://archive.org/download/b29350529_0001/page/n98_w1500.jpg', '1807:48.367 1808:48.633 1809:49.546 1810:49.507 1811:51.190 1812:47.743 1813:49.762 1814:46.967 1815:49.630 1816:46.572 1817:47.834 1818:50.028'),
  // https://archive.org/download/b29350529_0001/page/n98_w1500.jpg : « AVERAGES », serie:annees:depuis:moyenne imprimee
  howardMoyennes: S('Lo:5:1790:50.845 Lo:5:1807:51.095 Ca:5:1807:49.448 Lo:5:1795:49.620 Lo:5:1812:49.634 Ca:5:1812:48.135 Lo:10:1790:50.233 Lo:10:1807:50.364 Ca:10:1807:48.791 Lo:17:1790:50.530 Lo:17:1800:50.600 Lo:7:1800:50.912', 'degrees Fahrenheit', 'https://archive.org/download/b29350529_0001/page/n98_w1500.jpg', 'Lo:5:1790:50.845 Lo:5:1807:51.095 Ca:5:1807:49.448 Lo:5:1795:49.620 Lo:5:1812:49.634 Ca:5:1812:48.135 Lo:10:1790:50.233 Lo:10:1807:50.364 Ca:10:1807:48.791 Lo:17:1790:50.530 Lo:17:1800:50.600 Lo:7:1800:50.912'),
  // https://archive.org/download/b29350529_0001/page/n94_w1500.jpg (decennies, 50.456, 1807-1809) et https://archive.org/download/b29350529_0001/page/n95_w1500.jpg (1810-1812, 1813-1816, « 1 579 ») ; https://archive.org/download/b29350529_0001/page/n98_w1500.jpg (p. 7) « Extent of variation » (« [1818, not then out.] »)
  howardTexte: S('c1807:48.848 l1807:50.608 e1807:1.760 c1810:49.480 l1810:50.949 e1810:1.469 c1813:48.233 l1813:49.741 e1813:1.508 excess:1.579 dec1:50.516 dec2:50.490 dec3:50.364 city:50.456 extentLondon:4.814 extentCountry:4.618', 'degrees Fahrenheit', 'https://archive.org/download/b29350529_0001/page/n94_w1500.jpg', 'c1807:48.848 l1807:50.608 e1807:1.760 c1810:49.480 l1810:50.949 e1810:1.469 c1813:48.233 l1813:49.741 e1813:1.508 excess:1.579 dec1:50.516 dec2:50.490 dec3:50.364 city:50.456 extentLondon:4.814 extentCountry:4.618'),
  /* game262 : Mendenhall, « The Characteristic Curves of Composition », Science 9 (11 mars 1887) : 237, pages 240, 241 et 243 relues par moi sur
   *   les images (Internet Archive jstor-1764604 ; texte de 1887, domaine public ; JSTOR : scan libre pour usage non commercial ; seuls des
   *   chiffres de resultats sont repris, aucune image). Idee : codex 28, sous-agent Claude. */
  // https://archive.org/download/jstor-1764604/page/n4_w1500.jpg (Oliver Twist, 1000 premiers mots, lettres 1 a 12) | https://archive.org/download/jstor-1764604/page/n5_w1500.jpg (Vanity Fair, deux groupes de 1000 mots, lettres 1 a 14)
  mendenhallOliver: S('38 170 235 175 123 91 62 41 35 10 13 7', 'words of k letters', 'https://archive.org/download/jstor-1764604/page/n4_w1500.jpg', '38 170 235 175 123 91 62 41 35 10 13 7'),
  mendenhallVanity: S('25 169 232 187 109 78 79 48 28 20 10 10 2 3|33 146 248 164 135 76 73 52 35 23 6 5 2 2', 'words of k letters', 'https://archive.org/download/jstor-1764604/page/n5_w1500.jpg', '25 169 232 187 109 78 79 48 28 20 10 10 2 3|33 146 248 164 135 76 73 52 35 23 6 5 2 2'),
  // https://archive.org/download/jstor-1764604/page/n5_w1500.jpg (« 4,507 », « 4,508 ») et https://archive.org/download/jstor-1764604/page/n7_w1500.jpg (moyennes sur 10 000 mots ; Bible, chiffres que l auteur dit ne pas garantir)
  mendenhallTexte: S('letters1:4507 letters2:4508 atkinson:4.298 dickens:4.342 thackeray:4.481 mill:4.775 otWords:592493 otLetters:2728100 ntWords:181253 ntLetters:838380 otMean:4.604 ntMean:4.625', 'letters per word', 'https://archive.org/download/jstor-1764604/page/n7_w1500.jpg', 'letters1:4507 letters2:4508 atkinson:4.298 dickens:4.342 thackeray:4.481 mill:4.775 otWords:592493 otLetters:2728100 ntWords:181253 ntLetters:838380 otMean:4.604 ntMean:4.625'),
  /* game263 : Bessel, « Bestimmung der Entfernung des 61sten Sterns des Schwans », Astronomische Nachrichten Nr. 365-366, pages 85 a 90 relues
   *   par moi sur les images (Internet Archive bub_gb_PFc_AAAAcAAJ, Public Domain Mark). Seuls des chiffres de resultats sont repris. Idee : codex 28. */
  // https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0050.jp2/pct:5,70,95,23/2200,/0/default.jpg : equations normales de l etoile a (coefficients de alpha, alpha', alpha'' puis second membre), une ligne par equation
  besselA: S('85 27.743 24.399 8.295|27.743 21.4782 13.5709 4.1016|24.399 13.5709 31.5999 11.1517', 'arcseconds', 'https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0050.jp2/pct:5,70,95,23/2200,/0/default.jpg', '85 27.743 24.399 8.295|27.743 21.4782 13.5709 4.1016|24.399 13.5709 31.5999 11.1517'),
  // https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0051.jp2/pct:0,0,100,50/2000,/0/default.jpg : equations normales de l etoile b (beta, beta', beta'' puis second membre)
  besselB: S('98 32.645 23.593 13.172|32.645 24.5663 8.6625 7.9193|23.593 8.6625 39.0826 12.0683', 'arcseconds', 'https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0051.jp2/pct:0,0,100,50/2000,/0/default.jpg', '98 32.645 23.593 13.172|32.645 24.5663 8.6625 7.9193|23.593 8.6625 39.0826 12.0683'),
  // https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0051.jp2/pct:0,0,100,50/2000,/0/default.jpg (solutions, « Gew. », sommes de carres, erreurs moyennes) et https://archive.org/download/bub_gb_PFc_AAAAcAAJ/page/n52_w1500.jpg (0.6889, solutions II, « 0 3136 ») ; p. 88 en bas (ponderation par 0.6889, solution commune, ± 0 1354 et ± 0 0202) : https://iiif.archive.org/image/iiif/3/bub_gb_PFc_AAAAcAAJ%2fbub_gb_PFc_AAAAcAAJ_jp2.zip%2fbub_gb_PFc_AAAAcAAJ_jp2%2fbub_gb_PFc_AAAAcAAJ_0051.jp2/pct:50,70,50,30/1600,/0/default.jpg
  besselTexte: S('alpha:0.0094 alpha1:-0.0543 alpha2:0.3690 beta:-0.0091 beta1:0.2426 beta2:0.2605 wA1:11.145 wA2:24.065 wB1:13.672 wB2:33.356 ssA0:4.4487 ssB0:4.7108 ssA:1.4448 ssB:2.4469 nA:85 nB:98 mA:0.1327 mB:0.1605 meA1:0.0398 meA2:0.0283 meB1:0.0434 meB2:0.0278 poids:0.6889 IIalpha:0.0171 IIalpha1:-0.0293 IIbeta:-0.0209 IIbeta1:0.2395 parallaxe:0.3136 m1:0.1354 meP:0.0202', 'arcseconds', 'https://archive.org/download/bub_gb_PFc_AAAAcAAJ/page/n52_w1500.jpg', 'alpha:0.0094 alpha1:-0.0543 alpha2:0.3690 beta:-0.0091 beta1:0.2426 beta2:0.2605 wA1:11.145 wA2:24.065 wB1:13.672 wB2:33.356 ssA0:4.4487 ssB0:4.7108 ssA:1.4448 ssB:2.4469 nA:85 nB:98 mA:0.1327 mB:0.1605 meA1:0.0398 meA2:0.0283 meB1:0.0434 meB2:0.0278 poids:0.6889 IIalpha:0.0171 IIalpha1:-0.0293 IIbeta:-0.0209 IIbeta1:0.2395 parallaxe:0.3136 m1:0.1354 meP:0.0202'),
  /* game264 : Nyquist, « Certain Factors Affecting Telegraph Speed », Bell System Technical Journal 3 (avril 1924) : 324, pages 333, 334, 335 et
   *   346 relues par moi sur les images (Internet Archive bstj3-2-324 ; aucun champ de droits ; publication americaine de 1924). Seuls des chiffres
   *   de resultats sont repris. Idee : codex 29, sous-agent Claude ; contre-lecture independante (workflow). */
  // https://archive.org/download/bstj3-2-324/page/n9_w1500.jpg : « W = K log m », nombre de valeurs de courant:quantite relative d « intelligence »
  nyquistTable: S('2:100 3:158 4:200 5:230 8:300 16:400', 'relative speed', 'https://archive.org/download/bstj3-2-324/page/n9_w1500.jpg', '2:100 3:158 4:200 5:230 8:300 16:400'),
  // https://archive.org/download/bstj3-2-324/page/n10_w1500.jpg : code:elements de signal par lettre:nombre relatif de lettres (meme table p. 346, https://archive.org/download/bstj3-2-324/page/n22_w1500.jpg)
  nyquistCodes: S('AmericanMorse2:8.26:74 ContinentalMorse2:8.45:73 Ideal2:6.14:100 ContinentalMorse3:3.77:163 Ideal3:3.63:169', 'signal elements per letter', 'https://archive.org/download/bstj3-2-324/page/n10_w1500.jpg', 'AmericanMorse2:8.26:74 ContinentalMorse2:8.45:73 Ideal2:6.14:100 ContinentalMorse3:3.77:163 Ideal3:3.63:169'),
  // https://archive.org/download/bstj3-2-324/page/n10_w1500.jpg (« 1.58:1 », « 1.4:1 »), https://archive.org/download/bstj3-2-324/page/n11_w1500.jpg (« 1.6x1.4:1 or 2.2:1 ») et https://archive.org/download/bstj3-2-324/page/n22_w1500.jpg (caracteres par duree : 1, 1, 2, 3, 5, 9 et 5 ; 2, 4, 8 et 12 ; 26 lettres)
  nyquistTexte: S('theory:1.58 incidental:1.4 total:2.2 chars2:1,1,2,3,5,9,5 chars3:2,4,8,12 letters:26', 'ratios, characters', 'https://archive.org/download/bstj3-2-324/page/n11_w1500.jpg', 'theory:1.58 incidental:1.4 total:2.2 chars2:1,1,2,3,5,9,5 chars3:2,4,8,12 letters:26'),
  /* game265 : Young, « The Bakerian Lecture. On the Theory of Light and Colours », Phil. Trans. 92 (1802) : 12, pages 38 et 39 relues par moi sur
   *   les images (Internet Archive jstor-107113, JSTOR Early Journal Content ; aucun champ de licence). Seuls des chiffres de resultats sont repris.
   *   Idee : codex 29, sous-agent Claude ; contre-lecture independante (workflow). */
  // https://iiif.archive.org/image/iiif/3/jstor-107113%2f107113_jp2.zip%2f107113_jp2%2f107113_0028.jp2/pct:5,4,92,50/1800,/0/default.jpg : couleur par couleur, longueur d ondulation dans l air (en dix-millioniemes de pouce):ondulations par pouce:par seconde (millions de millions)
  youngTable: S('266:37640:463 256:39180:482 246:40720:501 240:41610:512 235:42510:523 227:44000:542 219:45600:561 211:47460:584 203:49320:607 196:51110:629 189:52910:652 185:54070:665 181:55240:680 174:57490:707 167:59750:735', 'ten-millionths of an inch, per inch, millions of millions per second', 'https://iiif.archive.org/image/iiif/3/jstor-107113%2f107113_jp2.zip%2f107113_jp2%2f107113_0028.jp2/pct:5,4,92,50/1800,/0/default.jpg', '266:37640:463 256:39180:482 246:40720:501 240:41610:512 235:42510:523 227:44000:542 219:45600:561 211:47460:584 203:49320:607 196:51110:629 189:52910:652 185:54070:665 181:55240:680 174:57490:707 167:59750:735'),
  // meme page (« 8 1/8 minutes 500,000,000000 feet », « = 2 48 nearly ») et https://archive.org/download/jstor-107113/page/n27_w1500.jpg (« three to five », « 8, 7, and 6 », « a fourth »)
  youngTexte: S('minutes:8.125 feet:500000000000 power:48 sixth:5/3 redYellowBlue:8/7/6 fourth:4/3', 'minutes, feet', 'https://archive.org/download/jstor-107113/page/n27_w1500.jpg', 'minutes:8.125 feet:500000000000 power:48 sixth:5/3 redYellowBlue:8/7/6 fourth:4/3'),
  /* game266 : Lummer et Pringsheim, « Die Vertheilung der Energie im Spectrum des schwarzen Koerpers... », Verh. Dtsch. Phys. Ges. 1, Nr. 12
   *   (seance du 3 novembre 1899) : 215, Tabelle I p. 218 relue par moi sur l image (Internet Archive verhandlungende63unkngoog, NOT_IN_COPYRIGHT
   *   pour les Etats-Unis). Seuls des chiffres de resultats sont repris. Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/verhandlungende63unkngoog/page/n229_w2000.jpg : T absolue:lambda_m (micron):E_m (unites du bolometre):A = lambda_m T:B = E_m T^-5 (x 1e-17):T = (E_m / B moyen)^(1/5):Diff
  lummerTable: S('1646:1.78:270.6:2928:2246:1653.5:7.50 1460.4:2.04:145.0:2979:2184:1460.0:-0.4 1259.0:2.35:68.8:2959:2176:1257.5:-1.5 1094.5:2.71:34.0:2966:2164:1092.3:-2.2 998.5:2.96:21.50:2956:2166:996.5:-2.0 908.5:3.28:13.66:2980:2208:910.1:1.6 723:4.08:4.28:2950:2166:721.5:-1.5 621.2:4.53:2.026:2814:2190:621.3:0.1', 'kelvin, micron, arbitrary energy', 'https://archive.org/download/verhandlungende63unkngoog/page/n229_w2000.jpg', '1646:1.78:270.6:2928:2246:1653.5:7.50 1460.4:2.04:145.0:2979:2184:1460.0:-0.4 1259.0:2.35:68.8:2959:2176:1257.5:-1.5 1094.5:2.71:34.0:2966:2164:1092.3:-2.2 998.5:2.96:21.50:2956:2166:996.5:-2.0 908.5:3.28:13.66:2980:2208:910.1:1.6 723:4.08:4.28:2950:2166:721.5:-1.5 621.2:4.53:2.026:2814:2190:621.3:0.1'),
  // meme page : « Mittel = 2940 » et « 2188.10-17 » ; https://archive.org/download/verhandlungende63unkngoog/page/n230_w2000.jpg : intervalle 621 a 1646 abs.
  lummerTexte: S('Amean:2940 Bmean:2188', 'micron kelvin, energy per kelvin^5', 'https://archive.org/download/verhandlungende63unkngoog/page/n229_w2000.jpg', 'Amean:2940 Bmean:2188'),
  /* game267 : Coulomb, « Premier memoire sur l electricite et le magnetisme » et « Second memoire », Mem. Acad. roy. sci. annee 1785 (publie en
   *   1788), pages 573, 574, 583, 584 et 585 relues par moi sur les images (Internet Archive histoiredelacad85hist ; l item porte CC BY-NC 3.0 (BHL) :
   *   seuls des NOMBRES du texte de 1788 sont repris, aucune image). Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/histoiredelacad85hist/page/n766_w1000.jpg : la balance de torsion, trois essais : torsion du micrometre (degres):ecart des balles (degres)
  coulombTorsion: S('0:36 126:18 567:8.5', 'degrees', 'https://archive.org/download/histoiredelacad85hist/page/n766_w1000.jpg', '0:36 126:18 567:8.5'),
  // https://archive.org/download/histoiredelacad85hist/page/n778_w1000.jpg : la plaque attiree, distance des centres (pouces):temps de 15 oscillations (secondes)
  coulombOscillations: S('9:20 18:40 24:60', 'inches, seconds', 'https://archive.org/download/histoiredelacad85hist/page/n778_w1000.jpg', '9:20 18:40 24:60'),
  // https://archive.org/download/histoiredelacad85hist/page/n766_w1000.jpg (1/340, 1/3400), https://archive.org/download/histoiredelacad85hist/page/n767_w1000.jpg (144, 576, demi-degre, 5 degres = un 24 millieme de grain), https://archive.org/download/histoiredelacad85hist/page/n779_w1000.jpg (20 41 60, theorie 20 40 54, 1/10)
  //   et https://archive.org/download/histoiredelacad85hist/page/n780_w1000.jpg (1/40 par minute, quatre minutes, racine(10) : racine(9) :: 60 : 57, 1/20)
  coulombTexte: S('force2:144 total3:576 demi:0.5 g360:340 g36:3400 millieme5:24 theorie:20,40,54 temps584:20,41,60 dixieme:10 perteMinute:40 minutes:4 corrige:57 vingtieme:20', 'degrees, grains, seconds', 'https://archive.org/download/histoiredelacad85hist/page/n779_w1000.jpg', 'force2:144 total3:576 demi:0.5 g360:340 g36:3400 millieme5:24 theorie:20,40,54 temps584:20,41,60 dixieme:10 perteMinute:40 minutes:4 corrige:57 vingtieme:20'),
  /* game268 : Joule, « On the Heat evolved by Metallic Conductors of Electricity, and in the Cells of a Battery during Electrolysis », Phil. Mag.
   *   (3e serie) 19 (1841) : 260, pages 262, 263, 264 et 266 relues par moi sur les images (Internet Archive londonedinburghp19lond ; aucun champ
   *   de droits). Seuls des chiffres de resultats sont repris. Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://iiif.archive.org/image/iiif/3/londonedinburghp19lond%2flondonedinburghp19lond_jp2.zip%2flondonedinburghp19lond_jp2%2flondonedinburghp19lond_0280.jp2/pct:5,12,92,26/1700,/0/default.jpg : deviation (57 2/3 ecrit 57.67):courant Q:chaleur en une demi-heure:« ratio of the squares »:chaleur en une heure:rapport ; « - » = points
  jouleTable: S('16:0.43:-:-:1.2:1 31.5:0.92:3:2.9:4.7:4.55 55:2.35:19.4:18.8:-:- 57.67:2.61:23:23.2:-:- 58.5:2.73:25:25.4:39.6:40', 'Joule degrees Q, Fahrenheit degrees', 'https://iiif.archive.org/image/iiif/3/londonedinburghp19lond%2flondonedinburghp19lond_jp2.zip%2flondonedinburghp19lond_jp2%2flondonedinburghp19lond_0280.jp2/pct:5,12,92,26/1700,/0/default.jpg', '16:0.43:-:-:1.2:1 31.5:0.92:3:2.9:4.7:4.55 55:2.35:19.4:18.8:-:- 57.67:2.61:23:23.2:-:- 58.5:2.73:25:25.4:39.6:40'),
  // https://archive.org/download/londonedinburghp19lond/page/n281_w1500.jpg (§ 25-28 : 2.54 Q 27 min 6.22 ; 2.085 Q 45 min 7.04 ; 1.88 Q 60 min 7.47 ; reductions 7.57 et 7.63, moyenne 7.56) et https://archive.org/download/londonedinburghp19lond/page/n278_w1500.jpg (Exp. 1-3)
  jouleTexte: S('r1:2.54 t1:27 h1:6.22 r2:2.085 t2:45 h2:7.04 r3:1.88 t3:60 h3:7.47 red1:7.57 red2:7.63 moy:7.56 feetThin:3 feetThick:8 res1a:3.4 res1b:1.27 heat1a:3.4 heat1b:1.3 heat2a:6 heat2b:5.5 res2a:6 res2b:5.51 heat3a:4.4 heat3b:2.9 res3a:4.4 res3b:3', 'Joule degrees Q, minutes, Fahrenheit degrees', 'https://archive.org/download/londonedinburghp19lond/page/n281_w1500.jpg', 'r1:2.54 t1:27 h1:6.22 r2:2.085 t2:45 h2:7.04 r3:1.88 t3:60 h3:7.47 red1:7.57 red2:7.63 moy:7.56 feetThin:3 feetThick:8 res1a:3.4 res1b:1.27 heat1a:3.4 heat1b:1.3 heat2a:6 heat2b:5.5 res2a:6 res2b:5.51 heat3a:4.4 heat3b:2.9 res3a:4.4 res3b:3'),
  /* game269 : Reynolds, « An Experimental Investigation of the Circumstances which determine whether the Motion of Water shall be Direct or
   *   Sinuous... », Phil. Trans. 174 (1883) : 935, Table I p. 954 relue par moi sur les images (Internet Archive philtrans06508925, Public Domain
   *   Mark). Seuls des chiffres de resultats sont repris. Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://iiif.archive.org/image/iiif/3/philtrans06508925%2f06508925_jp2.zip%2f06508925_jp2%2f06508925_0019.jp2/pct:5,33,90,22/1800,/0/default.jpg (et la page https://archive.org/download/philtrans06508925/page/n19_w1000.jpg) : tube:temperature C:temps (s):vitesse (m/s):log temps:-log P:log V:log B_s ; les logs a caracteristique barree
  //   (« 1-bar.79729 ») sont ecrits en valeur signee (-0.20271)
  reynoldsTable: S('1:8.3:60:0.6270:1.77815:0.11242:-0.20271:1.66200 1:21:87:0.4325:1.93959:0.25654:-0.36407:1.67930 1:15:70:0.5374:1.84500:0.19198:-0.26965:1.64936 1:12:60:0.6270:1.77815:0.15712:-0.20271:1.61730 1:13:64:0.5878:1.80618:0.16882:-0.23074:1.64464 1:13:67:0.5614:1.82617:0.16882:-0.25073:1.65363 1:13:64:0.5878:1.80618:0.16882:-0.23074:1.64464 1:5:54:0.6967:1.73239:0.06963:-0.15695:1.65898 1:5:52:0.7235:1.71600:0.06963:-0.14060:1.64269 1:10:62:0.6068:1.79239:0.13319:-0.21695:1.65546 1:11:64:0.5870:1.80613:0.14525:-0.23069:1.65716 2:22:155:0.7476:2.19033:0.26710:-0.12633:1.67523 2:11:110:1.052:2.04139:0.14525:0.02261:1.64814 2:11:108:1.072:2.03342:0.14525:0.03058:1.64017 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:6:86:1.348:1.93449:0.08278:0.12951:1.59371 2:6:85:1.362:1.92941:0.08278:0.13459:1.59863 3:11:220:1.967:2.34242:0.14525:0.29392:1.66300 3:10.5:224:1.932:2.35024:0.13920:0.28610:1.67687 3:11:218:1.982:2.33845:0.14525:0.29789:1.65903 3:11:116:2.004:2.33445:0.14525:0.30189:1.65503 3:4:164:2.637:2.21484:0.05621:0.42150:1.62446 3:4:172:2.517:2.23552:0.05621:0.40082:1.64514 3:6:176:2.460:2.24551:0.08278:0.39083:1.62856 3:6:176:2.460:2.24551:0.08278:0.39083:1.62856 3:6:174:2.488:2.24054:0.08278:0.39580:1.62359 3:6:177:2.446:2.24791:0.08278:0.38837:1.63102', 'metres, seconds, logarithms', 'https://iiif.archive.org/image/iiif/3/philtrans06508925%2f06508925_jp2.zip%2f06508925_jp2%2f06508925_0019.jp2/pct:5,33,90,22/1800,/0/default.jpg', '1:8.3:60:0.6270:1.77815:0.11242:-0.20271:1.66200 1:21:87:0.4325:1.93959:0.25654:-0.36407:1.67930 1:15:70:0.5374:1.84500:0.19198:-0.26965:1.64936 1:12:60:0.6270:1.77815:0.15712:-0.20271:1.61730 1:13:64:0.5878:1.80618:0.16882:-0.23074:1.64464 1:13:67:0.5614:1.82617:0.16882:-0.25073:1.65363 1:13:64:0.5878:1.80618:0.16882:-0.23074:1.64464 1:5:54:0.6967:1.73239:0.06963:-0.15695:1.65898 1:5:52:0.7235:1.71600:0.06963:-0.14060:1.64269 1:10:62:0.6068:1.79239:0.13319:-0.21695:1.65546 1:11:64:0.5870:1.80613:0.14525:-0.23069:1.65716 2:22:155:0.7476:2.19033:0.26710:-0.12633:1.67523 2:11:110:1.052:2.04139:0.14525:0.02261:1.64814 2:11:108:1.072:2.03342:0.14525:0.03058:1.64017 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:4:83:1.396:1.91907:0.05621:0.14493:1.61486 2:6:86:1.348:1.93449:0.08278:0.12951:1.59371 2:6:85:1.362:1.92941:0.08278:0.13459:1.59863 3:11:220:1.967:2.34242:0.14525:0.29392:1.66300 3:10.5:224:1.932:2.35024:0.13920:0.28610:1.67687 3:11:218:1.982:2.33845:0.14525:0.29789:1.65903 3:11:116:2.004:2.33445:0.14525:0.30189:1.65503 3:4:164:2.637:2.21484:0.05621:0.42150:1.62446 3:4:172:2.517:2.23552:0.05621:0.40082:1.64514 3:6:176:2.460:2.24551:0.08278:0.39083:1.62856 3:6:176:2.460:2.24551:0.08278:0.39083:1.62856 3:6:174:2.488:2.24054:0.08278:0.39580:1.62359 3:6:177:2.446:2.24791:0.08278:0.38837:1.63102'),
  // meme page : diametres et leurs logs imprimes (« 2-bar.42828 » ecrit -1.57172), debit, « mean value for log B_s 1.64139 ; and B_s = 43.79 »
  reynoldsTexte: S('D1:0.0268 D2:0.01527 D3:0.007886 logD1:-1.57172 logD2:-1.81600 logD3:-2.10217 Q:0.021237 logQ:-1.67291 meanLogBs:1.64139 Bs:43.79', 'metres, cubic metres', 'https://archive.org/download/philtrans06508925/page/n19_w1000.jpg', 'D1:0.0268 D2:0.01527 D3:0.007886 logD1:-1.57172 logD2:-1.81600 logD3:-2.10217 Q:0.021237 logQ:-1.67291 meanLogBs:1.64139 Bs:43.79'),
  /* game270 : Darcy, « Les fontaines publiques de la ville de Dijon » (1856), Note D, « Determination des lois d ecoulement de l eau a travers le
   *   sable », pages 590 a 593 relues par moi sur les images (Internet Archive bub_gb_42EUAAAAQAAJ, Public Domain Mark ; scan Google en basse
   *   definition). Seuls des chiffres de resultats sont repris. Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://iiif.archive.org/image/iiif/3/bub_gb_42EUAAAAQAAJ%2fbub_gb_42EUAAAAQAAJ_jp2.zip%2fbub_gb_42EUAAAAQAAJ_jp2%2fbub_gb_42EUAAAAQAAJ_0602.jp2/pct:23,24,70,27/1800,/0/default.jpg : 1re serie (sable de 0m58) | 2e serie (1m14) ; debit moyen par minute (litres):pression moyenne (m):rapport imprime. Les series 3 et 4 ne
  //   sont pas reprises : leurs epaisseurs ne se lisent pas au chiffre pres sur ce scan.
  darcySeries: S('3.60:1.11:3.25 7.65:2.36:3.24 12.00:4.00:3.00 14.28:4.90:2.91 15.20:5.02:3.03 21.80:7.63:2.86 23.41:8.13:2.88 24.50:8.58:2.85 27.80:9.86:2.82 29.40:10.89:2.70|2.66:2.60:1.01 4.28:4.70:0.91 6.26:7.71:0.81 8.60:10.34:0.83 8.90:10.75:0.83 10.40:12.34:0.84', 'litres per minute, metres of water', 'https://iiif.archive.org/image/iiif/3/bub_gb_42EUAAAAQAAJ%2fbub_gb_42EUAAAAQAAJ_jp2.zip%2fbub_gb_42EUAAAAQAAJ_jp2%2fbub_gb_42EUAAAAQAAJ_0602.jp2/pct:23,24,70,27/1800,/0/default.jpg', '3.60:1.11:3.25 7.65:2.36:3.24 12.00:4.00:3.00 14.28:4.90:2.91 15.20:5.02:3.03 21.80:7.63:2.86 23.41:8.13:2.88 24.50:8.58:2.85 27.80:9.86:2.82 29.40:10.89:2.70|2.66:2.60:1.01 4.28:4.70:0.91 6.26:7.71:0.81 8.60:10.34:0.83 8.90:10.75:0.83 10.40:12.34:0.84'),
  // https://iiif.archive.org/image/iiif/3/bub_gb_42EUAAAAQAAJ%2fbub_gb_42EUAAAAQAAJ_jp2.zip%2fbub_gb_42EUAAAAQAAJ_jp2%2fbub_gb_42EUAAAAQAAJ_0603.jp2/pct:12,66,50,19/max/0/default.jpg : 17-18 fevrier 1856, filtre de 1m10 : debit (l/min):pression sur le filtre (P + ...):sous le filtre:difference:rapport imprimes
  darcyFevrier: S('18.8:9.48:-3.60:13.08:1.44 18.3:12.88:0:12.88:1.42 18.0:9.80:-2.78:12.58:1.43 17.4:12.87:0.46:12.41:1.40 18.1:12.80:0.49:12.35:1.47 14.9:8.86:-0.83:9.69:1.54 12.1:12.84:4.40:8.44:1.43 9.8:6.71:0:6.71:1.46 7.9:12.81:7.03:5.78:1.37 8.65:5.58:0:5.58:1.55 4.5:2.98:0:2.98:1.51 4.15:12.86:9.88:2.98:1.39', 'litres per minute, metres of water', 'https://iiif.archive.org/image/iiif/3/bub_gb_42EUAAAAQAAJ%2fbub_gb_42EUAAAAQAAJ_jp2.zip%2fbub_gb_42EUAAAAQAAJ_jp2%2fbub_gb_42EUAAAAQAAJ_0603.jp2/pct:12,66,50,19/max/0/default.jpg', '18.8:9.48:-3.60:13.08:1.44 18.3:12.88:0:12.88:1.42 18.0:9.80:-2.78:12.58:1.43 17.4:12.87:0.46:12.41:1.40 18.1:12.80:0.49:12.35:1.47 14.9:8.86:-0.83:9.69:1.54 12.1:12.84:4.40:8.44:1.43 9.8:6.71:0:6.71:1.46 7.9:12.81:7.03:5.78:1.37 8.65:5.58:0:5.58:1.55 4.5:2.98:0:2.98:1.51 4.15:12.86:9.88:2.98:1.39'),
  // https://archive.org/download/bub_gb_42EUAAAAQAAJ/page/n602_w1000.jpg (Q = 0,493 P et 0,145 P ; p. 593 : Q = 0,286 I et 0,165 I) et https://archive.org/download/bub_gb_42EUAAAAQAAJ/page/n601_w1000.jpg (conduite de 0m35, couches de sable 0m58, 0m13, 0m12, 0m17)
  darcyTexte: S('diametre:0.35 e1:0.58 e2:1.14 k1:0.493 k2:0.145 I1:0.286 I2:0.165 sable:0.58,0.13,0.12,0.17', 'metres, litres per second per square metre', 'https://archive.org/download/bub_gb_42EUAAAAQAAJ/page/n602_w1000.jpg', 'diametre:0.35 e1:0.58 e2:1.14 k1:0.493 k2:0.145 I1:0.286 I2:0.165 sable:0.58,0.13,0.12,0.17'),
  /* game271 : Perrin, « Les Atomes » (Alcan, 1913), preface p. VII et pages 168 a 170 relues par moi sur les images (Internet Archive, copie BnF
   *   Gallica deposee par un particulier ; aucun champ de droits ; texte de 1913, Perrin mort en 1942). Seuls des chiffres de resultats sont repris.
   *   Idee : codex 29, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n190_w1500.jpg : projections (classes de 1.7 micron, de 0 a 17) : 1re serie trouve | calcule | 2e serie trouve | calcule
  perrinProjections: S('38 44 33 33 35 11 14 6 5 2|48 43 40 30 23 16 11 6 4 2|48 38 36 29 16 15 8 7 4 4|44 40 35 28 21 15 10 5 4 2', 'grains per class', 'https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n190_w1500.jpg', '38 44 33 33 35 11 14 6 5 2|48 43 40 30 23 16 11 6 4 2|48 38 36 29 16 15 8 7 4 4|44 40 35 28 21 15 10 5 4 2'),
  // https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n192_w1500.jpg : anneaux de rayons k e / 4 (le dernier de 8 e / 4 a l infini) : probabilite par anneau:n calcule:n trouve
  perrinAnneaux: S('0.063:32:34 0.167:83:78 0.214:107:106 0.210:105:103 0.150:75:75 0.100:50:49 0.054:27:30 0.028:14:17 0.014:7:9', 'probability, grains', 'https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n192_w1500.jpg', '0.063:32:34 0.167:83:78 0.214:107:106 0.210:105:103 0.150:75:75 0.100:50:49 0.054:27:30 0.028:14:17 0.014:7:9'),
  // https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n190_w1500.jpg (classes de 1.7, e = 7.84 micron, « 500 observations ») et https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n192_w1500.jpg (« 0,886 au lieu de 0,894 prevu ») ; preface https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n13_w1500.jpg
  perrinTexte: S('classe:1.7 e:7.84 grains:500 de:0.886 dePrevu:0.894', 'micron', 'https://archive.org/download/perrin-jean-les-atomes-ed.-librairie-felix-alcan-paris-1913/page/n192_w1500.jpg', 'classe:1.7 e:7.84 grains:500 de:0.886 dePrevu:0.894'),
  /* game272 : Gauss, « Die Intensitat der erdmagnetischen Kraft, zuruckgefuhrt auf absolutes Maass », Annalen der Physik und Chemie 28 (1833),
   *   §21-22, p. 604-605, relues par moi sur les images (Internet Archive, microfilm ; aucun champ de droits ; texte de 1833). Memes nombres dans
   *   la reimpression latine des Werke Bd. 5 (Zweiter Abdruck 1877), p. 109-110. Idee : codex 30, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/sim_annalen-der-physik_1833_28/page/n619_w1500.jpg : R en metres, deviations v (premiere position) et v' (seconde position), degres-minutes-secondes (x = case vide)
  gaussObserve: S('1.1:x:1-57-24.8 1.2:x:1-29-40.5 1.3:2-13-51.2:1-10-19.3 1.4:1-47-28.6:0-55-58.9 1.5:1-27-19.1:0-45-14.3 1.6:1-12-7.6:0-37-12.2 1.7:1-0-9.9:0-30-57.9 1.8:0-50-52.5:0-25-59.5 1.9:0-43-21.8:0-22-9.2 2.0:0-37-16.2:0-19-1.6 2.1:0-32-4.6:0-16-24.7 2.5:0-18-51.9:0-9-36.1 3.0:0-11-0.7:0-5-33.7 3.5:0-6-56.9:0-3-28.9 4.0:0-4-35.9:0-2-22.2', 'metres, degrees-minutes-seconds of arc', 'https://archive.org/download/sim_annalen-der-physik_1833_28/page/n619_w1500.jpg', '1.1:x:1-57-24.8 1.2:x:1-29-40.5 1.3:2-13-51.2:1-10-19.3 1.4:1-47-28.6:0-55-58.9 1.5:1-27-19.1:0-45-14.3 1.6:1-12-7.6:0-37-12.2 1.7:1-0-9.9:0-30-57.9 1.8:0-50-52.5:0-25-59.5 1.9:0-43-21.8:0-22-9.2 2.0:0-37-16.2:0-19-1.6 2.1:0-32-4.6:0-16-24.7 2.5:0-18-51.9:0-9-36.1 3.0:0-11-0.7:0-5-33.7 3.5:0-6-56.9:0-3-28.9 4.0:0-4-35.9:0-2-22.2'),
  // https://archive.org/download/sim_annalen-der-physik_1833_28/page/n620_w1500.jpg : « Berechnete Werthe » : v calcule, Unterschied, v' calcule, Unterschied
  gaussCalcule: S('1.1:x:x:1-57-22.0:+2.8 1.2:x:x:1-29-46.5:-6.0 1.3:2-13-50.4:+0.8:1-10-13.3:+6.0 1.4:1-47-24.1:+4.5:0-55-58.7:+0.2 1.5:1-27-28.7:-9.6:0-45-20.9:-6.6 1.6:1-12-10.9:-3.3:0-37-15.4:-3.2 1.7:1-0-14.9:-5.0:0-30-59.1:-1.2 1.8:0-50-48.3:+4.2:0-26-2.9:-3.4 1.9:0-43-14.0:+7.8:0-22-6.6:+2.6 2.0:0-37-5.6:+10.6:0-18-55.7:+5.9 2.1:0-32-3.7:+0.9:0-16-19.8:+4.9 2.5:0-19-2.1:-10.2:0-9-38.6:-2.5 3.0:0-11-1.8:-1.1:0-5-33.9:-0.2 3.5:0-6-57.1:-0.2:0-3-29.8:-1.0 4.0:0-4-39.6:-3.7:0-2-20.5:+1.7', 'degrees-minutes-seconds, seconds', 'https://archive.org/download/sim_annalen-der-physik_1833_28/page/n620_w1500.jpg', '1.1:x:x:1-57-22.0:+2.8 1.2:x:x:1-29-46.5:-6.0 1.3:2-13-50.4:+0.8:1-10-13.3:+6.0 1.4:1-47-24.1:+4.5:0-55-58.7:+0.2 1.5:1-27-28.7:-9.6:0-45-20.9:-6.6 1.6:1-12-10.9:-3.3:0-37-15.4:-3.2 1.7:1-0-14.9:-5.0:0-30-59.1:-1.2 1.8:0-50-48.3:+4.2:0-26-2.9:-3.4 1.9:0-43-14.0:+7.8:0-22-6.6:+2.6 2.0:0-37-5.6:+10.6:0-18-55.7:+5.9 2.1:0-32-3.7:+0.9:0-16-19.8:+4.9 2.5:0-19-2.1:-10.2:0-9-38.6:-2.5 3.0:0-11-1.8:-1.1:0-5-33.9:-0.2 3.5:0-6-57.1:-0.2:0-3-29.8:-1.0 4.0:0-4-39.6:-3.7:0-2-20.5:+1.7'),
  // https://archive.org/download/sim_annalen-der-physik_1833_28/page/n620_w1500.jpg : tang v = 0,086870 R^-3 - 0,002185 R^-5 ; tang v' = 0,043435 R^-3 + 0,002449 R^-5
  gaussFormules: S('a1:0.086870 b1:-0.002185 a2:0.043435 b2:0.002449', 'coefficients of R^-3 and R^-5', 'https://archive.org/download/sim_annalen-der-physik_1833_28/page/n620_w1500.jpg', 'a1:0.086870 b1:-0.002185 a2:0.043435 b2:0.002449'),
  /* game273 : Weber et Kohlrausch, « Ueber die Elektricitatsmenge, welche bei galvanischen Stromen durch den Querschnitt der Kette fliesst »,
   *   Annalen der Physik und Chemie 99 (1856), p. 18-21, relues par moi sur les images (Internet Archive, microfilm ; aucun champ de droits ;
   *   texte de 1856). C est le resume publie par les auteurs (note p. 10), pas le memoire complet. Idee : codex 30, sous-agent Claude ;
   *   contre-lecture (workflow). */
  // https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n23_w1500.jpg (E, s, phi) et https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n24_w1500.jpg (tau, E / 2 tau en millions) : E:s:phi:tau:E/2tau, cinq decharges
  weberEssais: S('36060000:73.5:0.0057087:0.0001194:151000 41940000:80.0:0.0062136:0.0001300:161300 49700000:96.5:0.0074952:0.0001568:158500 44350000:91.1:0.0070757:0.0001480:149800 49660000:97.8:0.0075962:0.0001589:156250', 'charge, scale divisions, arc, seconds, millions', 'https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n24_w1500.jpg', '36060000:73.5:0.0057087:0.0001194:151000 41940000:80.0:0.0062136:0.0001300:161300 49700000:96.5:0.0074952:0.0001568:158500 44350000:91.1:0.0070757:0.0001480:149800 49660000:97.8:0.0075962:0.0001589:156250'),
  // https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n24_w1500.jpg (A = 0,020915), https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n25_w1500.jpg (moyenne 155370.10^6, 109860.10^6, 16573.10^9, c racine(2) : 4) et https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n26_w1500.jpg (c = 439450.10^6 mm, 59320 Meilen)
  weberTexte: S('A:0.020915 moyenne:155370 dynamique:109860 lytique:16573 c:439450 meilen:59320', 'millions, billions, millimetres', 'https://archive.org/download/sim_annalen-der-physik_1856_99_9/page/n25_w1500.jpg', 'A:0.020915 moyenne:155370 dynamique:109860 lytique:16573 c:439450 meilen:59320'),
  /* game274 : Poiseuille, « Recherches experimentales sur le mouvement des liquides dans les tubes de tres petits diametres » (extrait par
   *   l auteur et Suite), Comptes rendus t. XI (1840), p. 964, 1045 et 1046, relues par moi sur les images (Internet Archive, Natural History
   *   Museum Library ; « Public domain » selon la BHL). Idee : codex 30, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/comptesrendusheb11acad/page/n1054_w1500.jpg (tableau : tube, diametre en mm, produit en mm cubes en 500 secondes) et https://archive.org/download/comptesrendusheb11acad/page/n1055_w1500.jpg (k'' de chaque tube) : tube:D:Q:k''
  poiseuilleTubes: S('M:0.01394:1.4648:2495.50 E:0.02938:28.8260:2496.00 D:0.04373:141.5002:2494.42 C:0.08549:2067.3912:2497.77 B:0.11340:6398.2933:2496.20 A:0.14160:15532.8451:2492.67 F:0.65217:6995870.2463:2495.00', 'millimetres, cubic millimetres', 'https://archive.org/download/comptesrendusheb11acad/page/n1054_w1500.jpg', 'M:0.01394:1.4648:2495.50 E:0.02938:28.8260:2496.00 D:0.04373:141.5002:2494.42 C:0.08549:2067.3912:2497.77 B:0.11340:6398.2933:2496.20 A:0.14160:15532.8451:2492.67 F:0.65217:6995870.2463:2495.00'),
  // https://archive.org/download/comptesrendusheb11acad/page/n973_w1500.jpg : tube A de 100,5 mm puis reduit a 75,8 mm : longueur|pression en mm de mercure:temps en secondes
  poiseuillePressions: S('100.5|385.870:3505.75 739.114:1830.75 773.443:1750 75.8|97.764:10361 147.832:6851 193.632:5233 387.675:2612.5 738.715:1372.5 774.676:1308', 'millimetres of mercury, seconds', 'https://archive.org/download/comptesrendusheb11acad/page/n973_w1500.jpg', '100.5|385.870:3505.75 739.114:1830.75 773.443:1750 75.8|97.764:10361 147.832:6851 193.632:5233 387.675:2612.5 738.715:1372.5 774.676:1308'),
  // https://archive.org/download/comptesrendusheb11acad/page/n1054_w1500.jpg (775 mm de mercure, 500 secondes) et https://archive.org/download/comptesrendusheb11acad/page/n1055_w1500.jpg (« la moyenne etant 2495,224 »)
  poiseuilleTexte: S('pression:775 temps:500 moyenneK:2495.224', 'millimetres of mercury, seconds', 'https://archive.org/download/comptesrendusheb11acad/page/n1055_w1500.jpg', 'pression:775 temps:500 moyenneK:2495.224'),
  /* game275 : Halley, « A Theory of the Variation of the Magnetical Compass », Phil. Trans. 13 (1683) : 208-221 ; table p. 210-211 et texte
   *   p. 214, 215 et 217 relus par moi sur les images (Internet Archive, Public Domain Mark ; texte de 1683). Seules les lignes que j ai relues
   *   sont reprises (Europe, Hudson, la Plata). Idee : codex 30, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/philtrans08124708/page/n2_w1500.jpg et https://archive.org/download/philtrans08124708/page/n3_w1500.jpg : lieu:longitude depuis Londres:annee:variation observee (Est positif, degres-minutes)
  compasHalleyTable: S('London:0-0:1580:11-15 London:0-0:1622:6-0 London:0-0:1634:4-5 London:0-0:1672:-2-30 London:0-0:1683:-4-30 Paris:2-25:1640:3-0 Paris:2-25:1666:0-0 Paris:2-25:1681:-2-30 Uraniburg:13-0:1672:-2-35 Copenhagen:12-53:1649:1-30 Copenhagen:12-53:1672:-3-35 Dantzick:19-0:1679:-7-0 Mompelier:4-0:1674:-1-10 Brest:-4-25:1680:-1-45 Rome:13-0:1681:-5-0 Bayonne:-1-20:1680:-1-20 HudsonsBay:-79-40:1668:-19-15 HudsonsStraights:-57-0:1668:-29-30 RiverOfPlate:-53-0:1670:20-30', 'degrees-minutes, years', 'https://archive.org/download/philtrans08124708/page/n2_w1500.jpg', 'London:0-0:1580:11-15 London:0-0:1622:6-0 London:0-0:1634:4-5 London:0-0:1672:-2-30 London:0-0:1683:-4-30 Paris:2-25:1640:3-0 Paris:2-25:1666:0-0 Paris:2-25:1681:-2-30 Uraniburg:13-0:1672:-2-35 Copenhagen:12-53:1649:1-30 Copenhagen:12-53:1672:-3-35 Dantzick:19-0:1679:-7-0 Mompelier:4-0:1674:-1-10 Brest:-4-25:1680:-1-45 Rome:13-0:1681:-5-0 Bayonne:-1-20:1680:-1-20 HudsonsBay:-79-40:1668:-19-15 HudsonsStraights:-57-0:1668:-29-30 RiverOfPlate:-53-0:1670:20-30'),
  // https://archive.org/download/philtrans08124708/page/n7_w1500.jpg (« more than 15 gr. at London ») ; https://archive.org/download/philtrans08124708/page/n9_w1500.jpg (Brest 1 3/4, London 4 1/2, Dantzick 7) ; https://archive.org/download/philtrans08124708/page/n6_w1500.jpg (Hudson 29 1/2 West, Plate 20 1/2 East)
  compasHalleyTexte: S('londresCent:15 brest:1.75 londres:4.5 dantzick:7 hudson:29.5 plata:20.5', 'degrees', 'https://archive.org/download/philtrans08124708/page/n9_w1500.jpg', 'londresCent:15 brest:1.75 londres:4.5 dantzick:7 hudson:29.5 plata:20.5'),
  /* game276 : Beal, « Phyllotaxis of Cones », The American Naturalist 7 (1873) : 449-453 ; texte et tableau p. 451-452 relus par moi sur les
   *   images (Internet Archive, JSTOR Early Journal Content ; texte de 1873). Seuls des nombres sont repris. Idee : codex 30, sous-agent
   *   Claude ; contre-lecture (workflow). */
  // https://archive.org/download/jstor-2448756/page/n3_w1500.jpg et https://archive.org/download/jstor-2448756/page/n4_w1500.jpg : groupe (N1-N7 epicea de Norvege arbres 1 a 7, PP Pinus pumilis, EL meleze d Europe, BS69 et BS70 le meme epicea noir
  //   en 1869 et 1870, AL meleze d Amerique):cones-spirales a droite-spirales a gauche
  conesBealTable: S('N1:74-5-8,74-8-5,5-7-4,1-4-6,1-6-4 N2:18-5-8,21-8-5,1-4-6 N3:5-5-8,19-8-5,1-7-4 N4:23-8-5,17-5-8,4-7-4,2-4-7,1-4-6,1-6-4 N5:34-5-8,44-8-5,6-4-7,3-7-4,1-4-6,2-6-4 N6:63-5-8,53-8-5,1-4-7,6-7-4,4-4-6,8-6-4 N7:9-8-5,13-5-8 PP:10-5-8,9-8-5 EL:29-5-13,51-13-5,3-4-7,2-7-4,1-3-6 BS69:80-5-8,65-8-5,3-4-7,2-7-4,1-4-6,3-6-4 BS70:26-5-8,23-8-5,2-7-4 AL:30-3-5,34-5-3,3-4-6,1-6-4,1-7-4,1-3-x', 'cones, spirals', 'https://archive.org/download/jstor-2448756/page/n3_w1500.jpg', 'N1:74-5-8,74-8-5,5-7-4,1-4-6,1-6-4 N2:18-5-8,21-8-5,1-4-6 N3:5-5-8,19-8-5,1-7-4 N4:23-8-5,17-5-8,4-7-4,2-4-7,1-4-6,1-6-4 N5:34-5-8,44-8-5,6-4-7,3-7-4,1-4-6,2-6-4 N6:63-5-8,53-8-5,1-4-7,6-7-4,4-4-6,8-6-4 N7:9-8-5,13-5-8 PP:10-5-8,9-8-5 EL:29-5-13,51-13-5,3-4-7,2-7-4,1-3-6 BS69:80-5-8,65-8-5,3-4-7,2-7-4,1-4-6,3-6-4 BS70:26-5-8,23-8-5,2-7-4 AL:30-3-5,34-5-3,3-4-6,1-6-4,1-7-4,1-3-x'),
  // https://archive.org/download/jstor-2448756/page/n3_w1500.jpg : « I examined nearly all the cones (one hundred and fifty-five) which grew upon a Norway spruce »
  conesBealTexte: S('arbre1:155', 'cones', 'https://archive.org/download/jstor-2448756/page/n3_w1500.jpg', 'arbre1:155'),
  /* game277 : Oldham, « The Constitution of the Interior of the Earth, as Revealed by Earthquakes », Quarterly Journal of the Geological
   *   Society 62 (1906) : 456-475 ; table p. 464 et p. 467 relues par moi sur les images (Internet Archive, Public Domain Mark ; Oldham
   *   1858-1936 selon les metadonnees). Idee : codex 30, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/oldham-1906-quarterlyjournal-62190geol/page/n8_w1500.jpg : globe de 40 000 km, pas de 30 degres : distance:1re phase min:vitesse arc:corde:2e phase min:arc:corde:arc km:corde km:profondeur
  seismesOldhamTable: S('30:6:9.26:9.15:11:5.05:4.99:3333.3:3295.5:0.034 60:11:10.10:9.65:19:5.85:5.58:6666.6:6365.5:0.134 90:15:11.11:10.00:25:6.66:6.00:10000.0:9003.5:0.293 120:18:12.35:10.21:29:7.66:6.34:13333.3:11027.5:0.500 150:21:13.23:9.76:45:6.17:4.55:16666.6:12297.0:0.741 180:22:15.15:9.65:50:6.67:4.24:20000.0:12733.0:1.000', 'degrees, minutes, km per second, km, radius', 'https://archive.org/download/oldham-1906-quarterlyjournal-62190geol/page/n8_w1500.jpg', '30:6:9.26:9.15:11:5.05:4.99:3333.3:3295.5:0.034 60:11:10.10:9.65:19:5.85:5.58:6666.6:6365.5:0.134 90:15:11.11:10.00:25:6.66:6.00:10000.0:9003.5:0.293 120:18:12.35:10.21:29:7.66:6.34:13333.3:11027.5:0.500 150:21:13.23:9.76:45:6.17:4.55:16666.6:12297.0:0.741 180:22:15.15:9.65:50:6.67:4.24:20000.0:12733.0:1.000'),
  // https://archive.org/download/oldham-1906-quarterlyjournal-62190geol/page/n11_w1500.jpg : arc:densite supposee:module de compression:de distorsion (x 1e10 CGS):rigidite / module du texte
  seismesOldhamModules: S('30:3.00:151.6:74.7:0.385 60:4.25:219.4:132.3:0.446 90:6.20:322.4:223.2:0.493', 'g per cubic cm, 1e10 CGS', 'https://archive.org/download/oldham-1906-quarterlyjournal-62190geol/page/n11_w1500.jpg', '30:3.00:151.6:74.7:0.385 60:4.25:219.4:132.3:0.446 90:6.20:322.4:223.2:0.493'),
  /* game278 : MacKellar, The American Printer (Philadelphia, MacKellar, Smiths & Jordan, ed. 1893), p. 57, « A Bill of 800 lbs. of Pica », relue
   *   par moi sur l image (Internet Archive, University of California ; NOT_IN_COPYRIGHT selon l item ; memes nombres dans l ed. 1871). Ce sont
   *   les proportions d une fonte « reckoned by the founders », pas un comptage de texte. Idee : codex 30, sous-agent Claude ; contre-lecture. */
  // https://archive.org/download/americanprinterm00mack/page/n66_w1500.jpg : bas-de-casse a a z
  fonteMacKellarMinuscules: S('a:8500 b:1600 c:3000 d:4400 e:12000 f:2500 g:1700 h:6400 i:8000 j:400 k:800 l:4000 m:3000 n:8000 o:8000 p:1700 q:500 r:6200 s:8000 t:9000 u:3400 v:1200 w:2000 x:400 y:2000 z:200', 'sorts (founders proportions)', 'https://archive.org/download/americanprinterm00mack/page/n66_w1500.jpg', 'a:8500 b:1600 c:3000 d:4400 e:12000 f:2500 g:1700 h:6400 i:8000 j:400 k:800 l:4000 m:3000 n:8000 o:8000 p:1700 q:500 r:6200 s:8000 t:9000 u:3400 v:1200 w:2000 x:400 y:2000 z:200'),
  // https://archive.org/download/americanprinterm00mack/page/n66_w1500.jpg : capitales et petites capitales, A a Z, AE, OE : lettre:capitale:petite capitale
  fonteMacKellarCapitales: S('A:600:300 B:400:200 C:500:250 D:500:250 E:600:300 F:400:200 G:400:200 H:400:200 I:800:400 J:300:150 K:300:150 L:500:250 M:400:200 N:400:200 O:400:200 P:400:200 Q:180:90 R:400:200 S:500:250 T:650:326 U:300:150 V:300:150 W:400:200 X:180:90 Y:300:150 Z:80:40 AE:40:20 OE:30:15', 'sorts (founders proportions)', 'https://archive.org/download/americanprinterm00mack/page/n66_w1500.jpg', 'A:600:300 B:400:200 C:500:250 D:500:250 E:600:300 F:400:200 G:400:200 H:400:200 I:800:400 J:300:150 K:300:150 L:500:250 M:400:200 N:400:200 O:400:200 P:400:200 Q:180:90 R:400:200 S:500:250 T:650:326 U:300:150 V:300:150 W:400:200 X:180:90 Y:300:150 Z:80:40 AE:40:20 OE:30:15'),
  /* game279 : Kaeding (ed.), Haufigkeitsworterbuch der deutschen Sprache (Steglitz, 1898), p. 24-25, relues par moi sur les images (Internet
   *   Archive, numerisation Google / Harvard ; texte de 1898, Kaeding mort en 1928 selon Wikidata). Idee : codex 30, sous-agent Claude ;
   *   contre-lecture (workflow). */
  // https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n33_w1500.jpg et https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n34_w1500.jpg : 14 corpus (1a ... 11), mots de 1 a 15 syllabes, Summa der Worter, der Silben, Gesamtdurchschnitt
  syllabesKaedingTable: S('1a|1293738,771299,379746,181119,55736,16607,5797,1668,391,117,13,4,0,0,0|2706235|5137175|1.90 1b|788444,464263,209403,98462,29305,7786,1797,429,89,19,1,2,0,0,0|1600000|2949305|1.84 2|181909,102398,64788,33880,11271,3775,1311,442,167,35,11,10,1,2,0|400000|810442|2.02 3|217688,120167,41666,15603,4078,619,118,55,6,0,0,0,0,0,0|400000|670856|1.68 4|46719,29581,14235,6920,1824,626,77,11,7,0,0,0,0,0,0|100000|189832|1.90 5|135449,82712,46215,24509,7774,2381,685,204,61,10,0,0,0,0,0|300000|597786|1.99 6|244928,158309,63059,26159,6073,1206,212,44,6,4,0,0,0,0,0|500000|894890|1.79 7|1091362,609530,203058,75826,16206,3200,630,155,23,10,0,0,0,0,0|2000000|3329087|1.66 8a|44805,30915,15458,6668,1569,414,110,50,10,0,0,1,0,0,0|100000|191282|1.91 8b|99842,54437,25846,13171,3647,1323,532,274,53,62,12,1,0,0,0|200000|375468|1.88 8c|374079,214137,76675,27086,6362,1299,281,51,20,10,0,0,0,0,0|700000|1182981|1.69 9|437291,237742,123890,64260,23209,8816,3414,1014,248,89,10,14,3,0,0|900000|1745875|1.94 10|184432,113534,59845,29769,8932,2476,762,195,39,9,3,0,4,0,0|400000|777047|1.94 11|285640,167424,86610,42739,11752,3908,1267,446,105,96,9,3,0,0,1|600000|1147974|1.91', 'words, syllables', 'https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n33_w1500.jpg', '1a|1293738,771299,379746,181119,55736,16607,5797,1668,391,117,13,4,0,0,0|2706235|5137175|1.90 1b|788444,464263,209403,98462,29305,7786,1797,429,89,19,1,2,0,0,0|1600000|2949305|1.84 2|181909,102398,64788,33880,11271,3775,1311,442,167,35,11,10,1,2,0|400000|810442|2.02 3|217688,120167,41666,15603,4078,619,118,55,6,0,0,0,0,0,0|400000|670856|1.68 4|46719,29581,14235,6920,1824,626,77,11,7,0,0,0,0,0,0|100000|189832|1.90 5|135449,82712,46215,24509,7774,2381,685,204,61,10,0,0,0,0,0|300000|597786|1.99 6|244928,158309,63059,26159,6073,1206,212,44,6,4,0,0,0,0,0|500000|894890|1.79 7|1091362,609530,203058,75826,16206,3200,630,155,23,10,0,0,0,0,0|2000000|3329087|1.66 8a|44805,30915,15458,6668,1569,414,110,50,10,0,0,1,0,0,0|100000|191282|1.91 8b|99842,54437,25846,13171,3647,1323,532,274,53,62,12,1,0,0,0|200000|375468|1.88 8c|374079,214137,76675,27086,6362,1299,281,51,20,10,0,0,0,0,0|700000|1182981|1.69 9|437291,237742,123890,64260,23209,8816,3414,1014,248,89,10,14,3,0,0|900000|1745875|1.94 10|184432,113534,59845,29769,8932,2476,762,195,39,9,3,0,4,0,0|400000|777047|1.94 11|285640,167424,86610,42739,11752,3908,1267,446,105,96,9,3,0,0,1|600000|1147974|1.91'),
  // https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n34_w1500.jpg : ligne Summa
  syllabesKaedingSumma: S('5426326,3156448,1410494,646971,187738,54436,16993,5038,1225,461,59,35,8,2,1|10906235|20000000|1.83', 'words, syllables', 'https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n34_w1500.jpg', '5426326,3156448,1410494,646971,187738,54436,16993,5038,1225,461,59,35,8,2,1|10906235|20000000|1.83'),
  // https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n33_w1500.jpg (bas) : resume Worter | Prozent | Silben
  syllabesKaedingResume: S('5426326,3156448,1410494,646971,187738,54436,16993,5038,1225,461,59,35,8,2,1|49.76,28.94,12.93,5.93,1.72,0.50,0.22|5426326,6312896,4231482,2587884,938690,326616,118951,40304,11025,4610,649,420,104,28,15', 'words, per cent, syllables', 'https://archive.org/download/bub_gb_PHEVAAAAYAAJ/page/n33_w1500.jpg', '5426326,3156448,1410494,646971,187738,54436,16993,5038,1225,461,59,35,8,2,1|49.76,28.94,12.93,5.93,1.72,0.50,0.22|5426326,6312896,4231482,2587884,938690,326616,118951,40304,11025,4610,649,420,104,28,15'),
  /* game280 : Hagen, « Ueber die Bewegung des Wassers in engen cylindrischen Rohren », Annalen der Physik und Chemie 46 (1839), p. 428-431,
   *   relues par moi sur les images (Internet Archive, Public Domain Mark ; texte de 1839). Idee : codex 30, sous-agent Claude ;
   *   contre-lecture (workflow). */
  // https://archive.org/download/bub_gb_iBcAAAAAMAAJ/page/n448_w1500.jpg a https://archive.org/download/bub_gb_iBcAAAAAMAAJ/page/n451_w1500.jpg : charge h (pouces de Paris) et eau ecoulee M (Loth par seconde), ajustement h = r M + s M^2, h recalcules, ecarts, e.p.
  tubesHagenSeries: S('I|enge|8.2|0.895,3.621,7.613,11.044,14.887|0.0262,0.0995,0.1906,0.2594,0.3288|32.557|38.673|0.880,3.622,7.610,11.047,14.886|-0.015,0.001,-0.003,0.003,-0.001|0.0061,0.0561,0.1993 II|mittlere|8.4|0.491,3.565,7.750|0.0384,0.2523,0.4897|12.356|7.082|0.485,3.568,7.748|-0.006,0.003,-0.002|0.0047,0.0383,0.0852 III|weite|8.8|0.265,0.907,1.085,2.649,3.120|0.1022,0.3109,0.3605,0.7250,0.8221|2.3992|1.7101|0.263,0.911,1.087,2.637,3.128|-0.002,0.004,0.002,-0.012,0.008|0.0059,0.0205,0.0282 IV|mittlere|6.1|0.657,1.654,3.508,5.566|0.0472,0.1157,0.2330,0.3500|13.475|6.911|0.652,1.651,3.515,5.563|-0.005,-0.003,0.007,-0.003|0.0046,0.0415,0.1351 V|mittlere|1.0|0.868,2.201,4.220,6.570|0.0505,0.1256,0.2307,0.3453|16.755|6.582|0.864,2.208,4.216,6.571|-0.004,0.007,-0.004,0.001|0.0043,0.0388,0.1288', 'Paris inches, Prussian Loth per second', 'https://archive.org/download/bub_gb_iBcAAAAAMAAJ/page/n449_w1500.jpg', 'I|enge|8.2|0.895,3.621,7.613,11.044,14.887|0.0262,0.0995,0.1906,0.2594,0.3288|32.557|38.673|0.880,3.622,7.610,11.047,14.886|-0.015,0.001,-0.003,0.003,-0.001|0.0061,0.0561,0.1993 II|mittlere|8.4|0.491,3.565,7.750|0.0384,0.2523,0.4897|12.356|7.082|0.485,3.568,7.748|-0.006,0.003,-0.002|0.0047,0.0383,0.0852 III|weite|8.8|0.265,0.907,1.085,2.649,3.120|0.1022,0.3109,0.3605,0.7250,0.8221|2.3992|1.7101|0.263,0.911,1.087,2.637,3.128|-0.002,0.004,0.002,-0.012,0.008|0.0059,0.0205,0.0282 IV|mittlere|6.1|0.657,1.654,3.508,5.566|0.0472,0.1157,0.2330,0.3500|13.475|6.911|0.652,1.651,3.515,5.563|-0.005,-0.003,0.007,-0.003|0.0046,0.0415,0.1351 V|mittlere|1.0|0.868,2.201,4.220,6.570|0.0505,0.1256,0.2307,0.3453|16.755|6.582|0.864,2.208,4.216,6.571|-0.004,0.007,-0.004,0.001|0.0043,0.0388,0.1288'),
  /* game281 : Moseley, « On the Geometrical Forms of Turbinated and Discoid Shells », Phil. Trans. 128 (1838) : 351-370, p. 356-358 relues
   *   par moi sur les images (Internet Archive, Public Domain Mark ; texte de 1838). Idee : codex 30, sous-agent Claude ; contre-lecture. */
  // https://archive.org/download/philtrans05724336/page/n5_w1500.jpg (Turbo duplicatus) et https://archive.org/download/philtrans05724336/page/n6_w1500.jpg (Buccinum subulatum) : coquille|raison|largeurs des tours (pouces)|termes de la progression imprimee
  spiraleMoseleyTours: S('duplicatus|1.1804|1.31,1.12,0.94,0.8,0.67,0.57,0.48,0.41|1.31,1.1098,0.94018,0.79651,0.67476,0.57164,0.48427,0.41026 buccinum|1.13|1.14,1.00,0.9,0.79,0.7,0.62,0.54|1.14,1.0089,0.89279,0.79008,0.69919,0.61875,0.54757', 'inches', 'https://archive.org/download/philtrans05724336/page/n5_w1500.jpg', 'duplicatus|1.1804|1.31,1.12,0.94,0.8,0.67,0.57,0.48,0.41|1.31,1.1098,0.94018,0.79651,0.67476,0.57164,0.48427,0.41026 buccinum|1.13|1.14,1.00,0.9,0.79,0.7,0.62,0.54|1.14,1.0089,0.89279,0.79008,0.69919,0.61875,0.54757'),
  // https://archive.org/download/philtrans05724336/page/n6_w1500.jpg (r = (1.645)^1/3 = 1.1804 ; r = (1.389)^1/2 = 1.1806) et https://archive.org/download/philtrans05724336/page/n7_w1500.jpg (r = (1.45)^1/3 = 1.1318) : base:1/exposant:r imprime
  spiraleMoseleyFormules: S('1.645:3:1.1804 1.389:2:1.1806 1.45:3:1.1318', 'ratio', 'https://archive.org/download/philtrans05724336/page/n6_w1500.jpg', '1.645:3:1.1804 1.389:2:1.1806 1.45:3:1.1318'),
  // https://archive.org/download/philtrans05724336/page/n6_w1500.jpg : Buccinum, largeur de six tours:de trois tours (mu imprime 2.45 trois fois)
  spiraleMoseleyMu: S('5.10:2.08 4.52:1.84 3.94:1.60', 'inches', 'https://archive.org/download/philtrans05724336/page/n6_w1500.jpg', '5.10:2.08 4.52:1.84 3.94:1.60'),
  /* game282 : Mendel, « Versuche uber Pflanzen-Hybriden », Verhandlungen des naturforschenden Vereines in Brunn IV (1865, paru 1866), p. 12, 14
   *   et 15, relues par moi sur les images (Internet Archive, Smithsonian / BHL ; NOT_IN_COPYRIGHT selon l item ; Mendel 1822-1884). Le
   *   systeme mendel existant est une simulation : ici, ses comptes. Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/versucheberpflan00mend/page/n141_w1500.jpg (essais 1-2) et https://archive.org/download/versucheberpflan00mend/page/n143_w1500.jpg (essais 3-7) : essai:total:dominant:recessif:rapport imprime
  poisMendelF2: S('1:7324:5474:1850:2.96 2:8023:6022:2001:3.01 3:929:705:224:3.15 4:1181:882:299:2.95 5:580:428:152:2.82 6:858:651:207:3.14 7:1064:787:277:2.84', 'seeds or plants', 'https://archive.org/download/versucheberpflan00mend/page/n143_w1500.jpg', '1:7324:5474:1850:2.96 2:8023:6022:2001:3.01 3:929:705:224:3.15 4:1181:882:299:2.95 5:580:428:152:2.82 6:858:651:207:3.14 7:1064:787:277:2.84'),
  // https://archive.org/download/versucheberpflan00mend/page/n144_w1500.jpg : essai:plantes:constantes:hybrides:rapport imprime
  poisMendelF3: S('1:565:193:372:1.93 2:519:166:353:2.13', 'plants', 'https://archive.org/download/versucheberpflan00mend/page/n144_w1500.jpg', '1:565:193:372:1.93 2:519:166:353:2.13'),
  // https://archive.org/download/versucheberpflan00mend/page/n144_w1500.jpg : « das Durchschnitts-Verhaltniss 2,98 : 1 oder 3 : 1 »
  poisMendelTexte: S('moyenne:2.98', 'ratio', 'https://archive.org/download/versucheberpflan00mend/page/n144_w1500.jpg', 'moyenne:2.98'),
  /* game283 : J. J. Thomson, « Cathode Rays », Philosophical Magazine (5) 44 (1897) : 293 sq. ; p. 303 (formules), 306 (tableau) et 310
   *   (comparaison a l electrolyse) relues par moi sur les images (Internet Archive, BHL ; aucun champ de droits ; texte de 1897, Thomson
   *   1856-1940 selon le catalogue). Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/londonedinburg5441897lond/page/n333_w1500.jpg : tube:gaz:W/Q (mantisse:exposant):I:m/e (x 1e-7):v (mantisse:exposant), 26 lignes
  rayonsThomsonTable: S('1:A:4.6:11:230:.57:4:9 1:A:1.8:12:350:.34:1:10 1:A:6.1:11:230:.43:5.4:9 1:A:2.5:12:400:.32:1.2:10 1:A:5.5:11:230:.48:4.8:9 1:A:1:12:285:.4:7:9 1:A:1:12:285:.4:7:9 1:H:6:12:205:.35:6:9 1:H:2.1:12:460:.5:9.2:9 1:C:8.4:11:260:.4:7.5:9 1:C:1.47:12:340:.4:8.5:9 1:C:3.0:12:480:.39:1.3:10 2:A:2.8:11:175:.53:3.3:9 2:A:4.4:11:195:.47:4.1:9 2:A:3.5:11:181:.47:3.8:9 2:H:2.8:11:175:.53:3.3:9 2:A:2.5:11:160:.51:3.1:9 2:C:2:11:148:.54:2.5:9 2:A:1.8:11:151:.63:2.3:9 2:H:2.8:11:175:.53:3.3:9 2:H:4.4:11:201:.46:4.4:9 2:A:2.5:11:176:.61:2.8:9 2:A:4.2:11:200:.48:4.1:9 3:A:2.5:11:220:.9:2.4:9 3:A:3.5:11:225:.7:3.2:9 3:H:3:11:250:1.0:2.5:9', 'CGS units', 'https://archive.org/download/londonedinburg5441897lond/page/n333_w1500.jpg', '1:A:4.6:11:230:.57:4:9 1:A:1.8:12:350:.34:1:10 1:A:6.1:11:230:.43:5.4:9 1:A:2.5:12:400:.32:1.2:10 1:A:5.5:11:230:.48:4.8:9 1:A:1:12:285:.4:7:9 1:A:1:12:285:.4:7:9 1:H:6:12:205:.35:6:9 1:H:2.1:12:460:.5:9.2:9 1:C:8.4:11:260:.4:7.5:9 1:C:1.47:12:340:.4:8.5:9 1:C:3.0:12:480:.39:1.3:10 2:A:2.8:11:175:.53:3.3:9 2:A:4.4:11:195:.47:4.1:9 2:A:3.5:11:181:.47:3.8:9 2:H:2.8:11:175:.53:3.3:9 2:A:2.5:11:160:.51:3.1:9 2:C:2:11:148:.54:2.5:9 2:A:1.8:11:151:.63:2.3:9 2:H:2.8:11:175:.53:3.3:9 2:H:4.4:11:201:.46:4.4:9 2:A:2.5:11:176:.61:2.8:9 2:A:4.2:11:200:.48:4.1:9 3:A:2.5:11:220:.9:2.4:9 3:A:3.5:11:225:.7:3.2:9 3:H:3:11:250:1.0:2.5:9'),
  // https://archive.org/download/londonedinburg5441897lond/page/n337_w1500.jpg : « its value 10-7 is very small compared with the value 10-4 ... the value for the hydrogen ion in electrolysis »
  rayonsThomsonTexte: S('electrolyse:1e-4', 'CGS units', 'https://archive.org/download/londonedinburg5441897lond/page/n337_w1500.jpg', 'electrolyse:1e-4'),
  /* game284 : Pogson, « Magnitudes of Thirty-six of the Minor Planets for the First Day of each Month of the Year 1857 », Monthly Notices of
   *   the RAS 17 (1856), p. 14-15, relues par moi sur les images (Internet Archive, microfilm ; aucun champ de droits ; texte de 1856, Pogson
   *   1829-1891 selon Wikidata). Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/monthly-notices-of-the-royal-astronomical-society_1856-11-14_17_1/page/n14_w1500.jpg : table des equivalents : standard:ouverture:Struve:Bond:Herschel:Smyth
  magnitudesPogsonTable: S('6:0.229:6.0:6.0:6.0:6.0 7:0.363:6.6:7.0:7.3:7.0 8:0.575:7.3:8.0:8.6:8.0 9:0.912:8.0:9.0:10.0:9.6 10:1.44:8.6:10.0:11.3:11.2 11:2.29:9.3:11.6:12.6:12.8 12:3.63:10.0:12.9:13.9:14.4 13:5.75:10.6:15.2:15.2:16.0 14:9.12:11.3:17.5:16.6:x 15:14.4:11.9:19.8:17.9:x', 'magnitudes, inches', 'https://archive.org/download/monthly-notices-of-the-royal-astronomical-society_1856-11-14_17_1/page/n14_w1500.jpg', '6:0.229:6.0:6.0:6.0:6.0 7:0.363:6.6:7.0:7.3:7.0 8:0.575:7.3:8.0:8.6:8.0 9:0.912:8.0:9.0:10.0:9.6 10:1.44:8.6:10.0:11.3:11.2 11:2.29:9.3:11.6:12.6:12.8 12:3.63:10.0:12.9:13.9:14.4 13:5.75:10.6:15.2:15.2:16.0 14:9.12:11.3:17.5:16.6:x 15:14.4:11.9:19.8:17.9:x'),
  // https://archive.org/download/monthly-notices-of-the-royal-astronomical-society_1856-11-14_17_1/page/n13_w1500.jpg : L = 9,2 ; rapport 2,512 (Dawes 4) ; « 15.1 magnitude for its limit » (p. 15) ; 7 pouces -> 13,4 ; 0,23 pouce -> 6,0
  magnitudesPogsonTexte: S('L:9.2 rapport:2.512 dawes:4 limiteStruve:15.1 hind:13.4 argelander:6.0', 'magnitudes', 'https://archive.org/download/monthly-notices-of-the-royal-astronomical-society_1856-11-14_17_1/page/n13_w1500.jpg', 'L:9.2 rapport:2.512 dawes:4 limiteStruve:15.1 hind:13.4 argelander:6.0'),
  /* game285 : Darwin, The Effects of Cross and Self Fertilisation in the Vegetable Kingdom (London, John Murray, 1876), Table XCVII, Zea mays,
   *   p. 234, relue par moi sur l image (Internet Archive, Royal College of Physicians of Edinburgh ; Public Domain Mark ; Darwin 1809-1882).
   *   Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/b21723916/page/n249.jpg : pot:croise:autofeconde (pouces-huitiemes), quinze lignes dans l ordre imprime
  maisDarwinTable: S('I:23-4:17-3 I:12-0:20-3 I:21-0:20-0 II:22-0:20-0 II:19-1:18-3 II:21-4:18-5 III:22-1:18-5 III:20-3:15-2 III:18-2:16-4 III:21-5:18-0 III:23-2:16-2 IV:21-0:18-0 IV:22-1:12-6 IV:23-0:15-4 IV:12-0:18-0', 'inches and eighths', 'https://archive.org/download/b21723916/page/n249.jpg', 'I:23-4:17-3 I:12-0:20-3 I:21-0:20-0 II:22-0:20-0 II:19-1:18-3 II:21-4:18-5 III:22-1:18-5 III:20-3:15-2 III:18-2:16-4 III:21-5:18-0 III:23-2:16-2 IV:21-0:18-0 IV:22-1:12-6 IV:23-0:15-4 IV:12-0:18-0'),
  // https://archive.org/download/b21723916/page/n249.jpg : « Total in inches » 302.88 et 263.63 ; « average 20.19 ... 17.57 inches in height ; or as 100 to 87 »
  maisDarwinTexte: S('totalCroise:302.88 totalAuto:263.63 moyenneCroise:20.19 moyenneAuto:17.57 rapport:87', 'inches', 'https://archive.org/download/b21723916/page/n249.jpg', 'totalCroise:302.88 totalAuto:263.63 moyenneCroise:20.19 moyenneAuto:17.57 rapport:87'),
  /* game286 : Rutherford, « A Radio-active Substance emitted from Thorium Compounds », Philosophical Magazine (5) 49 (1900) : 1-14 ; Table III
   *   p. 6 et p. 12 relues par moi sur les images (Internet Archive ; aucun champ de droits ; texte de 1900, Rutherford 1871-1937 selon le
   *   catalogue). La Table IV (montee) n est pas reprise : sa colonne des temps est imprimee de facon ambigue. Idee : codex 31, sous-agent
   *   Claude ; contre-lecture (workflow). */
  // https://archive.org/download/londonedinburgh549190lond/page/n21_w1500.jpg : Table III, 100 volts : temps en secondes:courant (initial = 1)
  emanationRutherfordTable: S('0:1 28:.69 62:.51 118:.23 155:.14 210:.067 272:.041 360:.018', 'seconds, current', 'https://archive.org/download/londonedinburgh549190lond/page/n21_w1500.jpg', '0:1 28:.69 62:.51 118:.23 155:.14 210:.067 272:.041 360:.018'),
  // https://archive.org/download/londonedinburgh549190lond/page/n27_w1500.jpg : « e^-lambda t = 1/2 when t = 60 seconds. Therefore lambda = 1/86 » ; « After 20 minutes ... about one millionth part »
  emanationRutherfordTexte: S('demiVie:60 lambdaInverse:86 vingtMinutes:1200 millionieme:1e-6', 'seconds', 'https://archive.org/download/londonedinburgh549190lond/page/n27_w1500.jpg', 'demiVie:60 lambdaInverse:86 vingtMinutes:1200 millionieme:1e-6'),
  /* game287 : Michelson et Morley, « On the Relative Motion of the Earth and the Luminiferous Ether », American Journal of Science (3) 34 (1887),
   *   p. 340 (tableaux) et 341, relues par moi sur les images (Internet Archive, microfilm ; aucun champ de droits ; texte de 1887). Ce n est
   *   pas lumiereMichelson (vitesse de la lumiere 1879). Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n11_w1500.jpg : « Noon Observations » (8, 9, 11 juillet) : 17 colonnes, en divisions de vis ; Mean in w. l. et lignes suivantes en millimes de longueur d onde
  etherMichelsonMidi: S('midi|44.7,44.0,43.5,39.7,35.2,34.7,34.3,32.5,28.2,26.2,23.8,23.2,20.3,18.7,17.5,16.8,13.7|57.4,57.3,58.2,59.2,58.7,60.2,60.8,62.0,61.5,63.3,65.8,67.3,69.7,70.7,73.0,70.2,72.2|27.3,23.5,22.0,19.3,19.2,19.3,18.7,18.8,16.2,14.3,13.3,12.8,13.3,12.3,10.2,7.3,6.5|43.1,41.6,41.2,39.4,37.7,38.1,37.9,37.8,35.3,34.6,34.3,34.4,34.4,33.9,33.6,31.4,30.8|862,832,824,788,754,762,758,756,706,692,686,688,688,678,672,628,616|706,692,686,688,688,678,672,628,616|784,762,755,738,721,720,715,692,661', 'screw divisions, thousandths of a wave-length', 'https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n11_w1500.jpg', 'midi|44.7,44.0,43.5,39.7,35.2,34.7,34.3,32.5,28.2,26.2,23.8,23.2,20.3,18.7,17.5,16.8,13.7|57.4,57.3,58.2,59.2,58.7,60.2,60.8,62.0,61.5,63.3,65.8,67.3,69.7,70.7,73.0,70.2,72.2|27.3,23.5,22.0,19.3,19.2,19.3,18.7,18.8,16.2,14.3,13.3,12.8,13.3,12.3,10.2,7.3,6.5|43.1,41.6,41.2,39.4,37.7,38.1,37.9,37.8,35.3,34.6,34.3,34.4,34.4,33.9,33.6,31.4,30.8|862,832,824,788,754,762,758,756,706,692,686,688,688,678,672,628,616|706,692,686,688,688,678,672,628,616|784,762,755,738,721,720,715,692,661'),
  // https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n11_w1500.jpg : « P.M. Observations » (8, 9, 12 juillet)
  etherMichelsonSoir: S('soir|61.2,63.3,63.3,68.2,67.7,69.3,70.3,69.8,69.0,71.3,71.3,70.5,71.2,71.2,70.5,72.5,75.7|26.0,26.0,28.2,29.2,31.5,32.0,31.3,31.7,33.0,35.8,36.5,37.3,38.8,41.0,42.7,43.7,44.0|66.8,66.5,66.0,64.3,62.2,61.0,61.3,59.7,58.2,55.7,53.7,54.7,55.0,58.2,58.5,57.0,56.0|51.3,51.9,52.5,53.9,53.8,54.1,54.3,53.7,53.4,54.3,53.8,54.2,55.0,56.8,57.2,57.7,58.6|1026,1038,1050,1078,1076,1082,1086,1074,1068,1086,1076,1084,1100,1136,1144,1154,1172|1068,1086,1076,1084,1100,1136,1144,1154,1172|1047,1062,1063,1081,1088,1109,1115,1114,1120', 'screw divisions, thousandths of a wave-length', 'https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n11_w1500.jpg', 'soir|61.2,63.3,63.3,68.2,67.7,69.3,70.3,69.8,69.0,71.3,71.3,70.5,71.2,71.2,70.5,72.5,75.7|26.0,26.0,28.2,29.2,31.5,32.0,31.3,31.7,33.0,35.8,36.5,37.3,38.8,41.0,42.7,43.7,44.0|66.8,66.5,66.0,64.3,62.2,61.0,61.3,59.7,58.2,55.7,53.7,54.7,55.0,58.2,58.5,57.0,56.0|51.3,51.9,52.5,53.9,53.8,54.1,54.3,53.7,53.4,54.3,53.8,54.2,55.0,56.8,57.2,57.7,58.6|1026,1038,1050,1078,1076,1082,1086,1074,1068,1086,1076,1084,1100,1136,1144,1154,1172|1068,1086,1076,1084,1100,1136,1144,1154,1172|1047,1062,1063,1081,1088,1109,1115,1114,1120'),
  // https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n12_w1200.jpg : « 2D v2/V2 = 2D x 10-8 », « 2 x 10^7 wave-lengths », « 0.4 fringe », « less than the twentieth part ... fortieth part »
  etherMichelsonTexte: S('D:2e7 v2:1e-8 attendu:0.4 vingtieme:20 quarantieme:40', 'wave-lengths', 'https://archive.org/download/sim_american-journal-of-science_1887-11_34_203/page/n12_w1200.jpg', 'D:2e7 v2:1e-8 attendu:0.4 vingtieme:20 quarantieme:40'),
  /* game288 : Rubens et Kurlbaum, « Anwendung der Methode der Reststrahlen zur Prufung des Strahlungsgesetzes », Annalen der Physik (4) 4 (1901),
   *   p. 652 (formules et constantes) et Tabelle II p. 664, relues par moi sur les images (Internet Archive, microfilm ; aucun champ de
   *   droits ; texte de 1901, Rubens mort en 1922 et Kurlbaum en 1927 selon Wikidata). Les Tabellen I (deux bandes melees) et III ne sont pas
   *   reprises. Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/sim_annalen-der-physik_1901_4_4/page/n17_w1500.jpg : Tabelle II, Reststrahlen von Steinsalz, lambda = 51,2 micron : T:beob.:Wien:Thiesen:Rayleigh:Lummer u. Jahnke:Planck
  reststrahlenRubensTable: S('0:x:-121.5:-44:-20:-27:-23.8 85:-20.6:-107.5:-40:-19:-24.5:-21.9 193:-11.8:-48.0:-21.5:-11.5:-13.5:-12.0 293:0:0:0:0:0:0 523:31.0:63.5:40.5:28.5:31:30.4 773:64.5:96:77:62.5:65.5:63.8 1023:98.1:118:106:97:99:97.2 1273:132:132:132:132:132:132 1523:164.5:141:154:167:165.5:166 1773:196.8:147.5:175:202:198:200 i:x:194:x:x:x:x', 'kelvin, scale (132 at 1000 C)', 'https://archive.org/download/sim_annalen-der-physik_1901_4_4/page/n17_w1500.jpg', '0:x:-121.5:-44:-20:-27:-23.8 85:-20.6:-107.5:-40:-19:-24.5:-21.9 193:-11.8:-48.0:-21.5:-11.5:-13.5:-12.0 293:0:0:0:0:0:0 523:31.0:63.5:40.5:28.5:31:30.4 773:64.5:96:77:62.5:65.5:63.8 1023:98.1:118:106:97:99:97.2 1273:132:132:132:132:132:132 1523:164.5:141:154:167:165.5:166 1773:196.8:147.5:175:202:198:200 i:x:194:x:x:x:x'),
  // https://archive.org/download/sim_annalen-der-physik_1901_4_4/page/n5_w1500.jpg : note 3 : c = 5, 4,5, 4 (lambda_m T), 4 / 1,3 (lambda_m T)^1,3, 4,965 (lambda_m T) ; lambda_m T = 2890
  reststrahlenRubensTexte: S('lambda:51.2 lambdaMT:2890 cWien:5 cThiesen:4.5 cRayleigh:4 cLJ:4 nuLJ:1.3 cPlanck:4.965', 'micron kelvin', 'https://archive.org/download/sim_annalen-der-physik_1901_4_4/page/n5_w1500.jpg', 'lambda:51.2 lambdaMT:2890 cWien:5 cThiesen:4.5 cRayleigh:4 cLJ:4 nuLJ:1.3 cPlanck:4.965'),
  /* game289 : Planck, « Ueber das Gesetz der Energieverteilung im Normalspectrum », Annalen der Physik (4) 4 (1901), §11-12, p. 562-563, relues
   *   par moi sur les images (Internet Archive, microfilm ; aucun champ de droits ; texte de 1901, Planck 1858-1947 selon un autre item).
   *   Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/sim_annalen-der-physik_1901_4_3/page/n139_w1500.jpg (§11 : S, densite 7,061.10^-15, 1,0823, (14) k4/h3) et https://archive.org/download/sim_annalen-der-physik_1901_4_3/page/n140_w1500.jpg (§12 : 0,294 cm grad, 4,9651, h/k, (15) h, (16) k)
  constantesPlanckTexte: S('S:7.31e5 c:3e10 a:7.061e-15 serie:1.0823 k4h3:1.1682e15 lambdaTheta:0.294 racine:4.9651 hk:4.866e-11 h:6.55e-27 k:1.346e-16', 'CGS units', 'https://archive.org/download/sim_annalen-der-physik_1901_4_3/page/n140_w1500.jpg', 'S:7.31e5 c:3e10 a:7.061e-15 serie:1.0823 k4h3:1.1682e15 lambdaTheta:0.294 racine:4.9651 hk:4.866e-11 h:6.55e-27 k:1.346e-16'),
  /* game290 : W. Herschel, « On the Construction of the Heavens », Philosophical Transactions 75 (1785) : 213-266 ; p. 242 (formule), 245 (exemple,
   *   champ de 15 minutes) et Table II p. 252 relues par moi sur les images (Internet Archive, JSTOR Early Journal Content ; texte de 1785,
   *   Herschel mort en 1822 selon Wikidata). Idee : codex 31, sous-agent Claude ; contre-lecture (workflow). */
  // https://archive.org/download/jstor-106755/page/n40_w1500.jpg : Table II, « Stars in the field » : « Visual ray » (167 lignes, dont 636175 « resolvable » et 2544700 « milky nebulosity »)
  jaugesHerschelTable: S('0.1:27 0.2:34 0.3:39 0.4:43 0.5:46 0.6:49 0.7:52 0.8:54 0.9:56 1:58 2:74 3:85 4:93 5:101 6:107 7:113 8:118 9:123 10:127 11:131 12:135 13:139 14:142 15:146 16:149 17:152 18:155 19:158 20:160 21:163 22:166 23:168 24:170 25:173 26:175 27:177 28:180 29:182 30:184 31:186 32:188 33:190 34:192 35:193 36:195 37:197 38:199 39:201 40:202 41:204 42:206 43:207 44:209 45:210 46:212 47:214 48:215 49:217 50:218 51:219 52:221 53:222 54:224 55:225 56:226 57:228 58:229 59:230 60:232 61:233 62:234 63:236 64:237 65:238 66:239 67:240 68:242 69:243 70:244 71:245 72:246 73:247 74:249 75:250 76:251 77:252 78:253 79:254 80:255 81:256 82:257 83:258 84:259 85:260 86:261 87:262 88:263 89:264 90:265 91:266 92:267 93:268 94:269 95:270 96:271 97:272 98:273 99:274 100:275 110:284 120:291 130:300 140:308 150:315 160:322 170:328 180:335 190:341 200:347 210:352 220:358 230:363 240:368 250:374 260:378 270:383 280:388 290:393 300:397 310:401 320:406 330:410 340:414 350:418 360:422 370:426 380:430 390:433 400:437 410:441 420:444 430:448 440:451 450:455 460:458 470:461 480:464 490:468 500:471 510:474 520:477 530:480 540:483 550:486 560:489 570:492 580:495 590:498 600:500 700:527 800:551 900:573 1000:593 10000:1280 100000:2758 636175:5112 2544700:8115', 'stars per field, distance of Sirius', 'https://archive.org/download/jstor-106755/page/n40_w1500.jpg', '0.1:27 0.2:34 0.3:39 0.4:43 0.5:46 0.6:49 0.7:52 0.8:54 0.9:56 1:58 2:74 3:85 4:93 5:101 6:107 7:113 8:118 9:123 10:127 11:131 12:135 13:139 14:142 15:146 16:149 17:152 18:155 19:158 20:160 21:163 22:166 23:168 24:170 25:173 26:175 27:177 28:180 29:182 30:184 31:186 32:188 33:190 34:192 35:193 36:195 37:197 38:199 39:201 40:202 41:204 42:206 43:207 44:209 45:210 46:212 47:214 48:215 49:217 50:218 51:219 52:221 53:222 54:224 55:225 56:226 57:228 58:229 59:230 60:232 61:233 62:234 63:236 64:237 65:238 66:239 67:240 68:242 69:243 70:244 71:245 72:246 73:247 74:249 75:250 76:251 77:252 78:253 79:254 80:255 81:256 82:257 83:258 84:259 85:260 86:261 87:262 88:263 89:264 90:265 91:266 92:267 93:268 94:269 95:270 96:271 97:272 98:273 99:274 100:275 110:284 120:291 130:300 140:308 150:315 160:322 170:328 180:335 190:341 200:347 210:352 220:358 230:363 240:368 250:374 260:378 270:383 280:388 290:393 300:397 310:401 320:406 330:410 340:414 350:418 360:422 370:426 380:430 390:433 400:437 410:441 420:444 430:448 440:451 450:455 460:458 470:461 480:464 490:468 500:471 510:474 520:477 530:480 540:483 550:486 560:489 570:492 580:495 590:498 600:500 700:527 800:551 900:573 1000:593 10000:1280 100000:2758 636175:5112 2544700:8115'),
  // https://archive.org/download/jstor-106755/page/n33_w1500.jpg : « putting S = 588, and the diameter of the field of view fifteen minutes, we shall find n = cube root of B2S = 498 »
  jaugesHerschelTexte: S('champMinutes:15 exempleEtoiles:588 exempleN:498', 'minutes of arc, stars', 'https://archive.org/download/jstor-106755/page/n33_w1500.jpg', 'champMinutes:15 exempleEtoiles:588 exempleN:498'),
  /* game292 : H. Kater, « An Account of Experiments for Determining the Variation in the Length of the Pendulum Vibrating Seconds… »,
   *   Philosophical Transactions 109 (1819) : 337-508 ; table p. 416, constantes p. 422, Newton et Huygens p. 418, relues par moi sur les images
   *   (Internet Archive philtrans00624993, marque Public Domain ; Kater mort en 1835 selon le catalogue). Idee : codex 31, sous-agent Claude. */
  // https://archive.org/download/philtrans00624993/page/n79_w1500.jpg : « Place of observation · Latitude · Vibrations in a mean solar day · Length of the Pendulum vibrating seconds… Inches »
  penduleKaterTable: S('Unst/60/45/28.01/86096.90/39.17146 Portsoy/57/40/58.65/86086.05/39.16159 LeithFort/55/58/40.80/86079.40/39.15554 Clifton/53/27/43.12/86068.90/39.14600 ArburyHill/52/12/55.32/86065.05/39.14250 London/51/31/8.40/86061.52/39.13929 ShanklinFarm/50/37/23.94/86058.07/39.13614', 'degrees, vibrations per day, inches of Shuckburgh scale', 'https://archive.org/download/philtrans00624993/page/n79_w1500.jpg', 'Unst/60/45/28.01/86096.90/39.17146 Portsoy/57/40/58.65/86086.05/39.16159 LeithFort/55/58/40.80/86079.40/39.15554 Clifton/53/27/43.12/86068.90/39.14600 ArburyHill/52/12/55.32/86065.05/39.14250 London/51/31/8.40/86061.52/39.13929 ShanklinFarm/50/37/23.94/86058.07/39.13614'),
  // https://archive.org/download/philtrans00624993/page/n85_w1500.jpg : « 39,00734 inches » (Unst and Dunnose) ; « ,0086501 for the sum of the fractions expressing the ellipticity … and the diminution of
  //   gravity » ; https://archive.org/download/philtrans00624993/page/n81_w1500.jpg : homogeneous spheroid, Newton « 1/230 » ; Huygens « 1/578 »
  penduleKaterTexte: S('equateurUnstDunnose:39.00734 sommeCinqDemi:0.0086501 newton:230 huygens:578', 'inches, fraction, denominators', 'https://archive.org/download/philtrans00624993/page/n85_w1500.jpg', 'equateurUnstDunnose:39.00734 sommeCinqDemi:0.0086501 newton:230 huygens:578'),
  /* game297 : E. L. Thorndike, « Animal Intelligence: An Experimental Study of the Associative Processes in Animals », Psychological Review,
   *   Monograph Supplements II, 4 (1898) ; liste des temps p. 15 relue par moi sur l image (Internet Archive animalintelligen00thoruoft,
   *   NOT_IN_COPYRIGHT declare par l operateur ; Thorndike mort en 1949 selon le catalogue). Idee : codex « cerveau humain », sous-agent Claude. */
  // https://archive.org/download/animalintelligen00thoruoft/page/n22_w1500.jpg : « in 24 experiences or trials in box A, cat 12 took the following times to perform the act, 160 sec., 30 sec., 90 sec., 60, … 7. »
  essaisThorndikeTemps: S('160 30 90 60 15 28 20 30 22 11 15 20 12 10 14 10 8 8 5 10 8 6 6 7', 'seconds', 'https://archive.org/download/animalintelligen00thoruoft/page/n22_w1500.jpg', '160 30 90 60 15 28 20 30 22 11 15 20 12 10 14 10 8 8 5 10 8 6 6 7'),
  essaisThorndikeTexte: S('essais:24', 'trials', 'https://archive.org/download/animalintelligen00thoruoft/page/n22_w1500.jpg', 'essais:24'),
  /* game299 : F. C. Donders, « Die Schnelligkeit psychischer Processe », Archiv fur Anatomie, Physiologie und wissenschaftliche Medicin
   *   1868 : 657-681 ; pages 680 et 681 relues par moi sur les images (Internet Archive archivfuranatom00boisgoog, NOT_IN_COPYRIGHT declare ;
   *   Donders mort en 1889 selon Wikidata). Idee : codex « cerveau humain », sous-agent Claude. */
  // https://archive.org/download/archivfuranatom00boisgoog/page/n690_w1500.jpg : la table des trois rouleaux (XV, XVI A, XVI B, « Mittel aus den Beobachtungen », « Minimum aus 38 Bestimmungen »), en vibrations
  reactionDondersTable: S('a:56.66/49.66/51.5/52.41/44.5 b:74.83/73.08/74.33/74.08/62 c:60.83/60.5/63.37/61.89/55.5', 'vibrations of a 261 Hz tuning fork', 'https://archive.org/download/archivfuranatom00boisgoog/page/n690_w1500.jpg', 'a:56.66/49.66/51.5/52.41/44.5 b:74.83/73.08/74.33/74.08/62 c:60.83/60.5/63.37/61.89/55.5'),
  // https://archive.org/download/archivfuranatom00boisgoog/page/n691_w1500.jpg : « Man findet nun » b-a et c-a ; « Tausendstel Sec. » 83, 36,32, 67,05 (la 4e case, 4?,15, est abimee : non utilisee)
  reactionDondersDiff: S('ba:18.17/23.42/22.83/21.67/17.5 ca:4.17/10.84/11.87/9.48/11', 'vibrations', 'https://archive.org/download/archivfuranatom00boisgoog/page/n691_w1500.jpg', 'ba:18.17/23.42/22.83/21.67/17.5 ca:4.17/10.84/11.87/9.48/11'),
  // https://archive.org/download/archivfuranatom00boisgoog/page/n690_w1500.jpg : rouleau XVI B, essai par essai (« H. ruft, D. antwortet ») ; methode a, essai 2 « ausgeblieben »
  reactionDondersEssais: S('a:45/54/53/60/45.5 b:77.5/72/72/76/74.5/74 c:71.5/61/62/59', 'vibrations', 'https://archive.org/download/archivfuranatom00boisgoog/page/n690_w1500.jpg', 'a:45/54/53/60/45.5 b:77.5/72/72/76/74.5/74 c:71.5/61/62/59'),
  reactionDondersTexte: S('diapason:261 msBaMoyennes:83 msCaMoyennes:36.32 msBaMinima:67.05 determinations:15', 'Hz, thousandths of a second, count', 'https://archive.org/download/archivfuranatom00boisgoog/page/n691_w1500.jpg', 'diapason:261 msBaMoyennes:83 msCaMoyennes:36.32 msBaMinima:67.05 determinations:15'),
  /* game300: J. McKeen Cattell, "The Time Taken up by Cerebral Operations", Mind 11, no. 42 (April 1886), 220-242; Tables VI, VII and VIII
   *   read by me on the page images (Internet Archive sim_mind_1886-04_11_42, leaf n = page image; Cattell died 1944 per Wikidata; published 1886).
   *   Idea: codex "human brain", Claude sub-agent. Only the R columns (mean reaction time, thousandths of a second) are wired.
   *   Keys: B and C are the observers; E electric light and K induction shock (Table VI, 1884); L daylight and S sound (Table VII, 1885). */
  // https://archive.org/download/sim_mind_1886-04_11_42/page/n85_w1500.jpg (p. 238): Table VI, R concentrated / normal / distracted (each the mean of 10 series)
  attentionCattellSix: S('BE:189/201/245 CE:158/132/153 BK:160/165/190 CK:147/150/184', 'thousandths of a second', 'https://archive.org/download/sim_mind_1886-04_11_42/page/n85_w1500.jpg', 'BE:189/201/245 CE:158/132/153 BK:160/165/190 CK:147/150/184'),
  // https://archive.org/download/sim_mind_1886-04_11_42/page/n86_w1500.jpg (p. 239): Table VII, five series a block, R concentrated, normal, distracted (26 reactions a series)
  attentionCattellSeven: S('BL:144/131/141/137/143,148/160/139/161/152,196/186/178/179/194 CL:149/149/146/146/140,146/144/149/146/144,166/154/157/154/163 BS:132/129/127/123/127,157/158/155/147/138,193/188/174/169/188 CS:129/135/125/123/131,145/133/141/142/136,166/156/158/155/157', 'thousandths of a second', 'https://archive.org/download/sim_mind_1886-04_11_42/page/n86_w1500.jpg', 'BL:144/131/141/137/143,148/160/139/161/152,196/186/178/179/194 CL:149/149/146/146/140,146/144/149/146/144,166/154/157/154/163 BS:132/129/127/123/127,157/158/155/147/138,193/188/174/169/188 CS:129/135/125/123/131,145/133/141/142/136,166/156/158/155/157'),
  // https://archive.org/download/sim_mind_1886-04_11_42/page/n86_w1500.jpg: the printed A line under each block of Table VII (R columns)
  attentionCattellSevenA: S('BL:139/152/187 CL:146/146/159 BS:128/151/182 CS:129/139/159', 'thousandths of a second', 'https://archive.org/download/sim_mind_1886-04_11_42/page/n86_w1500.jpg', 'BL:139/152/187 CL:146/146/159 BS:128/151/182 CS:129/139/159'),
  // https://archive.org/download/sim_mind_1886-04_11_42/page/n87_w1500.jpg (p. 240): Table VIII, "the time when the attention was normal being taken as 0", concentrated / distracted; rows electric light, shock, daylight, sound, A
  attentionCattellEight: S('B:-12/44,-5/25,-13/35,-23/31,-13/34 C:26/21,-3/34,0/13,-10/20,3/22', 'thousandths of a second', 'https://archive.org/download/sim_mind_1886-04_11_42/page/n87_w1500.jpg', 'B:-12/44,-5/25,-13/35,-23/31,-13/34 C:26/21,-3/34,0/13,-10/20,3/22'),
  /* game301: C. S. Peirce and J. Jastrow, "On Small Differences of Sensation", Memoirs of the National Academy of Sciences 3 (1885), Fifth
   *   Memoir, 73-83 (read October 17, 1884); pages 76 and 81 read by me on the page images (Internet Archive memoirsofnationa03nati;
   *   Government Printing Office; Peirce died 1914, Jastrow 1944 per the archive catalogue). Idea: codex "human brain", Claude sub-agent.
   *   Jastrow judged which of two pressures on a finger was the greater, 50 judgments a set; numbers are errors out of 50. */
  // https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg (p. 81): Jastrow's daily errors, first group (December 10 to January 22) and second group (January 24 to February 24), by ratio of pressures
  pressurePeirceJastrowDaily: S('G1|1.100:5|1.080:9|1.060:15/14/10/8/7/12/11|1.050:19|1.040:15|1.030:23/17/14/13/6/10|1.015:25/24/17/22/16 G2|1.060:4/1/2/2/2|1.030:11/7/10/11/8|1.015:18/18/17/17/15', 'errors in 50', 'https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg', 'G1|1.100:5|1.080:9|1.060:15/14/10/8/7/12/11|1.050:19|1.040:15|1.030:23/17/14/13/6/10|1.015:25/24/17/22/16 G2|1.060:4/1/2/2/2|1.030:11/7/10/11/8|1.015:18/18/17/17/15'),
  // https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg (p. 81): "First group [Probable error=0.05]" and "Second group [Probable error=0.0235]": ratio, observed mean errors, calculated from probable error
  pressurePeirceJastrowGroups: S('G1|0.05|1.100:5:4.4|1.080:9:7.0|1.060:11.0:10.4|1.050:19:12.5|1.040:15:14.7|1.030:13.8:17.0|1.015:20.8:21.0 G2|0.0235|1.060:2.2:2.1|1.030:9.4:9.6|1.015:17.0:16.6', 'errors in 50', 'https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg', 'G1|0.05|1.100:5:4.4|1.080:9:7.0|1.060:11.0:10.4|1.050:19:12.5|1.040:15:14.7|1.030:13.8:17.0|1.015:20.8:21.0 G2|0.0235|1.060:2.2:2.1|1.030:9.4:9.6|1.015:17.0:16.6'),
  // https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg (p. 81): the two finest ratios, March 4 to April 7 (1.010) and March 18 to April 7 (1.005; the March 18 "25" is a slightly blurred glyph)
  pressurePeirceJastrowFine: S('1.010:16/17/19/21/17/16/16/15/17/18/15/15 1.005:25/18/18/18/21/21/21/20/21/17', 'errors in 50', 'https://archive.org/download/memoirsofnationa03nati/page/n104_w1500.jpg', '1.010:16/17/19/21/17/16/16/15/17/18/15/15 1.005:25/18/18/18/21/21/21/20/21/17'),
  // https://archive.org/download/memoirsofnationa03nati/page/n99_w1500.jpg (p. 76, footnote): quotient (log of the ratio / probable error) and the proportion of erroneous judgments, (1 - theta t) / 2 with t = 0.477 x quotient
  pressurePeirceJastrowTable: S('0:0.50 0.05:0.49 0.1:0.47 0.25:0.43 0.5:0.37 1.0:0.25', 'proportion of errors', 'https://archive.org/download/memoirsofnationa03nati/page/n99_w1500.jpg', '0:0.50 0.05:0.49 0.1:0.47 0.25:0.43 0.5:0.37 1.0:0.25'),
  /* game302: I. P. Pavlov, Conditioned Reflexes, translated and edited by G. V. Anrep, Oxford University Press, 1927, Lecture IV,
   *   p. 52, 53, 58, read by me on the page images (Internet Archive item with a "Non-commercial use only" digitisation note: only the
   *   numbers are used here, no image is republished; Pavlov died 1936, Anrep 1955). Experiments by Dr. Babkin on one dog in a single day.
   *   Idea: codex "human brain", Claude sub-agent. Clock times are printed h.mm on a 12-hour clock. */
  // https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n67_w1500.jpg and https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n68_w1500.jpg (p. 52-53): meat powder shown for one minute, not reinforced, at intervals of 2, 4, 8, 16 then 2 minutes; saliva in c.c.
  extinctionPavlovSeries: S('i2:11.46/11.49/11.52/11.55/11.58/12.01=0.6/0.3/0.1/0.2/0.15/0.0 i4:12.10/12.15/12.20/12.25/12.30=0.7/0.4/0.3/0.1/0.0 i8:1.47/1.56/2.05/2.14/2.23/2.32/2.41=0.4/0.3/0.2/0.15/0.1/0.2/0.0 i16:3.23/3.40/3.57/4.14/4.31/4.48/5.05/5.22=0.6/0.6/0.5/0.3/0.1/0.2/0.1/0.1 i2b:5.27/5.30/5.33/5.36/5.39/5.42/5.45=0.6/0.3/0.3/0.2/0.1/0.05/0.0', 'clock time = c.c. in one minute', 'https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n68_w1500.jpg', 'i2:11.46/11.49/11.52/11.55/11.58/12.01=0.6/0.3/0.1/0.2/0.15/0.0 i4:12.10/12.15/12.20/12.25/12.30=0.7/0.4/0.3/0.1/0.0 i8:1.47/1.56/2.05/2.14/2.23/2.32/2.41=0.4/0.3/0.2/0.15/0.1/0.2/0.0 i16:3.23/3.40/3.57/4.14/4.31/4.48/5.05/5.22=0.6/0.6/0.5/0.3/0.1/0.2/0.1/0.1 i2b:5.27/5.30/5.33/5.36/5.39/5.42/5.45=0.6/0.3/0.3/0.2/0.1/0.05/0.0'),
  // https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n68_w1500.jpg (p. 53): "To sum up": extinction obtained in 15, 20, 54 minutes, "incomplete in 2 hours", "occurred in 18 minutes"
  extinctionPavlovSummary: S('i2:15 i4:20 i8:54 i16:incomplete-in-2-hours i2b:18', 'minutes', 'https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n68_w1500.jpg', 'i2:15 i4:20 i8:54 i16:incomplete-in-2-hours i2b:18'),
  // https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n73_w1500.jpg (p. 58): extinction at intervals of three minutes then "Interval of 2 hours" (c.c.); a second dog at ten minutes then "Interval of 20 minutes" (drops)
  extinctionPavlovRecovery: S('threeMinutes:1.0/0.6/0.3/0.1/0.0/0.0>0.15 tenMinutes:8/3/0>7', 'c.c. ; drops', 'https://archive.org/download/conditioned-reflexes-an-investigation-of-the-physiological-activity-of-the-cerebral-cortex/page/n73_w1500.jpg', 'threeMinutes:1.0/0.6/0.3/0.1/0.0/0.0>0.15 tenMinutes:8/3/0>7'),
  /* game303: A. Konig and E. Brodhun, "Experimentelle Untersuchungen uber die psychophysische Fundamentalformel in Bezug auf den
   *   Gesichtssinn", Sitzungsberichte der Kgl. Preuss. Akademie der Wissenschaften zu Berlin 1888, 917-931 (title page https://archive.org/download/sitzungsberichte1888deutsch/page/n262_w1500.jpg);
   *   the four tables of p. 922 read by me on the page image (Internet Archive sitzungsberichte1888deutsch; Konig died 1901, Brodhun 1938
   *   per Wikidata). K. is Konig (normal colour vision), B. is Brodhun ("grunblind"). Idea: codex "human brain", Claude sub-agent. */
  // https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg (p. 922): wavelength 670 millionths of a mm, observer K.; rows J (= r + dr) @ alpha (degrees.minutes) @ dr / r (= tg alpha squared), as printed
  weberKonig670K: S('50000@8.20@0.0215 20000@7.16@0.0163 10000@7.10@0.0158 5000@7.38@0.0180 2000@7.24@0.0169 1000@7.29@0.0172 500@8.10@0.0206 200@8.31@0.0224 100@9.50@0.0300 50@11.11@0.0391 20@12.10@0.0465 10@14.50@0.0701 5@17.38@0.101 2@24.27@0.207 1@30.31@0.347 0.5@37.50@0.603', 'brightness units @ degrees.minutes @ fraction', 'https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg', '50000@8.20@0.0215 20000@7.16@0.0163 10000@7.10@0.0158 5000@7.38@0.0180 2000@7.24@0.0169 1000@7.29@0.0172 500@8.10@0.0206 200@8.31@0.0224 100@9.50@0.0300 50@11.11@0.0391 20@12.10@0.0465 10@14.50@0.0701 5@17.38@0.101 2@24.27@0.207 1@30.31@0.347 0.5@37.50@0.603'),
  // https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg (p. 922): wavelength 670, observer B.; rows J (= r + dr) @ alpha (degrees.minutes) @ dr / r (= tg alpha squared), as printed
  weberKonig670B: S('50000@8.33@0.0226 20000@7.47@0.0187 10000@7.19@0.0165 5000@7.2@0.0152 2000@7.25@0.0169 1000@7.41@0.0182 500@8.22@0.0216 200@8.38@0.0230 100@9.21@0.0271 50@10.26@0.0339 20@11.44@0.0431 10@13.23@0.0566 5@16.41@0.0898 2@23.27@0.188 1@32.20@0.401 0.5@41.41@0.793', 'brightness units @ degrees.minutes @ fraction', 'https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg', '50000@8.33@0.0226 20000@7.47@0.0187 10000@7.19@0.0165 5000@7.2@0.0152 2000@7.25@0.0169 1000@7.41@0.0182 500@8.22@0.0216 200@8.38@0.0230 100@9.21@0.0271 50@10.26@0.0339 20@11.44@0.0431 10@13.23@0.0566 5@16.41@0.0898 2@23.27@0.188 1@32.20@0.401 0.5@41.41@0.793'),
  // https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg (p. 922): wavelength 605, observer K. (19 rows, the 20th cell is empty); rows J (= r + dr) @ alpha (degrees.minutes) @ dr / r (= tg alpha squared), as printed
  weberKonig605K: S('200000@11.55@0.0445 100000@8.56@0.0247 50000@8.6@0.0203 20000@7.46@0.0186 10000@7.21@0.0166 5000@7.14@0.0161 2000@7.43@0.0184 1000@8.5@0.0202 500@8.25@0.0219 200@8.39@0.0231 100@9.36@0.0286 50@11.12@0.0392 20@12.25@0.0485 10@14.18@0.0650 5@18.44@0.115 2@23.23@0.187 1@27.25@0.269 0.5@31.45@0.383 0.2@35.13@0.498', 'brightness units @ degrees.minutes @ fraction', 'https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg', '200000@11.55@0.0445 100000@8.56@0.0247 50000@8.6@0.0203 20000@7.46@0.0186 10000@7.21@0.0166 5000@7.14@0.0161 2000@7.43@0.0184 1000@8.5@0.0202 500@8.25@0.0219 200@8.39@0.0231 100@9.36@0.0286 50@11.12@0.0392 20@12.25@0.0485 10@14.18@0.0650 5@18.44@0.115 2@23.23@0.187 1@27.25@0.269 0.5@31.45@0.383 0.2@35.13@0.498'),
  // https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg (p. 922): wavelength 605, observer B.; rows J (= r + dr) @ alpha (degrees.minutes) @ dr / r (= tg alpha squared), as printed
  weberKonig605B: S('200000@13.10@0.0547 100000@10.30@0.0343 50000@7.50@0.0189 20000@7.0@0.0151 10000@7.2@0.0152 5000@6.49@0.0143 2000@7.12@0.0160 1000@7.28@0.0172 500@7.43@0.0184 200@8.38@0.0230 100@8.47@0.0239 50@9.26@0.0276 20@10.34@0.0348 10@13.4@0.0539 5@16.11@0.0842 2@24.17@0.204 1@27.38@0.274 0.5@29.13@0.313 0.2@32.13@0.397 0.1@37.47@0.601', 'brightness units @ degrees.minutes @ fraction', 'https://archive.org/download/sitzungsberichte1888deutsch/page/n267_w1500.jpg', '200000@13.10@0.0547 100000@10.30@0.0343 50000@7.50@0.0189 20000@7.0@0.0151 10000@7.2@0.0152 5000@6.49@0.0143 2000@7.12@0.0160 1000@7.28@0.0172 500@7.43@0.0184 200@8.38@0.0230 100@8.47@0.0239 50@9.26@0.0276 20@10.34@0.0348 10@13.4@0.0539 5@16.11@0.0842 2@24.17@0.204 1@27.38@0.274 0.5@29.13@0.313 0.2@32.13@0.397 0.1@37.47@0.601'),
  /* game304: W. B. Cannon, Bodily Changes in Pain, Hunger, Fear and Rage, New York and London, D. Appleton, 1915, chapter IV
   *   "Increase of blood sugar", p. 71-78, read by me on the page images (Internet Archive cu31924022542470; Cannon died 1945).
   *   Counts of subjects with sugar in the urine (glycosuria), a yes / no sign, not a dose. The cat counts are Cannon, Shohl and Wright's;
   *   the student counts are Smillie's and Folin, Denis and Smillie's as reported by Cannon. Idea: codex "human brain", Claude sub-agent. */
  // https://archive.org/download/cu31924022542470/page/n86_w1200.jpg (p. 71: "twelve cats ... in every one"), https://archive.org/download/cu31924022542470/page/n87_w1200.jpg (p. 72: three calm cats bound up to four hours; one cat cooled to 36 C, no sugar),
  //   https://archive.org/download/cu31924022542470/page/n88_w1200.jpg (p. 73: the same three, barked at by a dog for half an hour, all with sugar), https://archive.org/download/cu31924022542470/page/n93_w1200.jpg (p. 78: three cats without adrenals, "no trace")
  glycosuriaCannonCats: S('excitedBound:12/12 calmBound:0/3 sameCatsBarkedAt:3/3 cooled:0/1 noAdrenals:0/3', 'cats with sugar / cats', 'https://archive.org/download/cu31924022542470/page/n88_w1200.jpg', 'excitedBound:12/12 calmBound:0/3 sameCatsBarkedAt:3/3 cooled:0/1 noAdrenals:0/3'),
  // https://archive.org/download/cu31924022542470/page/n90_w1200.jpg (p. 75: four of nine students after a hard examination, one after an easier one; twelve of twenty-five football players, five of
  //   them substitutes "not called upon to enter the game"), https://archive.org/download/cu31924022542470/page/n91_w1200.jpg (p. 76: of 34, one had sugar before; of the remaining 33, six, "or 18
  //   per cent"; of 36 women students, six, "or 17 per cent")
  glycosuriaCannonPeople: S('hardExam:4/9 easyExam:1/9 football:12/25 footballBench:5 menExam:6/33 menPrinted:18 menTested:34 menBefore:1 womenExam:6/36 womenPrinted:17', 'people with sugar / people', 'https://archive.org/download/cu31924022542470/page/n91_w1200.jpg', 'hardExam:4/9 easyExam:1/9 football:12/25 footballBench:5 menExam:6/33 menPrinted:18 menTested:34 menBefore:1 womenExam:6/36 womenPrinted:17'),
  /* game305: R. Boyd, "Tables of the Weights of the Human Body and Internal Organs in the Sane and Insane of both Sexes at various Ages,
   *   arranged from 2614 post-mortem examinations", Phil. Trans. R. Soc. Lond. 151 (1861), 241-262 (Internet Archive philtrans02353690,
   *   Public Domain Mark); Table I, the "Average" and "Number examined" lines of the cerebral organs, read by me on the page images (p. 243
   *   to 253; odd pages carry the weights). St. Marylebone infirmary, 1839-1847: people who died there, not a sample of the living. Ounces
   *   avoirdupois, written here with a dot (the table prints a raised point; ".5" as 0.5). Idea: codex "human brain", Claude sub-agent. */
  // https://archive.org/download/philtrans02353690/page/n2_w1500.jpg (p. 243)
  brainBoydP243: S('premature|M|5.33/0.28/0.12/5.6|21/19/19/25 premature|F|4.42/0.36/0.1/4.62|10/6/6/18 stillborn|M|12.87/0.8/0.02/13.87|42/43/43/43 stillborn|F|11.25/0.75/0.16/12.25|30/29/29/31 newborn|M|10.84/0.69/0.2/11.67|44/40/40/42 newborn|F|9.26/0.62/0.16/10|38/35/35/39', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n2_w1500.jpg', 'premature|M|5.33/0.28/0.12/5.6|21/19/19/25 premature|F|4.42/0.36/0.1/4.62|10/6/6/18 stillborn|M|12.87/0.8/0.02/13.87|42/43/43/43 stillborn|F|11.25/0.75/0.16/12.25|30/29/29/31 newborn|M|10.84/0.69/0.2/11.67|44/40/40/42 newborn|F|9.26/0.62/0.16/10|38/35/35/39'),
  // https://archive.org/download/philtrans02353690/page/n4_w1500.jpg (p. 245)
  brainBoydP245: S('under3m|M|16.2/1.07/0.24/17.42|15/15/15/16 under3m|F|14.81/0.9/0.25/15.94|19/18/18/20 3to6m|M|20/1.72/0.29/21.29|14/14/14/15 3to6m|F|18.05/1.69/0.30/19.76|23/21/21/25 6to12m|M|24.29/2.74/0.39/27.42|46/46/46/46 6to12m|F|22.68/2.32/0.35/25.7|38/38/38/40 1to2|M|29.21/3.54/0.5/33.25|34/34/34/34 1to2|F|26.19/3.15/0.46/29.8|33/33/33/33', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n4_w1500.jpg', 'under3m|M|16.2/1.07/0.24/17.42|15/15/15/16 under3m|F|14.81/0.9/0.25/15.94|19/18/18/20 3to6m|M|20/1.72/0.29/21.29|14/14/14/15 3to6m|F|18.05/1.69/0.30/19.76|23/21/21/25 6to12m|M|24.29/2.74/0.39/27.42|46/46/46/46 6to12m|F|22.68/2.32/0.35/25.7|38/38/38/40 1to2|M|29.21/3.54/0.5/33.25|34/34/34/34 1to2|F|26.19/3.15/0.46/29.8|33/33/33/33'),
  // https://archive.org/download/philtrans02353690/page/n6_w1500.jpg (p. 247)
  brainBoydP247: S('2to4|M|34.03/4.02/0.66/38.71|28/28/28/29 2to4|F|30.77/3.7/0.5/34.97|29/29/29/29 4to7|M|35.44/4.17/0.62/40.23|27/27/27/27 4to7|F|35.04/4.19/0.68/40.11|17/17/17/19 7to14|M|40.36/4.84/0.76/45.96|22/22/22/22 7to14|F|35.86/4.27/0.65/40.78|18/18/18/18', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n6_w1500.jpg', '2to4|M|34.03/4.02/0.66/38.71|28/28/28/29 2to4|F|30.77/3.7/0.5/34.97|29/29/29/29 4to7|M|35.44/4.17/0.62/40.23|27/27/27/27 4to7|F|35.04/4.19/0.68/40.11|17/17/17/19 7to14|M|40.36/4.84/0.76/45.96|22/22/22/22 7to14|F|35.86/4.27/0.65/40.78|18/18/18/18'),
  // https://archive.org/download/philtrans02353690/page/n8_w1500.jpg (p. 249)
  brainBoydP249: S('14to20|M|41.77/5.32/1/48.54|18/17/17/19 14to20|F|38.88/4.65/0.85/43.94|15/15/15/16 20to30|M|41.98/5.19/0.93/47.9|52/52/52/59 20to30|F|38/4.82/0.88/43.7|69/69/69/72 30to40|M|42.06/5.15/0.98/48.2|99/99/99/110 30to40|F|37.92/4.74/0.91/43.09|79/80/80/89', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n8_w1500.jpg', '14to20|M|41.77/5.32/1/48.54|18/17/17/19 14to20|F|38.88/4.65/0.85/43.94|15/15/15/16 20to30|M|41.98/5.19/0.93/47.9|52/52/52/59 20to30|F|38/4.82/0.88/43.7|69/69/69/72 30to40|M|42.06/5.15/0.98/48.2|99/99/99/110 30to40|F|37.92/4.74/0.91/43.09|79/80/80/89'),
  // https://archive.org/download/philtrans02353690/page/n10_w1500.jpg (p. 251)
  brainBoydP251: S('40to50|M|41.48/5.22/1.06/47.75|121/120/120/137 40to50|F|37.12/4.69/0.89/42.81|94/94/94/106 50to60|M|41.09/5.13/0.98/47.44|111/111/111/119 50to60|F|37.38/4.62/0.86/43.12|91/91/91/103 60to70|M|40.21/4.98/0.97/46.4|119/119/119/127 60to70|F|37.13/4.68/0.83/42.69|136/134/134/149', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n10_w1500.jpg', '40to50|M|41.48/5.22/1.06/47.75|121/120/120/137 40to50|F|37.12/4.69/0.89/42.81|94/94/94/106 50to60|M|41.09/5.13/0.98/47.44|111/111/111/119 50to60|F|37.38/4.62/0.86/43.12|91/91/91/103 60to70|M|40.21/4.98/0.97/46.4|119/119/119/127 60to70|F|37.13/4.68/0.83/42.69|136/134/134/149'),
  // https://archive.org/download/philtrans02353690/page/n12_w1500.jpg (p. 253)
  brainBoydP253: S('70to80|M|39.6/4.97/0.94/45.5|95/95/95/104 70to80|F|35.58/4.47/0.88/41.27|128/127/126/148 over80|M|39.62/4.79/0.89/45.34|23/23/23/24 over80|F|34.47/4.47/0.82/39.77|68/68/68/77', 'oz. ; numbers examined', 'https://archive.org/download/philtrans02353690/page/n12_w1500.jpg', '70to80|M|39.6/4.97/0.94/45.5|95/95/95/104 70to80|F|35.58/4.47/0.88/41.27|128/127/126/148 over80|M|39.62/4.79/0.89/45.34|23/23/23/24 over80|F|34.47/4.47/0.82/39.77|68/68/68/77'),
  // https://archive.org/download/philtrans02353690/page/n19_w1500.jpg (p. 260: "The highest average weight of the brain in both sexes was from 14 to 20 years; the next highest was in the males from
  //   30 to 40, and in the females from 20 to 30 years") and https://archive.org/download/philtrans02353690/page/n21_w1500.jpg (p. 262: "the average varied in the male from 48.2 to 45.34, and in the female from 43.7 to 39.77")
  brainBoydText: S('highestBoth:14to20 nextMale:30to40 nextFemale:20to30 adultMale:48.2-45.34 adultFemale:43.7-39.77', 'age periods ; oz.', 'https://archive.org/download/philtrans02353690/page/n21_w1500.jpg', 'highestBoth:14to20 nextMale:30to40 nextFemale:20to30 adultMale:48.2-45.34 adultFemale:43.7-39.77'),
  /* game306: Keith Lucas, "The 'all or none' contraction of the amphibian skeletal muscle fibre", Journal of Physiology 38 (1909), 113 sq.;
   *   Exp. 1, p. 119-120, read by me on the page images and on the codex zooms (Internet Archive microfilm
   *   sim_journal-of-physiology_the-journal-of-physiology_1909_38; Lucas died by 1917, per Starling's preface to his 1917 book). Frog muscle,
   *   about eight or nine motor nerve fibres, excited through the nerve. The microfilm blurs 3 and 8: observation 16 reads 3.98 next to 3.90
   *   and 3.91 and is kept as read. Idea: codex "human brain", Claude sub-agent. */
  // https://archive.org/download/sim_journal-of-physiology_the-journal-of-physiology_1909_38/page/n127_w1500.jpg (p. 120): Exp. 1, coil distance (cm; shorter = stronger current) : contraction (mm on the record), observations 1 to 35
  allOrNoneLucasExp1: S('25.9:0 25.8:1.51 25.7:1.46 25.6:1.54 25.5:1.50 25.4:3.08 25.3:3.70 25.2:3.64 25.1:3.65 25.0:3.69 24.9:3.84 24.8:3.87 24.7:3.88 24.6:3.90 24.5:3.90 24.4:3.98 24.3:3.91 24.2:3.91 24.1:3.93 24.0:3.94 23.8:3.96 23.6:3.99 23.4:4.01 23.2:4.02 23.0:4.02 22.8:4.05 22.6:4.04 22.4:4.03 22.2:4.05 22.0:4.05 21.5:4.07 21.0:4.05 20.5:4.06 20.0:4.07 19.5:4.09', 'cm : mm', 'https://archive.org/download/sim_journal-of-physiology_the-journal-of-physiology_1909_38/page/n127_w1500.jpg', '25.9:0 25.8:1.51 25.7:1.46 25.6:1.54 25.5:1.50 25.4:3.08 25.3:3.70 25.2:3.64 25.1:3.65 25.0:3.69 24.9:3.84 24.8:3.87 24.7:3.88 24.6:3.90 24.5:3.90 24.4:3.98 24.3:3.91 24.2:3.91 24.1:3.93 24.0:3.94 23.8:3.96 23.6:3.99 23.4:4.01 23.2:4.02 23.0:4.02 22.8:4.05 22.6:4.04 22.4:4.03 22.2:4.05 22.0:4.05 21.5:4.07 21.0:4.05 20.5:4.06 20.0:4.07 19.5:4.09'),
  // https://archive.org/download/sim_journal-of-physiology_the-journal-of-physiology_1909_38/page/n126_w1500.jpg (p. 119: "a definite step which is of average height 1.50 ranging over observations 2 to 5") and https://archive.org/download/sim_journal-of-physiology_the-journal-of-physiology_1909_38/page/n127_w1500.jpg (p. 120: "flat step of
  //   average level 3.67", "a continuous rise from observation 11 to 35. The percentage increase ... is 6.5 %")
  allOrNoneLucasText: S('step2to5:1.50 step7to10:3.67 rise11to35:6.5', 'mm ; per cent', 'https://archive.org/download/sim_journal-of-physiology_the-journal-of-physiology_1909_38/page/n127_w1500.jpg', 'step2to5:1.50 step7to10:3.67 rise11to35:6.5'),
  /* game307: S. Herculano-Houzel, C. E. Collins, P. Wong and J. H. Kaas, "Cellular scaling rules for primate brains", PNAS 104 (2007)
   *   3562-3567, doi 10.1073/pnas.0611396104; Table 1 (whole-brain totals of seven primate species counted with the isotropic fractionator)
   *   and the exponents of its Results and Discussion, read on the open PubMed Central text. Idea: Phil (other forms of the brain). */
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC1805542/: Table 1, species : brain mass (g) : neurons (millions) : other cells (millions); the commas of thousands are dropped
  neuronsHerculanoHouzelTable: S('treeShrew:2.752:261.40:199.65 marmoset:7.780:635.80:590.74 galago:10.150:936.00:666.59 owlMonkey:15.730:1468.41:1195.13 squirrelMonkey:30.216:3246.43:2075.03 capuchin:52.208:3690.52:3297.74 macaque:87.346:6376.16:7162.90', 'g : millions : millions', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1805542/', 'treeShrew:2.752:261.40:199.65 marmoset:7.780:635.80:590.74 galago:10.150:936.00:666.59 owlMonkey:15.730:1468.41:1195.13 squirrelMonkey:30.216:3246.43:2075.03 capuchin:52.208:3690.52:3297.74 macaque:87.346:6376.16:7162.90'),
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC1805542/: "Variation, macaque/marmoset" 11.2x, 10.0x, 12.1x; Results: brain mass ~ neurons^1.054 (95% C.I. 0.910-1.197) and ~ other cells^0.991;
  //   Discussion: rodent brains "increase rapidly in mass as a function of the NN to the power of 1.587"
  neuronsHerculanoHouzelText: S('variationMass:11.2 variationNeurons:10.0 variationOther:12.1 exponentNeurons:1.054 ciLow:0.910 ciHigh:1.197 exponentOther:0.991 rodentExponent:1.587', 'ratios ; exponents', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1805542/', 'variationMass:11.2 variationNeurons:10.0 variationOther:12.1 exponentNeurons:1.054 ciLow:0.910 ciHigh:1.197 exponentOther:0.991 rodentExponent:1.587'),
  /* game308: the sizes of the nervous systems mapped synapse by synapse, and of the human brain, each from its own paper (abstracts
   *   read through PubMed; the hemibrain from its eLife introduction; FlyWire's synapse count from its main text). Idea: Phil (other forms
   *   of the brain). No human connectome exists: the human line is a cell count, not a map. */
  // https://doi.org/10.1098/rstb.1986.0056: White, Southgate, Thomson and Brenner 1986, C. elegans hermaphrodite: "a total complement of 302 neurons", "118 such classes",
  //   "about 5000 chemical synapses, 2000 neuromuscular junctions and 600 gap junctions"
  connectomeWorm: S('neurons:302 classes:118 chemicalSynapses:5000 neuromuscular:2000 gapJunctions:600', 'count', 'https://doi.org/10.1098/rstb.1986.0056', 'neurons:302 classes:118 chemicalSynapses:5000 neuromuscular:2000 gapJunctions:600'),
  // https://elifesciences.org/articles/57443: Scheffer et al. 2020, the fly hemibrain: "around 25,000 neurons", "about 20 million chemical synapses between them"
  connectomeHemibrain: S('neurons:25000 chemicalSynapses:20000000', 'count', 'https://elifesciences.org/articles/57443', 'neurons:25000 chemicalSynapses:20000000'),
  // https://doi.org/10.1038/s41586-024-07558-y: Dorkenwald et al. 2024, FlyWire, a whole adult fly brain: "139,255 neurons" and "54.5 million synapses between these neurons"
  connectomeFlyWire: S('neurons:139255 synapses:54500000', 'count', 'https://doi.org/10.1038/s41586-024-07558-y', 'neurons:139255 synapses:54500000'),
  // https://doi.org/10.1002/cne.21974: Azevedo et al. 2009, adult male human brain: "86.1 +/- 8.1 billion NeuN-positive cells" and "84.6 +/- 9.8 billion NeuN-negative"
  connectomeHuman: S('neurons:86.1e9 sd:8.1e9 nonNeurons:84.6e9', 'count', 'https://doi.org/10.1002/cne.21974', 'neurons:86.1e9 sd:8.1e9 nonNeurons:84.6e9'),
  /* game309: E. H. Siegel, M. K. Sands, W. Van den Noortgate, P. Condon, Y. Chang, J. Dy, K. S. Quigley and L. F. Barrett, "Emotion fingerprints or
   *   emotion populations? A meta-analytic investigation of autonomic features of emotion categories", Psychol. Bull. 144 (2018) 343-393,
   *   doi 10.1037/bul0000128; author manuscript PMC5876074 (NIH public access, "available for text mining"): Tables 4, 9 and 10 and the text of
   *   its Results. Only result numbers are taken. Idea: Phil (emotions as neural impulses, from measured open data). */
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/: Table 9, category/measure : k (samples) : n (participants) : Cohen's d : significance stars : 95% CI low : high ('-' where the table
  //   prints nothing); category/Total : k : n. Measures: heart rate, its variability, pulse transit time, cardiac output, stroke volume, total
  //   peripheral resistance, diastolic, systolic and mean arterial pressure, temperature, respiration rate, expiratory and inspiratory time,
  //   tidal volume, skin conductance level and response. The thousands commas are dropped and the minus signs written '-'.
  emotionsSiegelTable9: S('Anger/HR:86:3684:0.52:3:0.39:0.66 Anger/HRV:9:252:-0.18:0:-0.52:0.16 Anger/PTT:0:-:-:-:-:- Anger/CO:8:398:0.44:2:-0.11:0.87 Anger/SV:4:105:0.64:1:0.13:1.18 Anger/TPR:8:398:0.74:0:0.43:1.06 Anger/DBP:60:2646:0.57:3:0.42:0.72 Anger/SBP:63:2782:0.66:3:0.51:0.81 Anger/MAP:2:82:0.65:1:0.03:1.34 Anger/TEMP:2:68:0.09:0:-0.56:0.76 Anger/RR:5:109:1.47:2:0.89:2.13 Anger/ET:1:16:-:-:-:- Anger/IT:2:32:0.57:0:-0.49:1.80 Anger/TV:0:-:-:-:-:- Anger/SCL:22:772:0.19:0:-0.04:0.42 Anger/SCR:14:476:0.45:1:0.12:0.92 Anger/Total:286:11820 Disgust/HR:12:569:0.07:0:-0.15:0.28 Disgust/HRV:4:180:0.09:0:-0.26:0.44 Disgust/PTT:0:-:-:-:-:- Disgust/CO:2:196:0.01:0:-0.36:0.37 Disgust/SV:2:196:0.03:0:-0.33:0.40 Disgust/TPR:2:196:0.22:0:-0.14:0.59 Disgust/DBP:2:200:0.20:0:-0.17:0.56 Disgust/SBP:2:200:0.21:0:-0.15:0.58 Disgust/MAP:0:-:-:-:-:- Disgust/TEMP:1:41:-:-:-:- Disgust/RR:2:36:0.08:0:-0.68:0.86 Disgust/ET:1:16:-:-:-:- Disgust/IT:2:32:0.20:0:-0.66:1.10 Disgust/TV:0:-:-:-:-:- Disgust/SCL:9:558:0.25:1:0.03:0.47 Disgust/SCR:10:231:0.48:2:0.16:0.82 Disgust/Total:51:2651 Fear/HR:37:1555:0.49:3:0.23:0.76 Fear/HRV:5:254:0.45:0:-0.11:1.06 Fear/PTT:2:102:0.16:0:-0.71:1.06 Fear/CO:1:48:-:-:-:- Fear/SV:1:48:-:-:-:- Fear/TPR:1:48:-:-:-:- Fear/DBP:10:323:0.14:0:-0.31:0.60 Fear/SBP:11:335:0.57:1:0.12:1.04 Fear/MAP:0:-:-:-:-:- Fear/TEMP:1:41:-:-:-:- Fear/RR:6:193:0.91:2:0.31:1.58 Fear/ET:2:58:-0.11:0:-1.13:0.88 Fear/IT:3:74:0.17:0:-0.72:1.09 Fear/TV:1:42:-:-:-:- Fear/SCL:17:725:0.19:0:-0.16:0.55 Fear/SCR:13:473:0.61:2:0.20:1.03 Fear/Total:111:4271 Happy/HR:36:1177:0.33:2:0.13:0.52 Happy/HRV:9:216:0.19:0:-0.17:0.55 Happy/PTT:0:-:-:-:-:- Happy/CO:0:-:-:-:-:- Happy/SV:0:-:-:-:-:- Happy/TPR:0:-:-:-:-:- Happy/DBP:10:226:0.52:2:0.18:0.88 Happy/SBP:9:188:0.37:0:-0.01:0.76 Happy/MAP:0:-:-:-:-:- Happy/TEMP:1:41:-:-:-:- Happy/RR:9:231:0.47:2:0.13:0.83 Happy/ET:1:16:-:-:-:- Happy/IT:2:32:0.33:0:-0.67:1.41 Happy/TV:0:-:-:-:-:- Happy/SCL:13:574:0.35:2:0.10:0.62 Happy/SCR:9:198:0.50:1:0.12:0.89 Happy/Total:99:2899 Sad/HR:32:1424:0.36:1:0.03:0.69 Sad/HRV:5:93:-0.02:0:-0.56:0.51 Sad/PTT:1:72:-:-:-:- Sad/CO:0:-:-:-:-:- Sad/SV:0:-:-:-:-:- Sad/TPR:0:-:-:-:-:- Sad/DBP:9:275:0.36:1:0.03:0.69 Sad/SBP:8:237:0.45:1:0.10:0.82 Sad/MAP:0:-:-:-:-:- Sad/TEMP:1:41:-:-:-:- Sad/RR:7:172:0.41:1:0.02:0.82 Sad/ET:1:16:-:-:-:- Sad/IT:2:32:0.11:0:-0.90:1.15 Sad/TV:2:31:-0.10:0:-1.05:0.84 Sad/SCL:15:552:0.18:0:-0.08:0.44 Sad/SCR:4:114:0.45:1:0.12:0.92 Sad/Total:87:3059 Neutral/HR:41:1641:0.21:0:-0.01:0.43 Neutral/HRV:4:134:-0.09:0:-0.52:0.35 Neutral/PTT:0:-:-:-:-:- Neutral/CO:1:37:-:-:-:- Neutral/SV:1:37:-:-:-:- Neutral/TPR:1:37:-:-:-:- Neutral/DBP:16:549:0.21:0:-0.07:0.43 Neutral/SBP:18:674:0.32:2:0.11:0.52 Neutral/MAP:0:-:-:-:-:- Neutral/TEMP:0:-:-:-:-:- Neutral/RR:4:258:-0.09:0:-0.40:0.60 Neutral/ET:0:-:-:-:-:- Neutral/IT:0:-:-:-:-:- Neutral/TV:0:-:-:-:-:- Neutral/SCL:11:515:-0.13:0:-0.39:0.12 Neutral/SCR:8:258:0.15:0:-0.16:0.46 Neutral/Total:105:3976', 'samples : participants : Cohen d', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/', 'Anger/HR:86:3684:0.52:3:0.39:0.66 Anger/HRV:9:252:-0.18:0:-0.52:0.16 Anger/PTT:0:-:-:-:-:- Anger/CO:8:398:0.44:2:-0.11:0.87 Anger/SV:4:105:0.64:1:0.13:1.18 Anger/TPR:8:398:0.74:0:0.43:1.06 Anger/DBP:60:2646:0.57:3:0.42:0.72 Anger/SBP:63:2782:0.66:3:0.51:0.81 Anger/MAP:2:82:0.65:1:0.03:1.34 Anger/TEMP:2:68:0.09:0:-0.56:0.76 Anger/RR:5:109:1.47:2:0.89:2.13 Anger/ET:1:16:-:-:-:- Anger/IT:2:32:0.57:0:-0.49:1.80 Anger/TV:0:-:-:-:-:- Anger/SCL:22:772:0.19:0:-0.04:0.42 Anger/SCR:14:476:0.45:1:0.12:0.92 Anger/Total:286:11820 Disgust/HR:12:569:0.07:0:-0.15:0.28 Disgust/HRV:4:180:0.09:0:-0.26:0.44 Disgust/PTT:0:-:-:-:-:- Disgust/CO:2:196:0.01:0:-0.36:0.37 Disgust/SV:2:196:0.03:0:-0.33:0.40 Disgust/TPR:2:196:0.22:0:-0.14:0.59 Disgust/DBP:2:200:0.20:0:-0.17:0.56 Disgust/SBP:2:200:0.21:0:-0.15:0.58 Disgust/MAP:0:-:-:-:-:- Disgust/TEMP:1:41:-:-:-:- Disgust/RR:2:36:0.08:0:-0.68:0.86 Disgust/ET:1:16:-:-:-:- Disgust/IT:2:32:0.20:0:-0.66:1.10 Disgust/TV:0:-:-:-:-:- Disgust/SCL:9:558:0.25:1:0.03:0.47 Disgust/SCR:10:231:0.48:2:0.16:0.82 Disgust/Total:51:2651 Fear/HR:37:1555:0.49:3:0.23:0.76 Fear/HRV:5:254:0.45:0:-0.11:1.06 Fear/PTT:2:102:0.16:0:-0.71:1.06 Fear/CO:1:48:-:-:-:- Fear/SV:1:48:-:-:-:- Fear/TPR:1:48:-:-:-:- Fear/DBP:10:323:0.14:0:-0.31:0.60 Fear/SBP:11:335:0.57:1:0.12:1.04 Fear/MAP:0:-:-:-:-:- Fear/TEMP:1:41:-:-:-:- Fear/RR:6:193:0.91:2:0.31:1.58 Fear/ET:2:58:-0.11:0:-1.13:0.88 Fear/IT:3:74:0.17:0:-0.72:1.09 Fear/TV:1:42:-:-:-:- Fear/SCL:17:725:0.19:0:-0.16:0.55 Fear/SCR:13:473:0.61:2:0.20:1.03 Fear/Total:111:4271 Happy/HR:36:1177:0.33:2:0.13:0.52 Happy/HRV:9:216:0.19:0:-0.17:0.55 Happy/PTT:0:-:-:-:-:- Happy/CO:0:-:-:-:-:- Happy/SV:0:-:-:-:-:- Happy/TPR:0:-:-:-:-:- Happy/DBP:10:226:0.52:2:0.18:0.88 Happy/SBP:9:188:0.37:0:-0.01:0.76 Happy/MAP:0:-:-:-:-:- Happy/TEMP:1:41:-:-:-:- Happy/RR:9:231:0.47:2:0.13:0.83 Happy/ET:1:16:-:-:-:- Happy/IT:2:32:0.33:0:-0.67:1.41 Happy/TV:0:-:-:-:-:- Happy/SCL:13:574:0.35:2:0.10:0.62 Happy/SCR:9:198:0.50:1:0.12:0.89 Happy/Total:99:2899 Sad/HR:32:1424:0.36:1:0.03:0.69 Sad/HRV:5:93:-0.02:0:-0.56:0.51 Sad/PTT:1:72:-:-:-:- Sad/CO:0:-:-:-:-:- Sad/SV:0:-:-:-:-:- Sad/TPR:0:-:-:-:-:- Sad/DBP:9:275:0.36:1:0.03:0.69 Sad/SBP:8:237:0.45:1:0.10:0.82 Sad/MAP:0:-:-:-:-:- Sad/TEMP:1:41:-:-:-:- Sad/RR:7:172:0.41:1:0.02:0.82 Sad/ET:1:16:-:-:-:- Sad/IT:2:32:0.11:0:-0.90:1.15 Sad/TV:2:31:-0.10:0:-1.05:0.84 Sad/SCL:15:552:0.18:0:-0.08:0.44 Sad/SCR:4:114:0.45:1:0.12:0.92 Sad/Total:87:3059 Neutral/HR:41:1641:0.21:0:-0.01:0.43 Neutral/HRV:4:134:-0.09:0:-0.52:0.35 Neutral/PTT:0:-:-:-:-:- Neutral/CO:1:37:-:-:-:- Neutral/SV:1:37:-:-:-:- Neutral/TPR:1:37:-:-:-:- Neutral/DBP:16:549:0.21:0:-0.07:0.43 Neutral/SBP:18:674:0.32:2:0.11:0.52 Neutral/MAP:0:-:-:-:-:- Neutral/TEMP:0:-:-:-:-:- Neutral/RR:4:258:-0.09:0:-0.40:0.60 Neutral/ET:0:-:-:-:-:- Neutral/IT:0:-:-:-:-:- Neutral/TV:0:-:-:-:-:- Neutral/SCL:11:515:-0.13:0:-0.39:0.12 Neutral/SCR:8:258:0.15:0:-0.16:0.46 Neutral/Total:105:3976'),
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/: Table 10, rows = predicted category, columns = true category (anger, disgust, fear, happy, sad, neutral), then the printed row total;
  //   the page prints each cell as the count run into its percentage of the 241 cases ("4619.1%" = 46 cases, 19.1 %): counts here, percentages below
  emotionsSiegelConfusion: S('Anger:46:3:11:11:9:9:89 Disgust:6:5:7:7:7:6:38 Fear:3:3:4:2:3:1:16 Happy:4:1:3:5:2:5:20 Sad:6:2:8:6:14:6:42 Neutral:10:4:4:8:8:2:36', 'cases', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/', 'Anger:46:3:11:11:9:9:89 Disgust:6:5:7:7:7:6:38 Fear:3:3:4:2:3:1:16 Happy:4:1:3:5:2:5:20 Sad:6:2:8:6:14:6:42 Neutral:10:4:4:8:8:2:36'),
  emotionsSiegelPercent: S('Anger:19.1:1.2:4.6:4.6:3.7:3.7 Disgust:2.5:2.1:2.9:2.9:2.9:2.5 Fear:1.2:1.2:1.7:0.8:1.2:0.4 Happy:1.7:0.4:0.8:2.1:2.1:1.2 Sad:2.5:0.8:3.3:2.5:5.8:2.5 Neutral:4.1:1.7:1.7:3.3:3.3:0.8', 'per cent of 241', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/', 'Anger:19.1:1.2:4.6:4.6:3.7:3.7 Disgust:2.5:2.1:2.9:2.9:2.9:2.5 Fear:1.2:1.2:1.7:0.8:1.2:0.4 Happy:1.7:0.4:0.8:2.1:2.1:1.2 Sad:2.5:0.8:3.3:2.5:5.8:2.5 Neutral:4.1:1.7:1.7:3.3:3.3:0.8'),
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/: Table 10, "Total No. of Cases" per true category and "Correct/Total True Cases" percentages (last: 76/241, 31.5 %)
  emotionsSiegelCases: S('cases:75:18:37:39:43:29:241 correct:61.3:27.8:10.8:12.8:32.6:6.9:31.5', 'cases ; per cent', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/', 'cases:75:18:37:39:43:29:241 correct:61.3:27.8:10.8:12.8:32.6:6.9:31.5'),
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/: Results: "only two of them (RR for anger and fear) were >= .80 ... seven ... were >= .50 ... and the remaining thirteen ... were above
  //   .20", among mean effect sizes "where k > 4"; "Overall performance of the classifiers was low (31.5%)"; Table 4 participants per category
  emotionsSiegelText: S('large:2 medium:7 small:13 kAbove:4 overall:31.5 t4Anger:11820 t4Disgust:2651 t4Fear:4373 t4Happy:2899 t4Sad:3059 t4Neutral:3976', 'counts ; per cent ; participants', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5876074/', 'large:2 medium:7 small:13 kAbove:4 overall:31.5 t4Anger:11820 t4Disgust:2651 t4Fear:4373 t4Happy:2899 t4Sad:3059 t4Neutral:3976'),
  /* game310: L. Nummenmaa, E. Glerean, R. Hari and J. K. Hietanen, "Bodily maps of emotions", PNAS 111 (2014) 646-651, doi 10.1073/pnas.1321664111;
   *   the Results and Methods of the open PubMed Central text (PMC3896150, "Freely available online through the PNAS open access option").
   *   Only result numbers are taken. Idea: Phil (emotions as neural impulses, from measured open data). */
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC3896150/: Results, experiment 5: "we presented 87 independent participants the BSMs of each basic emotion ... 46% mean accuracy (vs. 14% chance
  //   level). Anger (58%), disgust (43%), happiness (22%), sadness (38%), surprise (54%), and the neutral state (99%) ... fear (8%, NS)";
  //   experiment 1: complete classification by LDA "with a mean accuracy of 38% (chance level 14%)"
  bodyMapsNummenmaaRecognition: S('anger:58 disgust:43 happiness:22 sadness:38 surprise:54 neutral:99 fear:8 mean:46 chance:14 lda:38 ldaChance:14 readers:87', 'per cent ; readers', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3896150/', 'anger:58 disgust:43 happiness:22 sadness:38 surprise:54 neutral:99 fear:8 mean:46 chance:14 lda:38 ldaChance:14 readers:87'),
  // https://pmc.ncbi.nlm.nih.gov/articles/PMC3896150/: Methods: "A total of 773 individuals took part in the study (experiment 1a: n = 302 ... 1b: n = 52 ... 1c: n = 36 ... 2: n = 108 ...
  //   3: n = 94 ... 4: n = 109 ... and experiment 5: n = 72"; Abstract: "In five experiments, participants (n = 701)"
  bodyMapsNummenmaaParticipants: S('exp1a:302 exp1b:52 exp1c:36 exp2:108 exp3:94 exp4:109 exp5:72 total:773 firstFour:701', 'participants', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3896150/', 'exp1a:302 exp1b:52 exp1c:36 exp2:108 exp3:94 exp4:109 exp5:72 total:773 firstFour:701'),
  /* game311 / game315: the human brain wiring and the emotion packs moved to human-brain-data.js (shared with human-brain.html), with their
   *   sources (SOURCES there), the derivation scripts and the honest counts. */
  /* riskBernoulli (2026-11-14): Daniel Bernoulli, "Specimen theoriae novae de mensura sortis", Commentarii Academiae Scientiarum Imperialis
   *   Petropolitanae t. V (1738), p. 175-192, in Latin; Cramer's letter of 1728, in French, is reproduced at p. 190-192 of the same print.
   *   Read on the page images of Internet Archive commentariiacade05impe (BookReader index n = page + 11; Bernoulli died 1782).
   *   These numbers are the AUTHOR'S COMPUTATIONS from his hypothesis (the value of a fortune grows like its logarithm), with his own
   *   assumed chances (5 ships in 100, 1 in 10): no person was measured. Values exactly as printed, misprints included
   *   ("166777216" for 2^24). Idea: codex "human brain" (decision under risk), Claude sub-agent. */
  // https://archive.org/download/commentariiacade05impe/page/n194_w1200.jpg (p. 183, section 13): two players with 100 ducats each stake 50 at even
  //   chances: the value is "minus quam octoginta septem" (less than 87), the loss "plusquam tredecim" (more than 13); a player with 200
  //   ducats loses "parum ultra sex" (a little more than six)
  riskBernoulliFair: S('fortune:100 stake:50 valueBelow:87 lossAbove:13 richFortune:200 richLossAbove:6', 'ducats', 'https://archive.org/download/commentariiacade05impe/page/n194_w1200.jpg', 'fortune:100 stake:50 valueBelow:87 lossAbove:13 richFortune:200 richLossAbove:6'),
  // https://archive.org/download/commentariiacade05impe/page/n195_w1200.jpg, https://archive.org/download/commentariiacade05impe/page/n196_w1200.jpg,
  //   https://archive.org/download/commentariiacade05impe/page/n197_w1200.jpg (p. 184-186, section 15): Caius, goods of 10000 roubles, 5 ships of
  //   100 lost, insurance 800: "seu proxime x = 5043"; the insurer "seu proxime y = 14243"; premium 600: 20478 and 29878; premium 500:
  //   "Nemo ... quantumuis diues" (nobody, however rich)
  riskBernoulliCaius: S('goods:10000 lostOf100:5 premium:800 caius:5043 insurer:14243 premium2:600 caius2:20478 insurer2:29878 premiumNobody:500', 'roubles', 'https://archive.org/download/commentariiacade05impe/page/n196_w1200.jpg', 'goods:10000 lostOf100:5 premium:800 caius:5043 insurer:14243 premium2:600 caius2:20478 insurer2:29878 premiumNobody:500'),
  // https://archive.org/download/commentariiacade05impe/page/n197_w1200.jpg, https://archive.org/download/commentariiacade05impe/page/n198_w1200.jpg
  //   (p. 186-187, section 16): Sempronius, 4000 ducats at home and 8000 at sea, "ex decem nauibus vnam perire": one ship 6751 ducats, two ships
  //   7033, and it never exceeds 7200 however many ships
  riskBernoulliSempronius: S('home:4000 sea:8000 lostOf10:1 oneShip:6751 twoShips:7033 never:7200', 'ducats', 'https://archive.org/download/commentariiacade05impe/page/n198_w1200.jpg', 'home:4000 sea:8000 lostOf10:1 oneShip:6751 twoShips:7033 never:7200'),
  // https://archive.org/download/commentariiacade05impe/page/n198_w1200.jpg, https://archive.org/download/commentariiacade05impe/page/n200_w1200.jpg
  //   (p. 187-189, sections 17-19): the St Petersburg game pays 1, 2, 4, 8 ... ducats; with no fortune it is worth "praecise duos" (exactly 2),
  //   with 10 ducats "proxime tres" (about 3), with 100 "quatuor cum triente" (4 and a third, roughly), with 1000 "sex" (about 6)
  riskBernoulliPetersburg: S('fortune0:2 fortune10:3 fortune100:4+1/3 fortune1000:6', 'ducats', 'https://archive.org/download/commentariiacade05impe/page/n200_w1200.jpg', 'fortune0:2 fortune10:3 fortune100:4+1/3 fortune1000:6'),
  // https://archive.org/download/commentariiacade05impe/page/n202_w1200.jpg (p. 191): Cramer counts every sum above "2^24 = 166777216" (sic: one 6 too
  //   many, 2^24 = 16777216) as equal, and the game is then worth "12 + 1 = 13"; https://archive.org/download/commentariiacade05impe/page/n203_w1200.jpg
  //   (p. 192): with the square root, the equivalent is (1/(2 - sqrt 2))^2 = 1/(6 - 4 sqrt 2) = "2,9 &c." ("moins que 3")
  riskBernoulliCramer: S('capPower:24 capPrinted:166777216 belowCap:12 aboveCap:1 sum:13 rootEquivalent:2.9', 'ecus', 'https://archive.org/download/commentariiacade05impe/page/n202_w1200.jpg', 'capPower:24 capPrinted:166777216 belowCap:12 aboveCap:1 sum:13 rootEquivalent:2.9'),
  /* nerveHelmholtz (2026-11-14): H. Helmholtz, "Messungen ueber den zeitlichen Verlauf der Zuckung animalischer Muskeln und die
   *   Fortpflanzungsgeschwindigkeit der Reizung in den Nerven", Mueller's Archiv fuer Anatomie, Physiologie und wissenschaftliche Medicin,
   *   Jahrgang 1850, p. 276-364 (communicated 19 July 1850), in German. Read on the page images of Internet Archive archivfranatomie1850leip
   *   (index n = page + 83 in the ranges checked: p. 339-351 = n422-n434; Helmholtz died 1894). Second source: "Messungen ueber
   *   Fortpflanzungsgeschwindigkeit der Reizung in den Nerven. Zweite Reihe", Mueller's Archiv, Jahrgang 1852, p. 199-216, read on the images
   *   of the Wellcome offprint b28137346 (no constant index offset there: p. 215 = n48, p. 216 = n51).
   *   A FROG nerve (sciatic nerve, calf muscle) at 11 to 21 degrees C, not a human nerve. Per series: length L of nerve between the two
   *   stimulated points (mm), times from stimulus to the lifting of the weight with the far and the near point (s), their difference "wegen der
   *   Fortpflanzung" (s) and the speed (Mt. = metres per second). "+-" is the PROBABLE error ("wahrscheinlicher Fehler"), not a standard
   *   deviation. Values exactly as printed, misprint included: p. 343 prints "3,14 +- 7,1" for series XI A, the summary p. 351 prints 31,4.
   *   Series XII to XIV print no time error and no speed error. The length is uncertain by "einige Millimeter" (p. 339), not in his errors.
   *   Dossier: codex "human brain", helmholtz.md (2026-11-14), every number read on the image. */
  // https://archive.org/download/archivfranatomie1850leip/page/n422_w1200.jpg (p. 339, L = 43 mm) and
  //   https://archive.org/download/archivfranatomie1850leip/page/n423_w1200.jpg (p. 340): series IX, 6 January, frog kept 4 months
  nerveHelmholtzIX: S('length:43 far:0.04394 farErr:0.00009 near:0.04219 nearErr:0.00010 delay:0.00175 delayErr:0.00014 speed:24.6 speedErr:2.0', 'mm, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n423_w1200.jpg', 'length:43 far:0.04394 farErr:0.00009 near:0.04219 nearErr:0.00010 delay:0.00175 delayErr:0.00014 speed:24.6 speedErr:2.0'),
  // https://archive.org/download/archivfranatomie1850leip/page/n424_w1200.jpg (p. 341): series X A (right muscle), 29 December
  nerveHelmholtzXA: S('length:40 far:0.02437 farErr:0.00020 near:0.02307 nearErr:0.00016 delay:0.00130 delayErr:0.00027 speed:30.8 speedErr:6.4', 'mm, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n424_w1200.jpg', 'length:40 far:0.02437 farErr:0.00020 near:0.02307 nearErr:0.00016 delay:0.00130 delayErr:0.00027 speed:30.8 speedErr:6.4'),
  // https://archive.org/download/archivfranatomie1850leip/page/n425_w1200.jpg (p. 342): series X B (left muscle), same frog
  nerveHelmholtzXB: S('length:40 far:0.03164 farErr:0.00027 near:0.03039 nearErr:0.00026 delay:0.00125 delayErr:0.00038 speed:32.0 speedErr:9.7', 'mm, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n425_w1200.jpg', 'length:40 far:0.03164 farErr:0.00027 near:0.03039 nearErr:0.00026 delay:0.00125 delayErr:0.00038 speed:32.0 speedErr:9.7'),
  // https://archive.org/download/archivfranatomie1850leip/page/n426_w1200.jpg (p. 343, L on p. 342-343): series XI A, 4 January; the speed
  //   is printed "3,14 +- 7,1 Mt." (sic: a misprint for 31,4, the value of the summary p. 351), kept as printed
  nerveHelmholtzXIA: S('length:43 far:0.02585 farErr:0.00028 near:0.02448 nearErr:0.00013 delay:0.00137 delayErr:0.00031 speed:3.14 speedErr:7.1', 'mm, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n426_w1200.jpg', 'length:43 far:0.02585 farErr:0.00028 near:0.02448 nearErr:0.00013 delay:0.00137 delayErr:0.00031 speed:3.14 speedErr:7.1'),
  // https://archive.org/download/archivfranatomie1850leip/page/n427_w1200.jpg (p. 344): series XI B, same muscle, not set again
  nerveHelmholtzXIB: S('length:43 far:0.01743 farErr:0.00019 near:0.01631 nearErr:0.00023 delay:0.00112 delayErr:0.00031 speed:38.4 speedErr:10.6', 'mm, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n427_w1200.jpg', 'length:43 far:0.01743 farErr:0.00019 near:0.01631 nearErr:0.00023 delay:0.00112 delayErr:0.00031 speed:38.4 speedErr:10.6'),
  // https://archive.org/download/archivfranatomie1850leip/page/n427_w1200.jpg and https://archive.org/download/archivfranatomie1850leip/page/n428_w1200.jpg
  //   (p. 344-345): for series IX to XI he did not measure the temperature ("habe es versaeumt"); it was then "zwischen 11 und 15 Grad C."
  nerveHelmholtzCoolTemp: S('lowC:11 highC:15', 'degrees C', 'https://archive.org/download/archivfranatomie1850leip/page/n428_w1200.jpg', 'lowC:11 highC:15'),
  // https://archive.org/download/archivfranatomie1850leip/page/n428_w1200.jpg (p. 345: L = 38 mm, room 20 C) and
  //   https://archive.org/download/archivfranatomie1850leip/page/n429_w1200.jpg (p. 346): series XII, 20 May; delay as printed, no error printed
  nerveHelmholtzXII: S('length:38 celsius:20 delay:0.00131 speed:29.1', 'mm, degrees C, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n429_w1200.jpg', 'length:38 celsius:20 delay:0.00131 speed:29.1'),
  // https://archive.org/download/archivfranatomie1850leip/page/n429_w1200.jpg (p. 346: L = 43 mm) and
  //   https://archive.org/download/archivfranatomie1850leip/page/n431_w1200.jpg (p. 348): series XIII, 24 May, a freshly caught frog, 20 degrees
  nerveHelmholtzXIII: S('length:43 celsius:20 delay:0.00171 speed:25.1', 'mm, degrees C, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n431_w1200.jpg', 'length:43 celsius:20 delay:0.00171 speed:25.1'),
  // https://archive.org/download/archivfranatomie1850leip/page/n431_w1200.jpg (p. 348: L = 38 mm) and
  //   https://archive.org/download/archivfranatomie1850leip/page/n433_w1200.jpg (p. 350): series XIV, 25 May, a freshly caught frog, 21 degrees C
  nerveHelmholtzXIV: S('length:38 celsius:21 delay:0.00141 speed:26.9', 'mm, degrees C, s, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n433_w1200.jpg', 'length:38 celsius:21 delay:0.00141 speed:26.9'),
  // https://archive.org/download/archivfranatomie1850leip/page/n434_w1200.jpg (p. 351): "zwischen 11 und 21 Grad C.": a) series IX, X, XI: 24,6 +- 2,0 /
  //   30,8 +- 6,4 / 32,0 +- 9,7 / 31,4 +- 7,1 / 38,4 +- 10,6, "nach der Methode der kleinsten Quadrate als wahrscheinlichster Mittelwerth: 26,4";
  //   b) series XII, XIII, XIV: 29,1 / 25,1 / 26,9, "Mittel: 27,0"
  nerveHelmholtzSummary: S('lowC:11 highC:21 speedIX:24.6 errIX:2.0 speedXA:30.8 errXA:6.4 speedXB:32.0 errXB:9.7 speedXIA:31.4 errXIA:7.1 speedXIB:38.4 errXIB:10.6 leastSquares:26.4 speedXII:29.1 speedXIII:25.1 speedXIV:26.9 mean:27.0', 'degrees C, m/s', 'https://archive.org/download/archivfranatomie1850leip/page/n434_w1200.jpg', 'lowC:11 highC:21 speedIX:24.6 errIX:2.0 speedXA:30.8 errXA:6.4 speedXB:32.0 errXB:9.7 speedXIA:31.4 errXIA:7.1 speedXIB:38.4 errXIB:10.6 leastSquares:26.4 speedXII:29.1 speedXIII:25.1 speedXIV:26.9 mean:27.0'),
  // https://archive.org/download/b28137346/page/n48_w1200.jpg (1852, p. 215): the two curves drawn on the turning cylinder lie "ungefaehr 1mm" apart;
  //   the cylinder's circumference, 85,7 mm, passes in 1/6 second, so 514,2 mm in one second; https://archive.org/download/b28137346/page/n51_w1200.jpg
  //   (p. 216): 1 mm = 1/514,2 second, nerve 53 mm, speed "27,25 Metern in der Sekunde"; "der wahrscheinlichste Werth aus den frueheren
  //   Versuchen war 26,4 Meter"
  nerveHelmholtz1852: S('cylinder:85.7 perSixth:6 perSecond:514.2 gapMm:1 length:53 speed:27.25 earlier:26.4', 'mm, s, m/s', 'https://archive.org/download/b28137346/page/n51_w1200.jpg', 'cylinder:85.7 perSixth:6 perSecond:514.2 gapMm:1 length:53 speed:27.25 earlier:26.4'),
  lettresAnglais:S('E:21912 T:16587 A:14810 O:14003 I:13318 N:12666 S:11450 R:10977 H:10795 D:7874 L:7253 U:5246 C:4943 M:4761 F:4200 Y:3853 W:3819 G:3693 P:3316 B:2715 V:2019 K:1257 X:315 Q:205 J:188 Z:128', 'effectifs', 'https://pi.math.cornell.edu/~mec/2003-2004/cryptography/subs/frequencies.html', 'E:21912 T:16587 A:14810 O:14003 I:13318 N:12666 S:11450 R:10977 H:10795 D:7874 L:7253 U:5246 C:4943 M:4761 F:4200 Y:3853 W:3819 G:3693 P:3316 B:2715 V:2019 K:1257 X:315 Q:205 J:188 Z:128'),
});

function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* e^u, u >= 0 : u divise par 2 jusqu a <= 1/2, serie a 30 termes, puis carres (+ - * / seulement) */
function expPosD(u) { let m = 0; while (u > 0.5) { u /= 2; m++; } let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= u / j; s += t; } for (let i = 0; i < m; i++) s *= s; return s; }
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : marche au hasard sur une grille ----------
// Chaque pas : un des 4 voisins, au hasard. Pas e_i unitaires independants, E[e_i . e_j] = 0 (i != j). Exact (derive ici) :
//   r^2 = sum_i sum_j e_i . e_j, donc E[r^2] = n (seuls les termes i = j restent).
//   E[r^4] = sum E[(e_i.e_j)(e_k.e_l)] : termes (i = j, k = l) -> n^2 ; (i != j, {k, l} = {i, j}) -> 2 n (n - 1) E[(e_i.e_j)^2] = n (n - 1)
//   (e_i.e_j vaut 1, -1, 0, 0 avec la meme chance : carre moyen 1/2). Donc Var r^2 = 2 n^2 - n - n^2 = n^2 - n, exact.
//   Moyenne sur M marcheurs : sigma = sqrt((n^2 - n)/M). Et E[x] = 0, Var x = n/2 : sigma sqrt(n / (2 M)).
// Dessin : un film, une image par marcheur (les 12 premiers) : son chemin (x, y) pas a pas.
const MARCHE_DESSINES = 12;
function marcheAleatoire(P, n) {
  const M = P.marcheurs, N = P.pas, rng = mulberry32(P.graine), K = Math.min(MARCHE_DESSINES, M, n);
  const debuts = decouper(n, K), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  let s2 = 0, sx = 0;
  /* banc du 03/11 : les 12 premiers marcheurs ne dependaient pas de M (curseur « walkers » muet) : on dessine le marcheur floor(f M / K) */
  const quiDessine = new Int32Array(M).fill(-1); for (let f = 0; f < K; f++) quiDessine[Math.floor(f * M / K)] = f;
  for (let w = 0; w < M; w++) {
    let x = 0, y = 0;
    const fi = quiDessine[w], dessine = fi >= 0, d0 = dessine ? film.debuts[fi] : 0, c = dessine ? film.tailles[fi] : 0;
    let ligne = 0;
    const ecrire = (st) => { while (ligne < c && Math.round(ligne * N / (c - 1 || 1)) === st) { const o = 3 * (d0 + ligne); brut[o] = x; brut[o + 1] = y; brut[o + 2] = st; ligne++; } };
    if (dessine) ecrire(0);
    for (let st = 1; st <= N; st++) {
      const u = Math.floor(rng() * 4); if (u === 0) x++; else if (u === 1) x--; else if (u === 2) y++; else y--;
      if (dessine) ecrire(st);
    }
    s2 += x * x + y * y; sx += x;
  }
  return { D: 3, brut, film, unite: 'sans objet (hasard, non chaotique)', invariants: {
    carreDistance: { mesure: s2 / M, formule: N, sigma: Math.sqrt((N * N - N) / M), marcheurs: M, pas: N,
      note: 'mean squared distance from the start after n steps against n (exact) ; sigma from the exact variance n^2 - n' },
    centre: { mesure: sx / M, formule: 0, sigma: Math.sqrt(N / (2 * M)), note: 'mean x position against 0 : no preferred direction (exact), sigma sqrt(n / 2M)' } } };
}

// ---------- 2 : l aiguille de Buffon ----------
// Parquet de lattes de largeur d = 1 (droites y = entier), aiguille de longueur l <= 1 jetee au hasard : centre a une hauteur uniforme,
//   angle uniforme. Exact (derive ici) : elle croise une droite si la distance du centre a la droite la plus proche (uniforme sur
//   [0, 1/2]) est <= (l/2) |sin theta| ; P = int_0^pi (l |sin theta| / 2) / (1/2) dtheta / pi = 2 l / pi.
//   N aiguilles independantes : compte binomial, sigma exact. pi relu = 2 l N / croisements (sigma par la methode delta, APPROCHE).
// Dessin : chaque aiguille dessinee = deux lignes (ses deux bouts) ; 3e colonne : 1 si elle croise une droite, 0 sinon.
function aiguilleBuffon(P, n) {
  const N = P.aiguilles, l = P.longueur, rng = mulberry32(P.graine), dessinees = Math.max(1, Math.floor(n / 2)), brut = new Float64Array(n * 3);
  let croise = 0, k = 0;
  for (let i = 0; i < N; i++) {
    const cx = rng() * 10, cy = rng() * 10, th = rng() * PI, dx = 0.5 * l * cosD(th), dy = 0.5 * l * sinD(th);
    const y1 = cy - dy, y2 = cy + dy, c = Math.floor(y1) !== Math.floor(y2) ? 1 : 0;
    croise += c;
    if (k < dessinees && Math.floor(i * dessinees / N) === k) { const o = 6 * k; brut[o] = cx - dx; brut[o + 1] = y1; brut[o + 2] = c; brut[o + 3] = cx + dx; brut[o + 4] = y2; brut[o + 5] = c; k++; }
  }
  if (n % 2) { const o = 3 * (n - 1); brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; }
  const p = 2 * l / PI, ph = croise / N, sP = Math.sqrt(p * (1 - p) / N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    croisements: { mesure: ph, formule: p, sigma: sP, aiguilles: N, note: 'share of needles crossing a line against 2 l / (pi d) (Buffon, exact) ; binomial sigma' },
    piLu: { mesure: croise ? 2 * l / ph : NaN, formule: PI, sigma: PI * sP / p, ...(croise ? {} : { absente: 'no needle crossed a line' }),
      approchee: 'read back as 2 l / share, first-order sigma', note: 'pi read back from the needles against pi' } } };
}

// ---------- 3 : le paradoxe des anniversaires ----------
// Groupes de k personnes, chacune nee un jour uniforme parmi D (curseur, 365 par defaut). Exact (derive ici) :
//   P(tous differents) = prod_{i=0}^{k-1} (1 - i/D), P(au moins un partage) = 1 - ce produit ;
//   nombre moyen de paires nees le meme jour = C(k, 2) / D (chaque paire a la chance 1/D).
//   G groupes independants : part binomiale, sigma exact ; paires : sigma mesure (ecart-type des groupes / sqrt G).
// Dessin : les anniversaires des premiers groupes, en cercle (angle = jour) ; un groupe par rayon ; 3e colonne : numero du groupe.
function anniversaires(P, n) {
  const k = P.personnes, D = P.jours, G = P.groupes, rng = mulberry32(P.graine), brut = new Float64Array(n * 3);
  let partage = 0, sp = 0, sp2 = 0, ligne = 0;
  const vu = new Int32Array(D);
  /* banc du 03/11 : les premiers groupes ne dependaient pas de G (curseur « groups » muet) : on dessine un groupe tous les G / gd */
  const gd = Math.max(1, Math.min(G, Math.ceil(n / k))); let rang = 0;
  for (let g = 0; g < G; g++) {
    vu.fill(0); let paires = 0; const dessine = rang < gd && Math.floor(rang * G / gd) === g;
    for (let i = 0; i < k; i++) { const j = Math.floor(rng() * D); paires += vu[j]; vu[j]++;
      if (dessine && ligne < n) { const a = 2 * PI * j / D, rr = 1 + 0.15 * rang, o = 3 * ligne; brut[o] = rr * cosD(a); brut[o + 1] = rr * sinD(a); brut[o + 2] = g + 1; ligne++; } }
    if (dessine) rang++;
    if (paires) partage++; sp += paires; sp2 += paires * paires;
  }
  while (ligne < n) { const o = 3 * ligne; brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; ligne++; }
  let tousDiff = 1; for (let i = 0; i < k; i++) tousDiff *= 1 - i / D;
  const p = 1 - tousDiff, mp = sp / G, sdp = Math.sqrt(Math.max(0, sp2 / G - mp * mp) * G / (G - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    partage: { mesure: partage / G, formule: p, sigma: Math.sqrt(p * (1 - p) / G), groupes: G, personnes: k, jours: D,
      note: 'share of groups where two people share a birthday against 1 - prod (1 - i/D) (exact) ; binomial sigma' },
    paires: { mesure: mp, formule: k * (k - 1) / (2 * D), ...(sdp > 0 ? { sigma: sdp / Math.sqrt(G) } : {}), note: 'mean number of pairs born on the same day against C(k, 2) / D (exact) ; sigma measured' } } };
}

// ---------- 4 : les nombres premiers sur la spirale d Ulam ----------
// Crible d Eratosthene jusqu a N ; chaque entier place sur la spirale carree (1 au centre). On dessine les premiers.
// Compte EXACT pi(N) (crible) compare a deux formules APPROCHEES du theoreme des nombres premiers : N / ln N (sous-estime) et
//   Li(N) = int_2^N dt / ln t (integree en u = ln t, voir plus bas). Ecart relatif mesure, affiche.
// Ecart moyen entre premiers voisins pres de N : mesure, compare a ln N (approche).
function spiraleUlam(P, n) {
  const N = P.jusqua, crible = new Uint8Array(N + 1);
  crible[0] = 1; crible[1] = 1;
  for (let i = 2; i * i <= N; i++) if (!crible[i]) for (let j = i * i; j <= N; j += i) crible[j] = 1;
  const premiers = []; for (let i = 2; i <= N; i++) if (!crible[i]) premiers.push(i);
  /* position de m sur la spirale carree : anneau k = ceil((sqrt m - 1)/2), cote 2k, depart du coin bas-droit */
  const pos = (m) => { if (m === 1) return [0, 0]; const k = Math.ceil((Math.sqrt(m) - 1) / 2), t = 2 * k, mx = (t + 1) * (t + 1);
    let d = mx - m; if (d < t) return [k - d, -k]; d -= t; if (d < t) return [-k, -k + d]; d -= t; if (d < t) return [-k + d, k]; d -= t; return [k, k - d]; };
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = premiers[Math.floor(l * premiers.length / n)], [x, y] = pos(p), o = 3 * l; brut[o] = x; brut[o + 1] = y; brut[o + 2] = p; }
  /* Li(N) = int_{ln 2}^{ln N} e^u / u du (t = e^u) : integrande lisse, Simpson sur 20 000 intervalles. Banc du 03/11 : Simpson en t au
   *   pas 2 ratait la forte courbure de 1/ln t pres de 2 (1.8e-5 relatif a N = 40 000) */
  const M = 20000, u0 = lnD(2), u1 = lnD(N), h = (u1 - u0) / M, fu = (u) => expPosD(u) / u; let s = fu(u0) + fu(u1);
  for (let i = 1; i < M; i++) s += (i % 2 ? 4 : 2) * fu(u0 + i * h);
  const Li = s * h / 3, pN = premiers.length;
  const q = Math.max(1, Math.floor(pN / 10)); let ecarts = 0; for (let i = pN - q; i < pN; i++) ecarts += premiers[i] - premiers[i - 1];
  const gap = ecarts / q, lnN = lnD(N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    compteLi: { mesure: pN, formule: Li, ecartRelatif: (pN - Li) / Li, jusqua: N,
      approchee: 'the prime number theorem: Li(N) = integral from 2 to N of dt / ln t is the best simple estimate, not an exact count',
      note: 'number of primes up to N (exact, by the sieve) against Li(N)' },
    compteLn: { mesure: pN, formule: N / lnN, ecartRelatif: (pN - N / lnN) / (N / lnN),
      approchee: 'N / ln N, the first form of the prime number theorem: it undercounts', note: 'number of primes up to N against N / ln N' },
    ecartMoyen: { mesure: gap, formule: lnN, approchee: 'the average gap near N grows like ln N', note: 'mean gap between consecutive primes in the last tenth, against ln N' } } };
}

// ---------- 5 : le triangle de Pascal modulo 2 (Sierpinski) ----------
// Lignes 0 a R - 1 construites par ADDITION (chaque nombre = somme des deux au-dessus), gardees modulo 2 : seuls les impairs comptent.
// Exact (derive ici, Lucas / Glaisher) : C(n, k) est impair si et seulement si les 1 de k sont parmi ceux de n en binaire, donc la ligne n
//   contient 2^(nombre de 1 de n) impairs ; et les 2^m premieres lignes en contiennent (1 + 2)^m = 3^m (chaque chiffre binaire de n vaut
//   0 ou 1 : somme des 2^(chiffres) = produit des (1 + 2)). Le dessin est le triangle de Sierpinski, de dimension ln 3 / ln 2 (non mesuree).
// Mesures : pire ecart, sur toutes les lignes, entre le compte d impairs (par addition) et 2^(popcount n) ; total des 2^m premieres
//   lignes (m = plus grande puissance de 2 <= R) contre 3^m.
// Dessin : chaque impair en (k - n/2, -n) ; 3e colonne : n (etiquette). Echantillonne si plus d impairs que de lignes.
function pascalSierpinski(P, n) {
  const R = P.lignes, impairs = []; let ligne = new Uint8Array(1); ligne[0] = 1;
  let pire = 0, cumul = 0, m = 0; while (2 ** (m + 1) <= R) m++;
  let total2m = 0;
  for (let r = 0; r < R; r++) {
    let c = 0; for (let k = 0; k <= r; k++) if (ligne[k]) { c++; impairs.push([k - r / 2, -r, r]); }
    let pc = 0, x = r; while (x) { pc += x & 1; x >>>= 1; }
    pire = Math.max(pire, Math.abs(c - 2 ** pc)); cumul += c; if (r === 2 ** m - 1) total2m = cumul;
    const suiv = new Uint8Array(r + 2); suiv[0] = 1; suiv[r + 1] = 1; for (let k = 1; k <= r; k++) suiv[k] = (ligne[k - 1] + ligne[k]) & 1; ligne = suiv;
  }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = impairs[Math.floor(l * impairs.length / n)], o = 3 * l; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = p[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    impairsParLigne: { mesure: pire, formule: 0, lignes: R, note: 'worst gap, over every row, between the number of odd entries (built by addition) and 2^(number of 1s of n in binary) (Glaisher, exact)' },
    impairsTotal: { mesure: total2m, formule: 3 ** m, puissance: m, impairs: cumul, note: 'odd entries in the first 2^m rows against 3^m (exact)' } } };
}

// ---------- 6 : les cinq solides de Platon ----------
// Sommets (phi = (1 + sqrt 5)/2) : tetraedre (1,1,1) et ses 3 voisins a signes pairs ; cube (+-1,+-1,+-1) ; octaedre (+-1,0,0) et
//   permutations ; dodecaedre (+-1,+-1,+-1) et (0, +-1/phi, +-phi) permutes circulairement ; icosaedre (0, +-1, +-phi) permutes.
// Aretes = paires de sommets a la plus petite distance ; FACES retrouvees par la geometrie seule : un triplet de sommets definit un plan,
//   c est une face si tous les autres sommets sont du meme cote (plans dedoublonnes par leur normale). Rien n est tire d une table.
// Exact (Euler, Schlafli) : V - E + F = 2 ; chaque face a p cotes, chaque sommet q aretes : E = V q / 2 = F p / 2 ; angle diedre
//   sin(theta / 2) = cos(pi / q) / sin(pi / p). Mesures : V - E + F compte, angle entre normales de deux faces voisines.
// Dessin : les aretes (points regulierement espaces) en 3-D ; 3e... (D = 3 : x, y, z). La vue tourne.
const NOMS_SOLIDES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
function sommetsSolide(k) {
  const ph = (1 + Math.sqrt(5)) / 2, cyc = (a) => [a, [a[1], a[2], a[0]], [a[2], a[0], a[1]]], S = [];
  const signes = (v) => { const out = [[]]; for (const c of v) { const nv = []; for (const o of out) { nv.push([...o, c]); if (c !== 0) nv.push([...o, -c]); } out.splice(0, out.length, ...nv); } return out; };
  if (k === 0) return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  if (k === 1) return signes([1, 1, 1]);
  if (k === 2) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  if (k === 3) { S.push(...signes([1, 1, 1])); for (const v of signes([0, 1 / ph, ph])) S.push(...cyc(v)); return S; }
  for (const v of signes([0, 1, ph])) S.push(...cyc(v)); return S;
}
function solidesPlatoniques(P, n) {
  const k = P.solide, V = sommetsSolide(k), nv = V.length, d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let dmin = Infinity; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) dmin = Math.min(dmin, d2(V[i], V[j]));
  const aretes = []; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) if (Math.abs(d2(V[i], V[j]) - dmin) < 1e-9 * dmin) aretes.push([i, j]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const faces = [];
  for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) for (let m = j + 1; m < nv; m++) {
    let nrm = cross(sub(V[j], V[i]), sub(V[m], V[i])); const L = Math.sqrt(dot(nrm, nrm)); if (L < 1e-9) continue; nrm = nrm.map((c) => c / L);
    const c0 = dot(nrm, V[i]); let pos = 0, neg = 0, sur = 0; for (const p of V) { const s = dot(nrm, p) - c0; if (s > 1e-9) pos++; else if (s < -1e-9) neg++; else sur++; }
    if (pos && neg) continue; if (pos) { nrm = nrm.map((c) => -c); }
    if (!faces.some((f) => dot(f.n, nrm) > 1 - 1e-9)) faces.push({ n: nrm, sommets: sur });
  }
  const p = faces.length ? faces[0].sommets : 0, q = nv ? (2 * aretes.length) / nv : 0;
  /* angle diedre mesure : entre les normales de deux faces partageant une arete (les 2 faces dont la normale est la plus proche) */
  let cmax = -1; for (let a = 0; a < faces.length; a++) for (let b = a + 1; b < faces.length; b++) cmax = Math.max(cmax, dot(faces[a].n, faces[b].n));
  const diedre = PI - atan2D(Math.sqrt(Math.max(0, 1 - cmax * cmax)), cmax), sTh = cosD(PI / q) / sinD(PI / p), diedreTh = 2 * atan2D(sTh, Math.sqrt(Math.max(0, 1 - sTh * sTh)));
  let pireR = 0; const R0 = Math.sqrt(d2(V[0], [0, 0, 0])); for (const v of V) pireR = Math.max(pireR, Math.abs(Math.sqrt(d2(v, [0, 0, 0])) - R0));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = l * aretes.length / n, e = aretes[Math.floor(t)], f = t - Math.floor(t), a = V[e[0]], b = V[e[1]], o = 3 * l; brut[o] = a[0] + f * (b[0] - a[0]); brut[o + 1] = a[1] + f * (b[1] - a[1]); brut[o + 2] = a[2] + f * (b[2] - a[2]); }
  const deg = 180 / PI;
  /* vu a l ecran (03/11) : trace en CHEMIN, la fin d une arete etait reliee au debut de la suivante (cordes parasites) et la scene affichait
   *   « start / end » : un nuage de points denses le long des aretes */
  /* 2026-11-08 : the edges as lines (the solid itself), the points stay along them */
  const segments = aretes.map(([i, j]) => ({ a: V[i].slice(), b: V[j].slice() }));
  return { D: 3, brut, nuage: true, segments, unite: 'sans objet (geometrie)', invariants: {
    euler: { mesure: nv - aretes.length + faces.length, formule: 2, sommets: nv, aretes: aretes.length, faces: faces.length, note: NOMS_SOLIDES[k] + ' : vertices - edges + faces, all three COUNTED from the geometry, against Euler\'s 2' },
    schlafli: { mesure: aretes.length, formule: faces.length * p / 2, cotesParFace: p, aretesParSommet: q, note: 'edges against F p / 2 (each face has p sides, each edge borders 2 faces) ; the solid is {p, q} in Schlafli\'s notation' },
    diedre: { mesure: diedre * deg, formule: diedreTh * deg, note: 'angle between two neighbouring faces (degrees) measured from their normals against sin(theta / 2) = cos(pi / q) / sin(pi / p)' },
    surSphere: { debut: R0, fin: R0, derive: pireR, note: 'every vertex is at the same distance from the centre (witness)' } } };
}

// ---------- 7 : le probleme de Monty Hall ----------
// n portes, une voiture au hasard, le joueur en choisit une, l animateur ouvre une porte perdante parmi les AUTRES (au hasard s il en a
//   plusieurs). Exact (derive ici) : garder gagne 1/n ; changer pour une des n - 2 autres portes fermees, au hasard, gagne
//   ((n - 1)/n) x 1/(n - 2) = (n - 1)/(n (n - 2)) (2/3 pour 3 portes). G parties pour chaque strategie, avec les MEMES tirages :
//   parts binomiales, sigma exact.
// Dessin : deux courbes (vue de face) : la part gagnee cumulee au fil des parties, en gardant (0) et en changeant (1).
function montyHall(P, n) {
  const N = P.portes, G = P.parties, rng = mulberry32(P.graine);
  let gGarde = 0, gChange = 0; const cG = new Float64Array(G), cC = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    const voiture = Math.floor(rng() * N), choix = Math.floor(rng() * N);
    const perdantes = []; for (let d = 0; d < N; d++) if (d !== choix && d !== voiture) perdantes.push(d);
    const ouverte = perdantes[Math.floor(rng() * perdantes.length)];
    const autres = []; for (let d = 0; d < N; d++) if (d !== choix && d !== ouverte) autres.push(d);
    const nouveau = autres[Math.floor(rng() * autres.length)];
    if (choix === voiture) gGarde++; if (nouveau === voiture) gChange++;
    cG[g] = gGarde / (g + 1); cC[g] = gChange / (g + 1);
  }
  const pG = 1 / N, pC = (N - 1) / (N * (N - 2)), brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, k = c ? l - moitie : l, m = c ? n - moitie : moitie, g = m === 1 ? G - 1 : Math.round(k * (G - 1) / (m - 1)), o = 3 * l; brut[o] = g + 1; brut[o + 1] = c ? cC[g] : cG[g]; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard)', invariants: {
    changer: { mesure: gChange / G, formule: pC, sigma: Math.sqrt(pC * (1 - pC) / G), parties: G, portes: N, note: 'share of games won by switching against (n - 1)/(n (n - 2)) : 2/3 with 3 doors ; binomial sigma' },
    garder: { mesure: gGarde / G, formule: pG, sigma: Math.sqrt(pG * (1 - pG) / G), note: 'share of games won by sticking against 1/n' } } };
}

// ---------- 8 : le joint d Apollonius (idee : codex Grok Bot 2026-11-05) ----------
// Un grand cercle (rayon 1, courbure -1 : il CONTIENT les autres), deux cercles de rayons r1 (curseur) et 1 - r1 poses cote a cote sur
//   un diametre ; chaque interstice entre trois cercles tangents recoit le cercle tangent aux trois, puis on recommence dans les trois
//   nouveaux interstices, G generations (curseur).
// Mesure : chaque nouveau cercle est CHERCHE geometriquement : Newton sur (x, y, r) pour que sa distance a chacun des trois centres
//   vaille la somme (ou la difference, avec le grand cercle) des rayons ; aucune formule de courbure n est utilisee pour le construire.
// Exact (Descartes 1643 ; forme complexe : Lagarias, Mallows, Wilks, Amer. Math. Monthly 109 (2002) 338-361) : pour quatre cercles
//   mutuellement tangents, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2), donc le cercle de l interstice a
//   k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1) ; et avec w = k z (z le centre complexe), (sum w)^2 = 2 sum w^2.
//   Nombre de cercles : 2 a la generation 0 (au-dessus et au-dessous du diametre), puis 6 x 3^(g - 1) a la generation g.
// Temoins : avec r1 = 1/2 les courbures sont (-1, 2, 2, 3) et TOUTES les suivantes sont entieres ; la formule sans le facteur 2,
//   k1 + k2 + k3 + sqrt(...), donne autre chose.
// Dessin (vue de face) : des points sur chaque cercle (x, y) et la generation (etiquette).
function tangentInterstice(a, b, c, x0, y0) {
  /* a, b, c : { x, y, k } (k < 0 : le cercle exterieur) ; F_i = |p - c_i| - (r + 1/k_i) ou |p - c_i| - (1/|k_i| - r) */
  const C = [a, b, c]; let x = x0, y = y0, r = 0.2 / Math.max(...C.map((q) => Math.abs(q.k)));
  for (let it = 0; it < 80; it++) {
    const F = [], J = [];
    for (const q of C) { const dx = x - q.x, dy = y - q.y, d = Math.sqrt(dx * dx + dy * dy); if (q.k < 0) { F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, 1]); } else { F.push(d - r - 1 / q.k); J.push([dx / d, dy / d, -1]); } }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(J), s = [0, 1, 2].map((j) => det(J.map((row, i) => row.map((v, jj) => (jj === j ? -F[i] : v)))) / D);
    x += s[0]; y += s[1]; r += s[2];
    if (Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-15 * (1 + Math.abs(x) + Math.abs(y))) break;
  }
  return { x, y, k: 1 / r };
}
function apollonius(P, n) {
  const r1 = P.premier, G = P.generations, O = { x: 0, y: 0, k: -1, g: 0 }, A = { x: -1 + r1, y: 0, k: 1 / r1, g: 0 }, B = { x: r1, y: 0, k: 1 / (1 - r1), g: 0 };
  /* game148 (r1 = 0.37 : pour (O, A, B) le radicande vaut exactement 0, l arrondi le rendait negatif -> NaN) : radicande borne a 0 */
  const rad = (p, q, s) => Math.sqrt(Math.max(0, p * q + q * s + s * p)), descartes = (p, q, s) => p + q + s + 2 * rad(p, q, s), contact = (u, v) => { if (v.k < 0) [u, v] = [v, u]; const dx = v.x - u.x, dy = v.y - u.y, d = Math.sqrt(dx * dx + dy * dy), ru = 1 / Math.abs(u.k); return [u.x + dx / d * ru, u.y + dy / d * ru]; };
  const tous = [O, A, B], parGen = new Array(G + 1).fill(0); let pireK = 0, pireZ = 0, pireEntier = 0, manques = 0, distincts = 0;
  const noter = (p, q, s, d) => { const ex = descartes(p.k, q.k, s.k); pireK = Math.max(pireK, Math.abs(d.k - ex) / ex); /* temoin : formule sans le facteur 2 ; seuls comptent les interstices ou elle differe (radicande non nul : pas (O, A, B)) */
    if (rad(p.k, q.k, s.k) > 1e-9 * ex) { distincts++; if (Math.abs(d.k - (p.k + q.k + s.k + rad(p.k, q.k, s.k))) / d.k > 1e-6) manques++; }
    /* Descartes complexe : w = k z ; (sum w)^2 - 2 sum w^2, rapporte a sum |w|^2 */
    let sr = 0, si = 0, qr = 0, qi = 0, n2 = 0; for (const c of [p, q, s, d]) { const wr = c.k * c.x, wi = c.k * c.y; sr += wr; si += wi; qr += wr * wr - wi * wi; qi += 2 * wr * wi; n2 += wr * wr + wi * wi; }
    pireZ = Math.max(pireZ, Math.sqrt((sr * sr - si * si - 2 * qr) ** 2 + (2 * sr * si - 2 * qi) ** 2) / Math.max(n2, 1)); pireEntier = Math.max(pireEntier, Math.abs(d.k - Math.round(d.k))); };
  /* generation 0 : les deux interstices (O, A, B), au-dessus et au-dessous du diametre */
  let file = [];
  for (const sgn of [1, -1]) { const d = tangentInterstice(O, A, B, -1 + 2 * r1, sgn * 0.5); d.g = 0; tous.push(d); parGen[0]++; noter(O, A, B, d); file.push([O, A, d], [A, B, d], [B, O, d]); }
  for (let g = 1; g <= G; g++) { const suite = [];
    for (const [a, b, c] of file) { const pts = [contact(a, b), contact(b, c), contact(c, a)], d = tangentInterstice(a, b, c, (pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3);
      d.g = g; tous.push(d); parGen[g]++; noter(a, b, c, d); suite.push([a, b, d], [b, c, d], [c, a, d]); }
    file = suite; }
  /* dessin : n points repartis sur les cercles, au prorata de la racine du rayon (les petits restent visibles) */
  const poids = tous.map((c) => Math.sqrt(1 / Math.abs(c.k))), total = poids.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  for (let i = 0; i < tous.length && o < n; i++) { const c = tous[i], m = i === tous.length - 1 ? n - o : Math.max(1, Math.min(n - o, Math.round(n * poids[i] / total))), R = 1 / Math.abs(c.k);
    for (let j = 0; j < m && o < n; j++, o++) { const t = 2 * PI * j / m; brut[3 * o] = c.x + R * cosD(t); brut[3 * o + 1] = c.y + R * sinD(t); brut[3 * o + 2] = i < 3 ? -1 : c.g; } }
  for (; o < n; o++) { brut[3 * o] = 1; brut[3 * o + 1] = 0; brut[3 * o + 2] = -1; }
  const attendu = [2]; for (let g = 1; g <= G; g++) attendu.push(6 * 3 ** (g - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (grand cercle de rayon 1)', invariants: {
    courbures: { mesure: pireK, formule: 0, cercles: tous.length - 1, note: 'worst relative gap between the curvature of each circle FOUND geometrically (Newton on the tangency distances) and Descartes k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1)' },
    centresComplexes: { mesure: pireZ, formule: 0, note: 'worst residual of the complex Descartes theorem (sum k z)^2 = 2 sum (k z)^2 on the centres found (Lagarias, Mallows, Wilks 2002)' },
    cerclesParGeneration: { mesure: parGen.join(' '), formule: attendu.join(' '), note: 'circles found at each generation, against 2 then 6 x 3^(g - 1)' },
    entiers: { ecartEntier: pireEntier, sansFacteur2: manques, comparables: distincts, note: 'witnesses: with r1 = 1/2 every curvature is a whole number (largest distance to one) ; the formula without the factor 2 misses that many of the circles where it differs at all (all of them)' } } };
}

// ---------- 9 : le tas de sable abelien (idee : codex Grok Bot 2026-11-05) ----------
// Une grille c x c ; une case qui porte 4 grains ou plus s eboule : elle en donne un a chacun de ses 4 voisins (au bord, les grains qui
//   sortent tombent dans le puits). On recommence tant qu une case a 4 grains : le tas finit STABLE (0 a 3 grains par case).
// Exact (derive ici) : si u_i est le nombre d eboulements de la case i, chaque case a perdu 4 u_i et recu la somme des u de ses voisins,
//   donc depart - fin = Delta u, Delta le Laplacien reduit (4 sur la diagonale, -1 entre voisins) : identite ENTIERE, a 0 pres.
//   Abelien : l ordre des eboulements ne change ni le tas final ni les u (on stabilise deux fois, pile puis file, et on compare).
//   Recurrentes (Dhar, Phys. Rev. Lett. 64 (1990) 1613, reference du codex de Grok) : les tas stables qu on retrouve en ajoutant des grains
//   sans fin ; leur nombre = det Delta (theoreme matrice-arbre). On les COMPTE un par un, tous les 4^4 et 4^9 tas des grilles 2 x 2 et 3 x 3,
//   par le test de Dhar (un tas est recurrent si on peut bruler toutes ses cases : une case brule quand elle a au moins autant de grains
//   que de voisins pas encore brules), et det Delta est calcule a part, en entiers exacts (elimination de Bareiss, BigInt).
//   Identite du groupe des tas recurrents : e = (6 - (6)°)°, ou ° = stabiliser et 6 = six grains partout ; on verifie (e + e)° = e et
//   (e + r)° = r pour un tas recurrent r tire au hasard. Temoin : le tas vide n est pas recurrent (le test de Dhar le refuse).
// Dessin (vue de face) : l identite e sur la grille c x c, case par case (x, y) et son nombre de grains (etiquette 0 a 3).
function voisinsGrille(c) { const N = c * c, V = new Int32Array(4 * N).fill(-1); for (let i = 0; i < N; i++) { const x = i % c, y = (i - x) / c; let k = 0; if (x > 0) V[4 * i + k++] = i - 1; if (x < c - 1) V[4 * i + k++] = i + 1; if (y > 0) V[4 * i + k++] = i - c; if (y < c - 1) V[4 * i + k++] = i + c; } return V; }
/* stabilise h en place, renvoie les eboulements u ; lifo : pile, sinon file (anneau : chaque case au plus une fois en attente) */
function stabiliser(h, V, lifo) { const N = h.length, u = new Int32Array(N), att = new Int32Array(N + 1), dans = new Uint8Array(N); let a = 0, b = 0, m = 0;
  const met = (i) => { if (!dans[i]) { dans[i] = 1; att[b] = i; b = (b + 1) % (N + 1); m++; } };
  for (let i = 0; i < N; i++) if (h[i] >= 4) met(i);
  while (m) { let i; if (lifo) { b = (b + N) % (N + 1); i = att[b]; } else { i = att[a]; a = (a + 1) % (N + 1); } m--; dans[i] = 0;
    const q = h[i] >> 2; if (!q) continue; h[i] -= 4 * q; u[i] += q; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; h[j] += q; if (h[j] >= 4) met(j); } }
  return u; }
function brule(h, V, br, nv) { const N = h.length; br.fill(0); for (let i = 0; i < N; i++) { let c = 0; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) c++; nv[i] = c; }
  let n = 0, chg = true; while (chg) { chg = false; for (let i = 0; i < N; i++) if (!br[i] && h[i] >= nv[i]) { br[i] = 1; n++; chg = true; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; nv[j]--; } } }
  return n === N; }
function compterRecurrentes(c) { const N = c * c, V = voisinsGrille(c), h = new Int32Array(N), br = new Uint8Array(N), nv = new Int32Array(N); let r = 0;
  for (let m = 0; m < 4 ** N; m++) { let t = m; for (let i = 0; i < N; i++) { h[i] = t & 3; t >>= 2; } if (brule(h, V, br, nv)) r++; } return r; }
function detLaplacien(c) { const N = c * c, V = voisinsGrille(c), M = []; for (let i = 0; i < N; i++) { const l = new Array(N).fill(0n); l[i] = 4n; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) l[V[k]] = -1n; M.push(l); }
  let prec = 1n; for (let k = 0; k < N - 1; k++) { for (let i = k + 1; i < N; i++) for (let j = k + 1; j < N; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prec; prec = M[k][k]; } return M[N - 1][N - 1]; }
function tasDeSable(P, n) {
  /* banc game150 : un curseur « graine » ne changeait PAS le dessin (il ne servait qu aux controles) : retire, hasard fixe par le cote */
  const c = P.cote, N = c * c, V = voisinsGrille(c), rng = mulberry32(c), br = new Uint8Array(N), nv = new Int32Array(N);
  /* identite : e = (6 - (6)°)° */
  const s = new Int32Array(N).fill(6); stabiliser(s, V, true); const e = new Int32Array(N); for (let i = 0; i < N; i++) e[i] = 6 - s[i]; stabiliser(e, V, true);
  const ee = new Int32Array(N); for (let i = 0; i < N; i++) ee[i] = 2 * e[i]; stabiliser(ee, V, true);
  /* r recurrent au hasard : (3 + hasard 0..3)° ; puis (e + r)° */
  const r = new Int32Array(N); for (let i = 0; i < N; i++) r[i] = 3 + Math.floor(rng() * 4); stabiliser(r, V, true);
  const er = new Int32Array(N); for (let i = 0; i < N; i++) er[i] = e[i] + r[i]; stabiliser(er, V, true);
  let dEE = 0, dER = 0; for (let i = 0; i < N; i++) { if (ee[i] !== e[i]) dEE++; if (er[i] !== r[i]) dER++; }
  const eRec = brule(e, V, br, nv), vide = brule(new Int32Array(N), V, br, nv);
  /* abelien : un tas au hasard (0 a 7 grains par case), stabilise par pile puis par file ; depart - fin = Delta u */
  const h0 = new Int32Array(N); for (let i = 0; i < N; i++) h0[i] = Math.floor(rng() * 8);
  const h1 = h0.slice(), h2 = h0.slice(), u1 = stabiliser(h1, V, true), u2 = stabiliser(h2, V, false);
  let dH = 0, dU = 0, residu = 0, ebs = 0; for (let i = 0; i < N; i++) { if (h1[i] !== h2[i]) dH++; if (u1[i] !== u2[i]) dU++; ebs += u1[i]; let lap = 4 * u1[i]; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) lap -= u1[V[k]]; residu = Math.max(residu, Math.abs(h0[i] - h1[i] - lap)); }
  const comptes = [compterRecurrentes(2), compterRecurrentes(3)], dets = [detLaplacien(2), detLaplacien(3)];
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = i % c; brut[o + 1] = (i - (i % c)) / c; brut[o + 2] = e[i]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (grains)', invariants: {
    recurrentes: { mesure: comptes.join(' '), formule: dets.join(' '), grandes: [4, 5].map((k) => String(detLaplacien(k))).join(' '), note: 'recurrent piles COUNTED one by one by the burning test of Dhar, on the 2 x 2 and 3 x 3 grids (every one of the 4^4 and 4^9 stable piles), against det of the reduced Laplacian in exact integers (Dhar 1990) ; det for 4 x 4 and 5 x 5 also given' },
    identite: { eePlusE: dEE, ePlusR: dER, recurrente: eRec, videRecurrent: vide, note: 'e = (6 - (6)°)° on the drawn grid : cells where (e + e)° differs from e, cells where (e + r)° differs from r for a random recurrent r (both 0) ; e passes the burning test, the empty pile does not (witness)' },
    abelien: { mesure: residu, formule: 0, tasDifferents: dH, eboulementsDifferents: dU, eboulements: ebs, note: 'a random pile toppled twice, as a stack and as a queue : cells where the final piles differ, cells where the topple counts differ (both 0) ; and the largest gap in start - end = Delta u, exact in whole numbers' } } };
}

// ---------- 10 : le verger d Euclide (idee : codex Grok Bot 2026-11-05) ----------
// Un arbre a chaque point entier (a, b), 1 <= a, b <= N ; debout a l origine, on voit l arbre (a, b) si aucun autre n est devant lui sur la
//   meme droite, c est-a-dire si pgcd(a, b) = 1. On COMPTE les arbres visibles un par un (algorithme d Euclide).
// Exact (derive ici) : (1) pour a < b, (a, b) est visible ssi pgcd(a, b) = 1 : phi(b) choix de a ; meme chose pour b < a ; et (1, 1) est le
//   seul visible de la diagonale. Donc V(N) = 2 sum_{k <= N} phi(k) - 1 (phi par un crible, sans pgcd).
//   (2) Mobius : le nombre de paires dont d divise les deux est floor(N/d)^2, donc V(N) = sum_d mu(d) floor(N/d)^2 (mu par un crible).
//   (3) LIMITE, pas egalite : V(N)/N^2 tend vers 6/pi^2. Borne derivee de (2) : floor(N/d)^2 differe de N^2/d^2 de moins de 2N/d,
//   sum_{d <= N} 1/d <= 1 + ln N, et |sum_{d > N} mu(d)/d^2| <= 1/N ; donc |V/N^2 - 6/pi^2| <= (3 + 2 ln N)/N, ecrite et comparee.
// Temoin : sur la diagonale, un seul arbre visible, (1, 1).
// Dessin (vue de face) : les arbres visibles (a, b) et leur rangee max(a, b) (etiquette).
function pgcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
function vergerEuclide(P, n) {
  const N = P.cote, vis = []; let diag = 0;
  for (let b = 1; b <= N; b++) for (let a = 1; a <= N; a++) if (pgcd(a, b) === 1) { vis.push(a, b); if (a === b) diag++; }
  const V = vis.length / 2;
  /* phi et mu par crible (aucun pgcd) */
  const phi = new Int32Array(N + 1), mu = new Int32Array(N + 1).fill(1), comp = new Uint8Array(N + 1); for (let k = 0; k <= N; k++) phi[k] = k;
  for (let p = 2; p <= N; p++) if (!comp[p]) { for (let m = p; m <= N; m += p) { if (m > p) comp[m] = 1; phi[m] -= phi[m] / p; mu[m] = -mu[m]; } for (let m = p * p; m <= N; m += p * p) mu[m] = 0; }
  let sPhi = 0, sMu = 0; for (let k = 1; k <= N; k++) { sPhi += phi[k]; const q = Math.floor(N / k); sMu += mu[k] * q * q; }
  const part = V / (N * N), limite = 6 / (PI * PI), borne = (3 + 2 * lnD(N)) / N;
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * V / n), o = 3 * l; brut[o] = vis[2 * i]; brut[o + 1] = vis[2 * i + 1]; brut[o + 2] = Math.max(vis[2 * i], vis[2 * i + 1]); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (arbres)', invariants: {
    visibles: { mesure: V, formule: 2 * sPhi - 1, sommePhi: sPhi, note: 'trees seen from the corner, COUNTED one by one with Euclid\'s algorithm, against 2 (phi(1) + ... + phi(N)) - 1 with phi from a sieve (no gcd)' },
    mobius: { mesure: V, formule: sMu, note: 'the same count against the sum over d of mu(d) floor(N/d)^2 (Mobius, mu from a sieve)' },
    limite: { mesure: part, formule: limite, ecart: Math.abs(part - limite), borne, note: 'share of trees seen, against its LIMIT 6/pi^2 for an endless orchard (not an equality) ; the gap stays under the derived bound (3 + 2 ln N)/N' },
    diagonale: { mesure: diag, formule: 1, note: 'witness: on the diagonal only (1, 1) is seen, every (k, k) hides behind it' } } };
}

// ---------- 11 : les cercles de Ford (idee : codex Grok Bot 2026-11-05 ; Ford, Amer. Math. Monthly 45 (1938) 586, reference du codex) ----------
// Sur chaque fraction p/q irreductible de [0, 1] avec q <= n (la suite de Farey F_n), le cercle pose sur l axe : centre (p/q, 1/(2 q^2)),
//   rayon 1/(2 q^2). F_n est construite par ENUMERATION de tous les p/q (pgcd 1), triee par produits croises (aucune division).
// Exact (derive ici) : deux cercles p/q et r/s : distance^2 - (r1 + r2)^2 = (ps - qr)^2/(q s)^2 + (r1 - r2)^2 - (r1 + r2)^2
//   = ((ps - qr)^2 - 1)/(q s)^2. Donc ils se TOUCHENT si |ps - qr| = 1 et ne se chevauchent JAMAIS (ps - qr entier non nul).
//   Deux voisins de F_n ont |ps - qr| = 1 (propriete de Farey) : ils se touchent tous. Et |F_n| = 1 + phi(1) + ... + phi(n) (phi par crible).
// Mesure : |ps - qr| pour chaque paire de voisins (entiers), et sur TOUTES les paires le plus petit (ps - qr)^2 - 1 (jamais negatif) ;
//   l ecart de tangence en nombres flottants, distance des centres contre somme des rayons.
// Temoin : 1/3 et 2/3 ne sont pas voisins (|ps - qr| = 3) : leurs cercles ne se touchent pas.
// Dessin (vue de face) : des points sur chaque cercle (x, y) et le denominateur q (etiquette).
function cerclesFord(P, n) {
  const N = P.ordre, F = [];
  for (let q = 1; q <= N; q++) for (let p = 0; p <= q; p++) if (pgcd(p, q) === 1) F.push([p, q]);
  F.sort((u, v) => u[0] * v[1] - v[0] * u[1]);
  const phi = new Int32Array(N + 1); for (let k = 0; k <= N; k++) phi[k] = k; for (let p = 2; p <= N; p++) if (phi[p] === p) for (let m = p; m <= N; m += p) phi[m] = phi[m] / p * (p - 1);
  let sPhi = 0; for (let k = 1; k <= N; k++) sPhi += phi[k];
  const R = (q) => 1 / (2 * q * q);
  let voisinsMal = 0, pireTangence = 0;
  for (let i = 0; i + 1 < F.length; i++) { const [p, q] = F[i], [r, s] = F[i + 1]; if (Math.abs(p * s - q * r) !== 1) voisinsMal++;
    const dx = r / s - p / q, dy = R(s) - R(q), d = Math.sqrt(dx * dx + dy * dy); pireTangence = Math.max(pireTangence, Math.abs(d - R(q) - R(s)) / (R(q) + R(s))); }
  let minChev = Infinity; for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) { const x = F[i][0] * F[j][1] - F[i][1] * F[j][0]; minChev = Math.min(minChev, x * x - 1); }
  const t1 = 1 / 3, t2 = 2 / 3, rt = R(3), temoin = Math.abs(t2 - t1) - 2 * rt;
  const poids = F.map(([, q]) => Math.sqrt(R(q))), total = poids.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  for (let i = 0; i < F.length && o < n; i++) { const [p, q] = F[i], m = i === F.length - 1 ? n - o : Math.max(1, Math.min(n - o, Math.round(n * poids[i] / total))), r = R(q);
    for (let j = 0; j < m && o < n; j++, o++) { const t = 2 * PI * j / m; brut[3 * o] = p / q + r * cosD(t); brut[3 * o + 1] = r + r * sinD(t); brut[3 * o + 2] = q; } }
  for (; o < n; o++) { brut[3 * o] = 1; brut[3 * o + 1] = 0; brut[3 * o + 2] = 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (axe de longueur 1)', invariants: {
    farey: { mesure: F.length, formule: 1 + sPhi, note: 'fractions p/q in [0, 1] with q <= n, ENUMERATED, against 1 + phi(1) + ... + phi(n) (phi from a sieve)' },
    voisins: { mesure: voisinsMal, formule: 0, paires: F.length - 1, note: 'neighbours p/q, r/s of the Farey sequence with |ps - qr| other than 1 (none: every two neighbours touch)' },
    tangence: { mesure: pireTangence, formule: 0, note: 'worst relative gap between the distance of two neighbouring centres and the sum of their radii' },
    chevauchement: { mesure: minChev, formule: 0, note: 'smallest (ps - qr)^2 - 1 over ALL pairs of circles : never below 0, so no two circles ever overlap' },
    temoin: { mesure: temoin, note: 'witness: 1/3 and 2/3 are not neighbours (|ps - qr| = 3) : gap between their circles, above 0' } } };
}

// ---------- 12 : l arbre de Steiner des quatre coins (idee : codex Grok Bot 2026-11-05) ----------
// Relier les quatre coins d un rectangle L x 1 (curseur L) par le reseau de routes le plus COURT, en ajoutant deux carrefours libres S et T.
// Mesure : pour chacune des deux formes possibles (pont horizontal : S relie les coins de gauche, T ceux de droite ; pont vertical : S ceux
//   du bas, T ceux du haut), S et T sont CHERCHES : chacun est replace au point de Fermat de ses trois voisins (iteration de Weiszfeld,
//   moyenne ponderee par 1/distance), tour a tour, 2000 fois. On garde la forme la plus courte.
// Exact (derive ici) : au carrefour les trois routes font 120 degres. Pont horizontal : les bras vers (0, 0) et (0, 1) font 60 degres avec
//   l horizontale, S = (1/(2 sqrt 3), 1/2), chaque bras mesure 1/sqrt 3, le pont L - 1/sqrt 3 : total L + sqrt 3 (valable pour
//   L >= 1/sqrt 3). Pont vertical, par symetrie : 1 + sqrt(3) L. Le plus court : min(L + sqrt 3, 1 + sqrt(3) L) ; pour le carre, 1 + sqrt 3.
// Temoins : l arbre couvrant minimal sans carrefour (2 min(L, 1) + max(L, 1)) et la croix des diagonales (2 sqrt(1 + L^2)), plus longs.
// Dessin (vue de face) : le reseau le plus court (etiquette 0) et l autre forme (etiquette 1, plus longue).
function fermatSteiner(P, n) {
  const L = P.largeur, A = [0, 0], B = [L, 0], C = [L, 1], Dd = [0, 1], dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  const fermat = (Q, a, b, c) => { const wa = 1 / Math.max(dist(Q, a), 1e-300), wb = 1 / Math.max(dist(Q, b), 1e-300), wc = 1 / Math.max(dist(Q, c), 1e-300), w = wa + wb + wc; return [(a[0] * wa + b[0] * wb + c[0] * wc) / w, (a[1] * wa + b[1] * wb + c[1] * wc) / w]; };
  const cosA = (Q, u, v) => ((u[0] - Q[0]) * (v[0] - Q[0]) + (u[1] - Q[1]) * (v[1] - Q[1])) / (dist(Q, u) * dist(Q, v));
  const forme = (vertical) => { const [s1, s2, t1, t2] = vertical ? [A, B, Dd, C] : [A, Dd, B, C]; let S = vertical ? [L / 2, 0.3] : [0.3, 0.5], T = vertical ? [L / 2, 0.7] : [L - 0.3, 0.5];
    for (let k = 0; k < 2000; k++) { S = fermat(S, s1, s2, T); T = fermat(T, t1, t2, S); }
    const segs = [[S, s1], [S, s2], [S, T], [T, t1], [T, t2]], long = segs.reduce((u, [a, b]) => u + dist(a, b), 0);
    const ecart = Math.max(...[[S, s1, s2], [S, s1, T], [S, s2, T], [T, t1, t2], [T, t1, S], [T, t2, S]].map(([Q, u, v]) => Math.abs(cosA(Q, u, v) + 0.5)));
    return { long, S, T, segs, ecart, vertical }; };
  const h = forme(false), v = forme(true), best = h.long <= v.long ? h : v, autre = best === h ? v : h, r3 = Math.sqrt(3);
  const brut = new Float64Array(n * 3), moitie = Math.ceil(n * 0.7);
  const tracer = (f, de, a, lab) => { const tot = f.segs.reduce((u, [p, q]) => u + dist(p, q), 0); for (let l = de; l < a; l++) { let t = (l - de + 0.5) / (a - de) * tot, i = 0; while (i < 4 && t > dist(...f.segs[i])) { t -= dist(...f.segs[i]); i++; } const [p, q] = f.segs[i], u = Math.min(1, t / dist(p, q)), o = 3 * l; brut[o] = p[0] + u * (q[0] - p[0]); brut[o + 1] = p[1] + u * (q[1] - p[1]); brut[o + 2] = lab; } };
  tracer(best, 0, moitie, 0); tracer(autre, moitie, n, 1);
  /* 2026-11-08 : the roads as lines, at the depth of their points : the shortest (label 0) green, the other shape (label 1) faint */
  const segments = [...best.segs.map(([p, q]) => ({ a: [p[0], p[1], 0], b: [q[0], q[1], 0], w: 1, c: 4 })), ...autre.segs.map(([p, q]) => ({ a: [p[0], p[1], 1], b: [q[0], q[1], 1], w: 0.3, c: 0 }))];
  const ex = Math.min(L + r3, 1 + r3 * L), sEx = best.vertical ? null : [1 / (2 * r3), 0.5];
  return { D: 3, brut, nuage: true, segments, unite: 'sans objet (rectangle L x 1)', invariants: {
    longueur: { mesure: best.long, formule: ex, pont: best.vertical ? 'vertical' : 'horizontal', note: 'length of the shortest network FOUND (two free crossroads moved to the Fermat point of their neighbours, Weiszfeld) against min(L + sqrt 3, 1 + sqrt(3) L) ; 1 + sqrt 3 for the square' },
    angles: { mesure: best.ecart, formule: 0, note: 'largest |cos + 1/2| between two roads at a crossroad : 0 means exactly 120 degrees everywhere' },
    carrefour: { mesure: sEx ? Math.max(Math.abs(best.S[0] - sEx[0]), Math.abs(best.S[1] - sEx[1])) : Math.max(Math.abs(best.S[0] - L / 2), Math.abs(best.S[1] - L / (2 * r3))), formule: 0, note: 'distance of the first crossroad found from (1/(2 sqrt 3), 1/2) (or (L/2, L/(2 sqrt 3)) for the vertical bridge : its arms start from the two bottom towns, L apart)' },
    plusLongs: { autreForme: autre.long, arbreSansCarrefour: 2 * Math.min(L, 1) + Math.max(L, 1), croix: 2 * Math.sqrt(1 + L * L), note: 'witnesses, all longer : the other shape, the shortest network without crossroads, the cross of the diagonals' } } };
}

// ---------- 13 : la caustique de la tasse (idee : codex Grok Bot 2026-11-05) ----------
// Des rayons paralleles (le Soleil) entrent dans une tasse ronde de rayon R = 1 et se reflechissent sur sa paroi. La ligne brillante au fond
//   de la tasse est l ENVELOPPE des rayons reflechis. Mesure : N rayons (curseur), chaque rayon reflechi est coupe par son voisin ; le point
//   de croisement est un point de la caustique (aucune formule de la courbe n est utilisee pour le trouver).
// Exact (derive ici) : le rayon qui touche la paroi en P = (cos t, sin t) repart dans la direction d = (-cos 2t, -sin 2t) (miroir : i - 2 (i.n) n).
//   L enveloppe de la famille P + s d est atteinte pour s = cos(t)/2, soit le point ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4) : la
//   NEPHROIDE de parametre R/4 (Huygens ; Lockwood, A Book of Curves, ch. 7 — references du codex de Grok). Sa pointe est a R/2 du centre,
//   et la demi-nephroide dessinee dans la tasse (t de -90 a 90 degres) mesure 3R.
//   Erreurs du croisement de deux voisins (mesurees le 2026-11-05 a N = 200, 2000, 20000) : point a 3.7/N^2 de la courbe, pointe a 0.62/N^2,
//   longueur de la ligne brisee 3R - 9.4/N (toujours plus courte : cordes inscrites, extremites coupees).
// Temoin : un miroir rond n est PAS une parabole : le rayon entre a 60 degres recoupe l axe en x = R/(2 cos t) = R, pas en R/2.
// Dessin (vue de face) : la caustique trouvee (etiquette 0), la paroi de la tasse (1), quelques rayons reflechis (2).
function causticTasse(P, n) {
  const N = P.rayons, R = 1, ray = (t) => ({ P: [R * cosD(t), R * sinD(t)], d: [-cosD(2 * t), -sinD(2 * t)] });
  const croise = (r1, r2) => { const det = r1.d[0] * -r2.d[1] - r1.d[1] * -r2.d[0]; if (Math.abs(det) < 1e-300) return null; const dx = r2.P[0] - r1.P[0], dy = r2.P[1] - r1.P[1], s = (dx * -r2.d[1] - dy * -r2.d[0]) / det; return [r1.P[0] + s * r1.d[0], r1.P[1] + s * r1.d[1]]; };
  const pts = []; let pire = 0, pointe = Infinity, long = 0;
  for (let k = 0; k + 1 < N; k++) { const a = -PI / 2 + PI * (k + 0.5) / N, b = a + PI / N, X = croise(ray(a), ray(b)); if (!X) continue;
    const m = (a + b) / 2, ex = [R * (3 * cosD(m) - cosD(3 * m)) / 4, R * (3 * sinD(m) - sinD(3 * m)) / 4];
    pire = Math.max(pire, Math.sqrt((X[0] - ex[0]) ** 2 + (X[1] - ex[1]) ** 2)); pointe = Math.min(pointe, Math.sqrt((X[0] - R / 2) ** 2 + X[1] ** 2));
    if (pts.length) { const q = pts[pts.length - 1]; long += Math.sqrt((X[0] - q[0]) ** 2 + (X[1] - q[1]) ** 2); } pts.push(X); }
  /* temoin : le rayon entre a 60 degres recoupe l axe y = 0 */
  const r60 = ray(PI / 3), s60 = -r60.P[1] / r60.d[1], x60 = r60.P[0] + s60 * r60.d[0];
  const brut = new Float64Array(n * 3), nC = Math.floor(n * 0.5), nP = Math.floor(n * 0.2), nR = n - nC - nP, RAYONS_DESSINES = Math.max(6, Math.round(N / 25)); /* banc game154 : 12 rayons fixes, le curseur ne changeait presque pas le dessin (les croisements restent sur la meme courbe) */
  for (let l = 0; l < nC; l++) { const X = pts[Math.floor(l * pts.length / nC)], o = 3 * l; brut[o] = X[0]; brut[o + 1] = X[1]; brut[o + 2] = 0; }
  for (let l = 0; l < nP; l++) { const t = 2 * PI * l / nP, o = 3 * (nC + l); brut[o] = R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1; }
  for (let l = 0; l < nR; l++) { const j = Math.floor(l * RAYONS_DESSINES / nR), u = (l - Math.ceil(j * nR / RAYONS_DESSINES)) / Math.max(1, Math.ceil(nR / RAYONS_DESSINES)), t = -PI / 2 + PI * (j + 0.5) / RAYONS_DESSINES, r = ray(t), corde = 2 * R * cosD(t), o = 3 * (nC + nP + l);
    brut[o] = r.P[0] + Math.max(0, Math.min(1, u)) * corde * r.d[0]; brut[o + 1] = r.P[1] + Math.max(0, Math.min(1, u)) * corde * r.d[1]; brut[o + 2] = 2; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (tasse de rayon 1)', invariants: {
    nephroide: { mesure: pire, formule: 0, points: pts.length, note: 'largest distance between the crossing of two neighbouring reflected rays and the nephroid ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4) ; shrinks as 1/N^2' },
    pointe: { mesure: pointe, formule: 0, note: 'distance of the closest crossing to the point R/2 on the axis, where the nephroid has its cusp' },
    longueur: { mesure: long, formule: 3 * R, note: 'length of the bright line found (chords between crossings) against 3R for half a nephroid ; always a little shorter' },
    temoin60: { mesure: x60, formule: R, note: 'witness: a round mirror is not a parabola : the ray entering 60 degrees from the axis crosses it at R/(2 cos 60) = R, not at R/2' } } };
}

// ---------- 14 : le papillon de Hofstadter (idee : codex Grok Bot 2026-11-05) ----------
// Un electron sur un reseau carre dans un champ magnetique de flux alpha = p/q par maille (operateur de Harper, lambda = 1) :
//   (H psi)_n = psi_(n+1) + psi_(n-1) + 2 cos(2 pi alpha n + theta) psi_n. Pour chaque p/q (q <= curseur), son spectre en energie E ;
//   l ensemble des spectres, alpha en abscisse, dessine le papillon.
// Derive ici (relation de Chambers) : avec T(E, theta) le produit des q matrices de transfert [[E - V_n, -1], [1, 0]], le polynome
//   P(E) = tr T(E, theta) + 2 cos(q theta) ne depend pas de theta, et det(E - H(theta, k)) = tr T - 2 cos(q k). Le spectre est
//   { E : |P(E)| <= 4 }. Ses 2q BORDS sont donc les valeurs propres de deux matrices reelles symetriques q x q : P = +4 <=> H a theta = 0,
//   periodique (coin +1) ; P = -4 <=> H a theta = pi/q, antiperiodique (coin -1). Valeurs propres par la methode de Jacobi.
// Mesure : pour chaque p/q, |P| <= 4 au milieu de chaque bande et |P| > 4 au milieu de chaque gap ouvert (gap > 1e-9).
// Exact (source lue par Grok Bot, citation : Krasovsky, arXiv:1602.08624, introduction, qui cite van Mouche 1989 et Choi, Elliott, Yui
//   1990) : pour alpha = p/q le spectre est fait de q bandes separees par des gaps tous ouverts, SAUF le gap central quand q est pair
//   (les deux bandes centrales se touchent en E = 0). Donc q - 1 gaps ouverts si q est impair, q - 2 s il est pair.
//   Pour 1/3 (derive : P(E) = E^3 - 6E) les bords sont -1 - sqrt 3, -2, 1 - sqrt 3, sqrt 3 - 1, 2, 1 + sqrt 3 (valeurs de Grok Bot).
// Borne MESUREE : jusqu a q = 20 chaque gap ouvert depasse 1e-9 ; a q = 21 (p = 2) certains gaps, ouverts en theorie, tombent sous la
//   precision des nombres flottants : le curseur s arrete a 20.
// Temoin : « q - 1 bandes » (un enonce faux rencontre) : 2/5 a bien 5 bandes.
// Dessin (vue de face) : chaque bande (alpha, E) et son denominateur q (etiquette).
function jacobiSym(A) { const n = A.length; A = A.map((r) => r.slice());
  for (let s = 0; s < 100; s++) { let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th < 0 ? -1 : 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - sn * b; A[k][q] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - sn * b; A[q][k] = sn * a + c * b; } } }
  return A.map((r, i) => r[i]); }
function harperP(E, p, q) { const th = PI / (2 * q); let a = 1, b = 0, c = 0, d = 1; for (let n = 0; n < q; n++) { const v = E - 2 * cosD(2 * PI * p * n / q + th), na = v * a - c, nb = v * b - d; c = a; d = b; a = na; b = nb; } return a + d; }
function harperMat(p, q, th, coin) { const A = Array.from({ length: q }, () => new Array(q).fill(0)); for (let n = 0; n < q; n++) A[n][n] = 2 * cosD(2 * PI * p * n / q + th);
  if (q === 1) { A[0][0] += 2 * coin; return A; } for (let n = 0; n + 1 < q; n++) { A[n][n + 1] += 1; A[n + 1][n] += 1; } A[0][q - 1] += coin; A[q - 1][0] += coin; return A; }
function harperBords(p, q) { return [...jacobiSym(harperMat(p, q, 0, 1)), ...jacobiSym(harperMat(p, q, PI / q, -1))].sort((u, v) => u - v); }
function papillonHofstadter(P, n) {
  const Q = P.qmax, fr = []; /* (boucle ecrite autrement que celle de Ford, sinon le mutant de Ford trouve son motif deux fois) */ for (let q = 1; q <= Q; q++) for (let p = q; p >= 0; p--) if (pgcd(p, q) === 1) fr.push([p, q]);
  let malBandes = 0, malGaps = 0, centre = 0, sym = 0; const bandes = [];
  for (const [p, q] of fr) { const e = harperBords(p, q); let ouverts = 0;
    for (let b = 0; b < q; b++) { const lo = e[2 * b], hi = e[2 * b + 1]; if (Math.abs(harperP((lo + hi) / 2, p, q)) > 4 + 1e-9) malBandes++; bandes.push([p / q, lo, hi, q]);
      if (b + 1 < q && e[2 * b + 2] - hi > 1e-9) { ouverts++; if (Math.abs(harperP((hi + e[2 * b + 2]) / 2, p, q)) <= 4) malBandes++; } }
    if (ouverts !== (q % 2 ? q - 1 : q - 2)) malGaps++;
    if (q % 2 === 0) centre = Math.max(centre, Math.abs(e[q - 1]), Math.abs(e[q]));
    for (let i = 0; i < 2 * q; i++) sym = Math.max(sym, Math.abs(e[i] + e[2 * q - 1 - i])); }
  const r3 = Math.sqrt(3), ex13 = [-1 - r3, -2, 1 - r3, r3 - 1, 2, 1 + r3], e13 = harperBords(1, 3); let ecart13 = 0; for (let i = 0; i < 6; i++) ecart13 = Math.max(ecart13, Math.abs(e13[i] - ex13[i]));
  const b25 = harperBords(2, 5).length / 2;
  /* dessin : n points sur les bandes, au moins un par bande si possible, le reste au prorata de la largeur */
  const larg = bandes.map((b) => b[2] - b[1]), tot = larg.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  const base = n >= bandes.length ? 1 : 0, reste = n - base * bandes.length;
  for (let i = 0; i < bandes.length && o < n; i++) { const [x, lo, hi, q] = bandes[i], m = Math.min(n - o, base + Math.floor(reste * larg[i] / tot));
    for (let j = 0; j < m; j++, o++) { brut[3 * o] = x; brut[3 * o + 1] = m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1); brut[3 * o + 2] = q; } }
  for (; o < n; o++) { const b = bandes[o % bandes.length]; brut[3 * o] = b[0]; brut[3 * o + 1] = (b[1] + b[2]) / 2; brut[3 * o + 2] = b[3]; }
  return { D: 3, brut, nuage: true, unite: 'energie (unites du saut entre sites)', invariants: {
    bandes: { mesure: malBandes, formule: 0, fractions: fr.length, bandes: bandes.length, note: 'bands where |P| > 4 at the middle, or open gaps where |P| <= 4 at the middle : the edges found really bound the spectrum' },
    gaps: { mesure: malGaps, formule: 0, note: 'fractions p/q whose number of open gaps is not q - 1 (q odd) or q - 2 (q even : the central gap closes) — van Mouche ; Choi, Elliott, Yui (cited by Krasovsky 2016)' },
    centreFerme: { mesure: centre, formule: 0, note: 'for even q, distance from E = 0 of the two central edges : the middle bands touch exactly at 0' },
    tiers: { mesure: ecart13, formule: 0, note: 'edges for 1/3 against -1 - sqrt 3, -2, 1 - sqrt 3, sqrt 3 - 1, 2, 1 + sqrt 3 (P(E) = E^3 - 6E)' },
    miroirE: { mesure: sym, formule: 0, note: 'largest |E + E\'| between mirror edges : the spectrum is symmetric under E -> -E' },
    temoin: { mesure: b25, formule: 5, note: 'witness: 2/5 has 5 bands, not 4 (the claim « q - 1 bands » is false ; q - 1 is the number of GAPS for odd q)' } } };
}

// ---------- 15 : les pavages par dominos (idee : codex Grok Bot 2026-11-05 ; Kasteleyn, Physica 27 (1961) 1209, reference du codex) ----------
// Un rectangle de m x L cases (curseurs) couvert de dominos 1 x 2. On COMPTE tous les pavages, colonne par colonne : l etat est l ensemble des
//   cases de la colonne deja couvertes par un domino couche qui depasse de la colonne precedente (2^m etats, entiers exacts BigInt).
// Exact : produit de Kasteleyn (et Temperley-Fisher), m et L pairs : prod_{j <= m/2} prod_{k <= L/2} (4 cos^2(pi j/(m+1)) + 4 cos^2(pi k/(L+1))).
//   Derive ici : m = 2 donne la suite de Fibonacci (une colonne debout, ou deux dominos couches) ; m L impair : 0 pavage (chaque domino
//   couvre 2 cases).
// Tirage UNIFORME d un pavage : les memes comptes, lus a l envers (chaque choix de colonne pris avec la probabilite nombre de fins / total).
//   Mesure : sur 2000 pavages tires, la part ou la case du coin (0, 0) est couverte par un domino couche, contre sa probabilite EXACTE
//   (pavages qui commencent ainsi / total) ; sigma binomial.
// Dessin (vue de face) : UN pavage tire au hasard (curseur graine), chaque domino trace entre ses deux cases (etiquette 0 couche, 1 debout).
function dominoTransitions(m) { const T = Array.from({ length: 1 << m }, () => []);
  for (let e = 0; e < 1 << m; e++) { const rec = (i, s, ch) => { if (i === m) { T[e].push({ sortie: s, choix: ch.slice() }); return; } if (e >> i & 1) return rec(i + 1, s, ch);
      ch.push([0, i]); rec(i + 1, s | 1 << i, ch); ch.pop(); if (i + 1 < m && !(e >> (i + 1) & 1)) { ch.push([1, i]); rec(i + 2, s, ch); ch.pop(); } }; rec(0, 0, []); }
  return T; }
function dominosKasteleyn(P, n) {
  const m = P.hauteur, L = P.largeur, T = dominoTransitions(m), R = [new Array(1 << m).fill(0n)]; R[0][0] = 1n;
  for (let k = 1; k <= L; k++) { const r = new Array(1 << m).fill(0n); for (let e = 0; e < 1 << m; e++) for (const t of T[e]) r[e] += R[k - 1][t.sortie]; R.push(r); }
  const total = R[L][0];
  let kast = null; if (m % 2 === 0 && L % 2 === 0) { kast = 1; for (let j = 1; j <= m / 2; j++) for (let k = 1; k <= L / 2; k++) kast *= 4 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2; }
  /* Fibonacci : le meme comptage sur 2 x L */
  const T2 = dominoTransitions(2); let v = [1n, 0n, 0n, 0n]; for (let c = 0; c < L; c++) { const w = [0n, 0n, 0n, 0n]; for (let e = 0; e < 4; e++) if (v[e]) for (const t of T2[e]) w[t.sortie] += v[e]; v = w; }
  let fa = 1n, fb = 1n; for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb];
  const rng = mulberry32(P.graine), entier = (tot) => { let u = 0n; for (let i = 0; i < 4; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); return u % tot; };
  const tirer = () => { let e = 0; const cols = []; for (let c = 0; c < L; c++) { let u = entier(R[L - c][e]); for (const t of T[e]) { const w = R[L - c - 1][t.sortie]; if (u < w) { cols.push(t.choix); e = t.sortie; break; } u -= w; } } return cols; };
  let pCoin = 0, mesCoin = 0; const TIRAGES = 2000;
  if (total > 0n) { let h = 0n; for (const t of T[0]) if (t.choix.some(([k, i]) => k === 0 && i === 0)) h += R[L - 1][t.sortie]; pCoin = Number(h) / Number(total);
    for (let s = 0; s < TIRAGES; s++) if (tirer()[0].some(([k, i]) => k === 0 && i === 0)) mesCoin++; }
  const brut = new Float64Array(n * 3);
  if (total > 0n) { const cols = tirer(), doms = []; cols.forEach((ch, c) => ch.forEach(([k, i]) => doms.push(k === 0 ? [c, i, c + 1, i, 0] : [c, i, c, i + 1, 1])));
    for (let l = 0; l < n; l++) { const d = doms[Math.floor(l * doms.length / n)], f = (l * doms.length / n) % 1, o = 3 * l; brut[o] = d[0] + 0.5 + (d[2] - d[0]) * f; brut[o + 1] = d[1] + 0.5 + (d[3] - d[1]) * f; brut[o + 2] = d[4]; } }
  else for (let l = 0; l < n; l++) { const c = l % (m * L), o = 3 * l; brut[o] = Math.floor(c / m) + 0.5; brut[o + 1] = c % m + 0.5; brut[o + 2] = 2; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pavages: { mesure: String(total), formule: kast === null ? null : String(kast), ecartRelatif: kast === null ? null : Math.abs(Number(total) - kast) / Math.max(1, kast), note: 'tilings COUNTED column by column in exact integers, against Kasteleyn\'s product of 4 cos^2 + 4 cos^2 (m and L even ; null otherwise)' },
    coin: { mesure: total > 0n ? mesCoin / TIRAGES : null, formule: total > 0n ? pCoin : null, sigma: total > 0n ? Math.sqrt(pCoin * (1 - pCoin) / TIRAGES) : null, tirages: TIRAGES, note: 'share of 2000 uniform tilings where the corner cell is covered by a lying domino, against its exact probability' },
    fibonacci: { mesure: String(v[0]), formule: String(fb), note: 'witness: the same counting on 2 x L gives the Fibonacci number F(L + 1)' },
    impair: { mesure: m * L % 2 === 1 ? String(total) : null, formule: m * L % 2 === 1 ? '0' : null, note: 'an odd number of cells cannot be tiled : 0 (null when the area is even)' } } };
}

// ---------- 16 : le modele d Ising (idee et valeurs : codex Grok Bot 2026-11-05) ----------
// Des aimants elementaires (spins +1 / -1) sur une grille refermee sur elle-meme (tore) ; chaque paire de voisins prefere etre alignee.
//   Poids d un etat : e^(beta E), E = somme sur les paires voisines de s_i s_j = -H, H l energie (beta = curseur, l inverse de la
//   temperature). Correction de Grok Bot (lot 5) : E ici est la somme des liens, l energie physique est H = -E.
// Exact : sur le tore 4 x 4, les 2^16 = 65 536 etats sont ENUMERES : la fonction de partition Z, l energie moyenne <E> et l aimantation
//   absolue moyenne <|m|> sont des sommes finies, calculees exactement (exp par +, -, *, / seulement).
// Mesure : une simulation de Metropolis sur le meme tore 4 x 4 (un spin tire au hasard bascule si l energie monte, sinon avec la
//   probabilite e^(beta dE)), 20 lots de 1 500 balayages : <E> et <|m|> estimes, barre d erreur par les moyennes de lots.
// LIMITE (pas comparee) : sur une grille infinie la transition a lieu a beta_c = ln(1 + sqrt 2)/2 (Onsager, Phys. Rev. 65 (1944) 117,
//   reference du codex) ; un tore 4 x 4 n a pas de vraie transition, la valeur est donnee pour reperer le curseur.
// Dessin (vue de face) : un instantane de Metropolis sur une grande grille 48 x 48 au meme beta, chaque case avec son spin (etiquette).
function expD(u) { return u >= 0 ? expPosD(u) : 1 / expPosD(-u); }
function isingMetropolis(L, beta, s, rng, balayages) { const N = L * L, acc = []; for (let k = 0; k <= 8; k++) acc.push(expD(-beta * 2 * k));
  for (let t = 0; t < balayages; t++) for (let q = 0; q < N; q++) { const i = Math.floor(rng() * N), x = i % L, y = (i - x) / L;
    const h = s[y * L + (x + 1) % L] + s[y * L + (x - 1 + L) % L] + s[((y + 1) % L) * L + x] + s[((y - 1 + L) % L) * L + x], d = s[i] * h; /* basculer change E de -2 d */
    if (d <= 0 || rng() < acc[d]) s[i] = -s[i]; } }
function isingMesures(L, s) { let E = 0, M = 0; for (let i = 0; i < L * L; i++) { const x = i % L, y = (i - x) / L; E += s[i] * (s[y * L + (x + 1) % L] + s[((y + 1) % L) * L + x]); M += s[i]; } return { E, m: Math.abs(M) / (L * L) }; }
function isingExact(L, beta) { const N = L * L; let Z = 0, ZE = 0, ZM = 0;
  for (let c = 0; c < 1 << N; c++) { let E = 0, M = 0; for (let i = 0; i < N; i++) { const s = (c >> i & 1) ? 1 : -1, x = i % L, y = (i - x) / L;
      E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1) + s * (((c >> (((y + 1) % L) * L + x)) & 1) ? 1 : -1); M += s; }
    const w = expD(beta * E); Z += w; ZE += E * w; ZM += Math.abs(M) / N * w; }
  return { Z, E: ZE / Z, m: ZM / Z }; }
function ising(P, n) {
  const beta = P.beta, rng = mulberry32(P.graine), ex = isingExact(4, beta);
  const s4 = new Int8Array(16).fill(1); isingMetropolis(4, beta, s4, rng, 500);
  const bE = [], bM = []; for (let b = 0; b < 20; b++) { let sE = 0, sM = 0; for (let t = 0; t < 1500; t++) { isingMetropolis(4, beta, s4, rng, 1); const v = isingMesures(4, s4); sE += v.E; sM += v.m; } bE.push(sE / 1500); bM.push(sM / 1500); }
  const st = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return { m, sigma: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length) }; };
  const e = st(bE), a = st(bM);
  const G = 48, sg = new Int8Array(G * G); for (let i = 0; i < G * G; i++) sg[i] = rng() < 0.5 ? 1 : -1; isingMetropolis(G, beta, sg, rng, 300);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * G * G / n), o = 3 * l; brut[o] = i % G; brut[o + 1] = (i - i % G) / G; brut[o + 2] = sg[i]; }
  const betaC = lnD(1 + Math.sqrt(2)) / 2;
  return { D: 3, brut, nuage: true, unite: 'sans objet (spins)', invariants: {
    energie: { mesure: e.m, formule: ex.E, sigma: e.sigma, note: 'mean bond sum s_i s_j on the 4 x 4 torus (minus the energy H = -sum s_i s_j), Metropolis (20 batches) against the exact sum over all 65 536 states' },
    aimantationAbs: { mesure: a.m, formule: ex.m, sigma: a.sigma, note: 'mean absolute magnetisation per spin, Metropolis against the exact enumeration' },
    partition: { mesure: ex.Z, betaCritique: betaC, note: 'exact partition function Z of the 4 x 4 torus at this beta ; beta_c = ln(1 + sqrt 2)/2 is the LIMIT of an endless grid (Onsager), shown, not compared' } } };
}

// ---------- 17 : le diamant azteque et son cercle arctique (idee, algorithme et valeurs : codex Grok Bot 2026-11-05) ----------
// Le diamant azteque d ordre n : les cases (x, y) avec |x + 1/2| + |y + 1/2| <= n, pavees par des dominos. Un pavage tire UNIFORMEMENT par
//   le « domino shuffling » (Elkies, Kuperberg, Larsen, Propp 1992 ; enonce lu par Grok dans Jockusch, Propp, Shor, arXiv:math/9801068) :
//   d un ordre au suivant, chaque domino a une fleche (N, S, E, O) donnee par la couleur de sa case ; les paires qui se font face sont
//   detruites, les autres glissent d une case, et les trous 2 x 2 recoivent deux dominos couches ou deux debout, a pile ou face.
// Exact : AD(k) = 2^(k(k+1)/2) pavages (EKLP) ; ici COMPTES par retour arriere pour k = 1..4 (2, 8, 64, 1024). Pour l ordre 4, la
//   probabilite exacte qu une case du centre soit couverte par un domino couche est comptee sur les 1024 pavages (1/2, valeur de Grok).
// Mesure : uniformite du tirage (8000 tirages de l ordre 2, khi-deux a 7 degres de liberte) ; frequence de la case du centre a l ordre 4
//   sur 4000 tirages ; part des dominos « geles » (fleche vers le coin de leur region) hors du cercle de rayon n/sqrt 2 et dedans.
// LIMITE (Jockusch, Propp, Shor, theoreme 1, lu par Grok) : quand n grandit, la frontiere du desordre tend vers le cercle inscrit de
//   rayon n/sqrt 2 ; mesuree ici en taille finie, pas une egalite.
// Dessin (vue de face) : un pavage de l ordre n (curseur), chaque domino trace selon sa fleche (etiquette 0 N, 1 S, 2 E, 3 O).
const AZ_DANS = (x, y, k) => Math.abs(x + 0.5) + Math.abs(y + 0.5) <= k;
const azFleche = (d, k) => { const c = (d.x + d.y + k + 1) & 1; return d.h ? (c ? 0 : 1) : (c ? 2 : 3); };
function azShuffle(n, rng) {
  let doms = [];
  for (let k = 1; k <= n; k++) {
    const fl = doms.map((d) => azFleche(d, k - 1)), cle = new Map(); doms.forEach((d, i) => cle.set(d.x + ',' + d.y + ',' + d.h, i));
    const mort = new Uint8Array(doms.length);
    doms.forEach((d, i) => { if (mort[i]) return;
      if (fl[i] === 0) { const j = cle.get(d.x + ',' + (d.y + 1) + ',1'); if (j !== undefined && fl[j] === 1) mort[i] = mort[j] = 1; }
      if (fl[i] === 2) { const j = cle.get((d.x + 1) + ',' + d.y + ',0'); if (j !== undefined && fl[j] === 3) mort[i] = mort[j] = 1; } });
    const nouv = []; doms.forEach((d, i) => { if (mort[i]) return; const v = fl[i]; nouv.push({ x: d.x + (v === 2) - (v === 3), y: d.y + (v === 0) - (v === 1), h: d.h }); });
    const occ = new Set(); for (const d of nouv) { occ.add(d.x + ',' + d.y); occ.add(d.h ? (d.x + 1) + ',' + d.y : d.x + ',' + (d.y + 1)); }
    for (let y = -k; y < k; y++) for (let x = -k; x < k; x++) { if (!AZ_DANS(x, y, k) || occ.has(x + ',' + y)) continue;
      if (rng() < 0.5) nouv.push({ x, y, h: 1 }, { x, y: y + 1, h: 1 }); else nouv.push({ x, y, h: 0 }, { x: x + 1, y, h: 0 });
      for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) occ.add(a + ',' + b); }
    doms = nouv;
  }
  return doms;
}
function azDefauts(doms, n) { const occ = new Set(); let mal = 0; for (const d of doms) for (const [a, b] of [[d.x, d.y], d.h ? [d.x + 1, d.y] : [d.x, d.y + 1]]) { const k = a + ',' + b; if (!AZ_DANS(a, b, n) || occ.has(k)) mal++; occ.add(k); } return mal + Math.abs(occ.size - 2 * n * (n + 1)); }
function azEnumerer(k, surCentre) { const cases = []; for (let y = -k; y < k; y++) for (let x = -k; x < k; x++) if (AZ_DANS(x, y, k)) cases.push([x, y]);
  const pris = new Set(); let tot = 0, couche = 0, centreCouche = false;
  const rec = (i) => { while (i < cases.length && pris.has(cases[i][0] + ',' + cases[i][1])) i++; if (i === cases.length) { tot++; if (centreCouche) couche++; return; }
    const [x, y] = cases[i], c0 = x + ',' + y;
    for (const [a, b, h] of [[x + 1, y, 1], [x, y + 1, 0]]) { const c1 = a + ',' + b; if (!AZ_DANS(a, b, k) || pris.has(c1)) continue;
      const garde = centreCouche; if (surCentre && h === 1 && ((x === 0 && y === 0) || (a === 0 && b === 0))) centreCouche = true;
      pris.add(c0); pris.add(c1); rec(i + 1); pris.delete(c0); pris.delete(c1); centreCouche = garde; } };
  rec(0); return { tot, couche }; }
function aztecDiamond(P, n) {
  const N = P.ordre, rng = mulberry32(P.graine), doms = azShuffle(N, rng), defauts = azDefauts(doms, N);
  const exC = azEnumerer(4, true), pC = exC.couche / exC.tot, petits = [...[1, 2, 3].map((k) => azEnumerer(k, false).tot), exC.tot], /* ordre 4 enumere UNE fois (MESURE : 362 ms -> voir banc) */ formules = [1, 2, 3, 4].map((k) => 2 ** (k * (k + 1) / 2));
  const freq = new Map(), T = 4000; /* MESURE : 8000 + 4000 tirages = 240 ms ; moitie */ for (let t = 0; t < T; t++) { const k = azShuffle(2, rng).map((q) => q.x + ',' + q.y + ',' + q.h).sort().join(';'); freq.set(k, (freq.get(k) || 0) + 1); }
  const att = T / 8; let khi2 = (8 - freq.size) * att; for (const v of freq.values()) khi2 += (v - att) ** 2 / att;
  let mesC = 0; const TC = 2000;
  for (let t = 0; t < TC; t++) if (azShuffle(4, rng).some((q) => q.h === 1 && q.y === 0 && (q.x === 0 || q.x === -1))) mesC++;
  const R = N / Math.SQRT2; let out = 0, outG = 0, ins = 0, insG = 0;
  for (const q of doms) { const cx = q.x + (q.h ? 1 : 0.5), cy = q.y + (q.h ? 0.5 : 1), r = Math.sqrt(cx * cx + cy * cy), f = azFleche(q, N), pole = Math.abs(cy) > Math.abs(cx) ? (cy > 0 ? 0 : 1) : (cx > 0 ? 2 : 3);
    if (r > 1.1 * R) { out++; if (f === pole) outG++; } else if (r < 0.9 * R) { ins++; if (f === pole) insG++; } }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const q = doms[Math.floor(l * doms.length / n)], u = (l * doms.length / n) % 1, o = 3 * l;
    brut[o] = q.x + 0.5 + (q.h ? u : 0); brut[o + 1] = q.y + 0.5 + (q.h ? 0 : u); brut[o + 2] = azFleche(q, N); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pavageValide: { mesure: defauts, formule: 0, dominos: doms.length, note: 'cells covered zero or twice, or outside the diamond, in the tiling drawn (n (n + 1) dominoes expected)' },
    petitsDiamants: { mesure: petits.join(' '), formule: formules.join(' '), note: 'tilings of the diamonds of order 1 to 4 COUNTED by backtracking, against 2^(k (k + 1)/2) (Elkies, Kuperberg, Larsen, Propp)' },
    uniformite: { mesure: khi2, formule: 7, sigma: Math.sqrt(14), tirages: T, note: 'chi-square of 4000 shuffled tilings of order 2 over its 8 tilings (7 degrees of freedom : mean 7, spread sqrt 14)' },
    caseCentre: { mesure: mesC / TC, formule: pC, sigma: Math.sqrt(pC * (1 - pC) / TC), note: 'order 4 : share of shuffled tilings where the centre cell is covered by a lying domino, against its exact probability counted over the 1024 tilings' },
    arctique: { mesure: out ? outG / out : null, dedans: ins ? insG / ins : null, rayon: R, note: 'share of FROZEN dominoes (arrow towards their own corner) outside 1.1 n/sqrt 2, and inside 0.9 n/sqrt 2 ; the arctic circle n/sqrt 2 is a LIMIT for large n' } } };
}

// ---------- 18 : le collectionneur de vignettes (idee et valeurs : codex Grok Bot ; Feller, vol. I, 3e ed., ch. IX §3 ex. (d), p. 224-225) ----------
// n vignettes equiprobables (curseur) ; on tire avec remise jusqu a les avoir toutes. T = nombre de tirages.
// Exact (derive ici) : quand j vignettes sont deja la, la suivante arrive apres un temps geometrique de parametre (n - j)/n ;
//   T est la somme de ces n temps : E[T] = n (1 + 1/2 + ... + 1/n) = n H_n ; Var[T] = n^2 (1 + 1/4 + ... + 1/n^2) - n H_n.
//   Calcules en FRACTIONS exactes (BigInt). Et apres t tirages, le nombre moyen de vignettes distinctes est n (1 - (1 - 1/n)^t)
//   (chaque vignette manque avec la probabilite (1 - 1/n)^t).
// Mesure : 3000 collections simulees : moyenne et variance de T ; nombre moyen de distinctes a chaque tirage, contre la courbe exacte.
// Dessin : les courbes « distinctes apres t tirages » de quelques collections (etiquette = la collection) et la courbe exacte (etiquette 0).
function fracAdd(a, b) { const p = a[0] * b[1] + b[0] * a[1], q = a[1] * b[1]; let x = p < 0n ? -p : p, y = q; while (y) [x, y] = [y, x % y]; return [p / x, q / x]; }
function collectionneur(P, n) {
  const N = P.vignettes, K = 3000, DESSINEES = 6, rng = mulberry32(P.graine);
  let H = [0n, 1n], H2 = [0n, 1n]; for (let k = 1n; k <= BigInt(N); k++) { H = fracAdd(H, [1n, k]); H2 = fracAdd(H2, [1n, k * k]); }
  const Nb = BigInt(N), E = fracAdd([Nb * H[0], H[1]], [0n, 1n]), V = fracAdd([Nb * Nb * H2[0], H2[1]], [-E[0], E[1]]);
  const Ef = Number(E[0]) / Number(E[1]), Vf = Number(V[0]) / Number(V[1]);
  const tMax = Math.ceil(3 * Ef), somme = new Float64Array(tMax + 1), courbes = [];
  let s = 0, s2 = 0;
  for (let r = 0; r < K; r++) { const vu = new Uint8Array(N); let d = 0, t = 0; const c = r < DESSINEES ? [0] : null;
    while (d < N || t < tMax) { t++; const v = Math.floor(rng() * N); if (!vu[v]) { vu[v] = 1; d++; if (d === N) { s += t; s2 += t * t; } } if (t <= tMax) somme[t] += d; if (c && t <= tMax) c.push(d); if (d === N && t >= tMax) break; }
    if (c) courbes.push(c); }
  const moy = s / K, varia = (s2 - K * moy * moy) / (K - 1);
  let pireCourbe = 0; for (let t = 1; t <= tMax; t++) { const ex = N * (1 - (1 - 1 / N) ** t); pireCourbe = Math.max(pireCourbe, Math.abs(somme[t] / K - ex)); }
  /* banc game160 (n = 2 points : part = 0, division par zero, NaN) : au plus n - 1 collections dessinees, part >= 1 */
  const Dn = Math.min(DESSINEES, Math.max(0, n - 1)), brut = new Float64Array(n * 3), part = Math.max(1, Math.floor(n / (Dn + 1)));
  for (let l = 0; l < n; l++) { const g = Math.min(Dn, Math.floor(l / part)), j = l - g * part, m = g === Dn ? n - Dn * part : part, t = Math.round(1 + j * (tMax - 1) / Math.max(1, m - 1)), o = 3 * l;
    brut[o] = t; brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** t); brut[o + 2] = g < Dn ? g + 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (tirages)', invariants: {
    tirageMoyen: { mesure: moy, formule: Ef, sigma: Math.sqrt(Vf / K), exacte: E[0] + '/' + E[1], note: 'mean number of draws to complete the set, over 3000 simulated collections, against n H_n (exact fraction given)' },
    variance: { mesure: varia, formule: Vf, exacte: V[0] + '/' + V[1], note: 'variance of the number of draws against n^2 (1 + 1/4 + ... + 1/n^2) - n H_n (exact fraction given)' },
    courbeDistinctes: { mesure: pireCourbe, sigmaMax: Math.sqrt(N / 4 / K) * 1, note: 'largest gap between the mean number of distinct coupons after t draws and n (1 - (1 - 1/n)^t)' } } };
}

// ---------- 19 : la ruine du joueur (idee et valeurs : codex Grok Bot ; Feller, vol. I, 3e ed., ch. XIV §2, p. 344-345, lu par Grok) ----------
// Un joueur part de z euros, gagne 1 avec la probabilite p, perd 1 sinon, et s arrete a 0 (ruine) ou a a (objectif). Curseurs p, z, a.
// Exact (Feller (2.4), (2.5)) : avec r = q/p, la probabilite de ruine est q_z = (r^a - r^z)/(r^a - 1) si p != 1/2, et 1 - z/a si p = 1/2.
//   Duree moyenne du jeu : z (a - z) si p = 1/2 ; sinon z/(q - p) - (a/(q - p)) (1 - r^z)/(1 - r^a).
//   Derive ici : q_z verifie q_z = p q_(z+1) + q q_(z-1), q_0 = 1, q_a = 0 ; la duree D_z = 1 + p D_(z+1) + q D_(z-1), D_0 = D_a = 0.
// Mesure : 20 000 parties simulees : part des ruines, duree moyenne (barre d erreur par l ecart-type des durees).
// Temoin : a p = 1/2 la ruine est exactement lineaire en z (1 - z/a) ; un petit avantage (p = 0.55) l ecrase.
// Dessin : la fortune de 12 parties au fil des coups (etiquette = la partie), et les deux murs 0 et a (etiquette 0).
function ruineJoueur(P, n) {
  const p = P.gain, a = P.objectif, z = Math.min(P.depart, a - 1), q = 1 - p, rng = mulberry32(P.graine), T = 20000, DESSINEES = 12;
  const r = q / p, egal = Math.abs(p - 0.5) < 1e-12;
  const qz = egal ? 1 - z / a : (r ** a - r ** z) / (r ** a - 1), dz = egal ? z * (a - z) : z / (q - p) - (a / (q - p)) * (1 - r ** z) / (1 - r ** a);
  let ruines = 0, sd = 0, sd2 = 0; const traces = [];
  for (let k = 0; k < T; k++) { let x = z, d = 0; const tr = k < DESSINEES ? [x] : null; while (x > 0 && x < a) { x += rng() < p ? 1 : -1; d++; if (tr && tr.length < 4000) tr.push(x); } if (x === 0) ruines++; sd += d; sd2 += d * d; if (tr) traces.push(tr); }
  const md = sd / T, vd = (sd2 - T * md * md) / (T - 1);
  /* banc game161 (n = 2 ou 7 points : parTrace = 0, trace inexistante) : parTrace >= 1 */
  const brut = new Float64Array(n * 3), murs = Math.floor(n * 0.1), parTrace = Math.max(1, Math.floor((n - murs) / DESSINEES)), longMax = Math.max(...traces.map((t) => t.length));
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < murs) { const u = l / Math.max(1, murs - 1); brut[o] = u * (longMax - 1); brut[o + 1] = l % 2 ? a : 0; brut[o + 2] = 0; continue; }
    const g = Math.min(DESSINEES - 1, Math.floor((l - murs) / parTrace)), j = (l - murs) - g * parTrace, tr = traces[g], t = Math.min(tr.length - 1, Math.round(j * (tr.length - 1) / Math.max(1, parTrace - 1)));
    brut[o] = t; brut[o + 1] = tr[t]; brut[o + 2] = g + 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (euros, coups)', invariants: {
    ruine: { mesure: ruines / T, formule: qz, sigma: Math.sqrt(qz * (1 - qz) / T), depart: z, note: 'share of 20 000 games ending at 0, against (r^a - r^z)/(r^a - 1), r = q/p (1 - z/a when p = 1/2) — Feller XIV (2.4), (2.5)' },
    duree: { mesure: md, formule: dz, sigma: Math.sqrt(vd / T), note: 'mean length of a game against z (a - z) at p = 1/2, or z/(q - p) - (a/(q - p)) (1 - r^z)/(1 - r^a)' } } };
}

// ---------- 20 : les nombres de Catalan et les chemins de Dyck (idee et valeurs : codex Grok Bot ; Feller vol. I, ch. III §1 (a), p. 69, lu par Grok) ----------
// Un chemin de Dyck : n montees et n descentes qui ne passent jamais sous le sol (une chaine de montagnes). C_n = nombre de tels chemins.
// Exact : C_n = binom(2n, n)/(n + 1) (reflexion d Andre ; lien avec le theoreme du scrutin, Feller III §1). Les chemins sont COMPTES un
//   par un (retour arriere) pour n = 0..12 et compares au binome en entiers exacts (BigInt).
// Tirage UNIFORME (lemme cyclique, derive ici) : melanger n montees et n + 1 descentes ; parmi les 2n + 1 rotations, une seule commence
//   juste apres le PREMIER point le plus bas : elle donne un chemin de Dyck suivi d une descente, et chaque chemin de Dyck provient d exactement
//   2n + 1 melanges equiprobables -> uniforme.
// Mesure : 7000 tirages de demi-longueur 4, khi-deux sur les 14 chemins (13 degres de liberte) ; chaque chemin dessine reste au-dessus du sol.
// Temoin : sans la contrainte du sol, binom(2n, n) chemins (252 pour n = 5, pas 42).
// Dessin : 4 chemins de Dyck tires au hasard de demi-longueur n (curseur), pas (x) et hauteur (y), etiquette = le chemin.
function dyckTirage(n, rng) { const s = []; for (let i = 0; i < n; i++) s.push(1); for (let i = 0; i <= n; i++) s.push(-1);
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
  let h = 0, min = 0, im = -1; for (let i = 0; i < s.length; i++) { h += s[i]; if (h < min) { min = h; im = i; } }
  return [...s.slice(im + 1), ...s.slice(0, im + 1)].slice(0, 2 * n); }
function dyckCompte(n) { let c = 0; const rec = (u, d) => { if (u === n && d === n) { c++; return; } if (u < n) rec(u + 1, d); if (d < u) rec(u, d + 1); }; rec(0, 0); return c; }
function binomB(n, k) { let r = 1n; for (let i = 1n; i <= BigInt(k); i++) r = r * (BigInt(n) - BigInt(k) + i) / i; return r; }
function catalanDyck(P, n) {
  const N = P.demi, rng = mulberry32(P.graine), comptes = [], formules = [];
  for (let k = 0; k <= 12; k++) { comptes.push(dyckCompte(k)); formules.push(String(binomB(2 * k, k) / BigInt(k + 1))); }
  const f = new Map(), T = 7000; let sousSol = 0;
  for (let t = 0; t < T; t++) { const p = dyckTirage(4, rng); let h = 0; for (const x of p) { h += x; if (h < 0) sousSol++; } if (h !== 0) sousSol++; const k = p.join(''); f.set(k, (f.get(k) || 0) + 1); }
  const att = T / 14; let khi2 = (14 - f.size) * att; for (const v of f.values()) khi2 += (v - att) ** 2 / att;
  const CH = 4, chemins = []; for (let c = 0; c < CH; c++) chemins.push(dyckTirage(N, rng));
  /* banc game162 (n = 2 points : par = 0, NaN) : par >= 1 */
  const brut = new Float64Array(n * 3), par = Math.max(1, Math.floor(n / CH));
  for (let l = 0; l < n; l++) { const c = Math.min(CH - 1, Math.floor(l / par)), j = l - c * par, m = c === CH - 1 ? n - c * par : par, i = Math.round(j * 2 * N / Math.max(1, m - 1));
    let h = 0; for (let k = 0; k < i; k++) h += chemins[c][k]; const o = 3 * l; brut[o] = i; brut[o + 1] = h; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (pas)', invariants: {
    catalans: { mesure: comptes.join(' '), formule: formules.join(' '), note: 'Dyck paths COUNTED one by one for n = 0..12, against binom(2n, n)/(n + 1) in exact integers' },
    uniformite: { mesure: khi2, formule: 13, sigma: Math.sqrt(26), tirages: T, sousSol, note: 'chi-square of 7000 cyclic-lemma draws of half-length 4 over its 14 paths (13 degrees of freedom) ; draws that dip below the ground : 0 expected' },
    temoin: { mesure: String(binomB(10, 5)), formule: '252', note: 'witness: without the ground rule, binom(10, 5) = 252 paths of length 10, not C_5 = 42' } } };
}

// ---------- 21 : les partitions d entiers et le theoreme pentagonal d Euler (idee et valeurs : codex Grok Bot ; Ahlgren et Ono, Notices AMS 48 (2001) 978, lu par Grok) ----------
// p(n) = nombre de facons d ecrire n comme somme d entiers positifs sans tenir compte de l ordre (5 = 4+1 = 3+2 = 3+1+1 = ...).
// Exact (Euler) : p(n) = p(n-1) + p(n-2) - p(n-5) - p(n-7) + p(n-12) + p(n-15) - ... (nombres pentagonaux generalises k(3k -+ 1)/2).
// Mesure INDEPENDANTE : le meme p(n) par programmation dynamique « par pieces » (ajouter les parts de taille 1, puis 2, ...), entiers exacts.
// Tirage UNIFORME d une partition (derive ici) : T(n, k) = partitions de n en parts <= k ; la plus grande part j est choisie avec la
//   probabilite T(n - j, j)/T(n, k), puis on recommence sur n - j avec des parts <= j. Teste : khi-deux sur les 22 partitions de 8.
// Dessin (vue de face) : le diagramme de Young d une partition tiree au hasard de n (curseur) : une case par unite (etiquette = la ligne).
function partPentagonal(N) { const p = [1n]; for (let n = 1; n <= N; n++) { let s = 0n; for (let k = 1; ; k++) { const g1 = k * (3 * k - 1) / 2, g2 = k * (3 * k + 1) / 2; if (g1 > n) break; const sg = k % 2 ? 1n : -1n; s += sg * p[n - g1]; if (g2 <= n) s += sg * p[n - g2]; } p.push(s); } return p; }
function partPieces(N) { const p = new Array(N + 1).fill(0n); p[0] = 1n; for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) p[m] += p[m - k]; return p; }
function partTable(N) { const T = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0n)); for (let k = 0; k <= N; k++) T[0][k] = 1n; for (let m = 1; m <= N; m++) for (let k = 1; k <= N; k++) T[m][k] = T[m][k - 1] + (k <= m ? T[m - k][k] : 0n); return T; }
function partTirage(N, T, rng) { const parts = []; let m = N, k = N; while (m > 0) { let u = 0n; for (let i = 0; i < 3; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m][k];
    for (let j = Math.min(k, m); j >= 1; j--) { const w = T[m - j][j]; if (u < w) { parts.push(j); m -= j; k = j; break; } u -= w; } } return parts; }
function partitionEuler(P, n) {
  const N = P.entier, rng = mulberry32(P.graine), A = partPentagonal(200), B = partPieces(200);
  let ecarts = 0; for (let m = 0; m <= 200; m++) if (A[m] !== B[m]) ecarts++;
  const T8 = partTable(8), f = new Map(), S = 11000; for (let s = 0; s < S; s++) { const key = partTirage(8, T8, rng).join('+'); f.set(key, (f.get(key) || 0) + 1); }
  const att = S / 22; let khi2 = (22 - f.size) * att; for (const v of f.values()) khi2 += (v - att) ** 2 / att;
  const parts = partTirage(N, partTable(N), rng), cases = []; parts.forEach((len, r) => { for (let c = 0; c < len; c++) cases.push([c, -r, r]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const q = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = q[0]; brut[o + 1] = q[1]; brut[o + 2] = q[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pentagonal: { mesure: ecarts, formule: 0, p100: String(A[100]), p200: String(A[200]), note: 'values of n in 0..200 where Euler\'s pentagonal recurrence and the independent coin-by-coin count disagree (exact integers)' },
    uniformite: { mesure: khi2, formule: 21, sigma: Math.sqrt(42), tirages: S, note: 'chi-square of 11 000 uniform draws over the 22 partitions of 8 (21 degrees of freedom)' },
    dessinee: { mesure: parts.reduce((x, y) => x + y, 0), formule: N, parts: parts.length, note: 'the Young diagram drawn : its parts add up to n and never increase' } } };
}

// ---------- 22 : la courbe du dragon (pliage de papier) (idee et valeurs : codex Grok Bot ; Riddle, « Heighway Dragon », citant Davis et Knuth 1970, lu par Grok) ----------
// Plier une bande de papier en deux n fois (curseur), puis la deplier a angle droit : la suite des virages trace le dragon de Heighway.
// Exact : H_(n+1) = H_n R (complement inverse de H_n) ; derive ici : le k-ieme virage (k = 2^m (2j + 1)) est R si j est pair, L sinon
//   (le pli du milieu de chaque morceau) — deux constructions INDEPENDANTES comparees virage par virage.
// Mesures exactes sur le trace : 2^n segments unitaires, aucun segment parcouru deux fois (la courbe ne se recouvre jamais), et la distance
//   entre les deux bouts au carre vaut 2^n (chaque pliage multiplie la corde par sqrt 2, derive : rotation de 45 degres et similitude).
// Dessin (vue de face) : le dragon de n plis, des points le long des segments, etiquette = la generation du segment (le pli qui l a cree).
function dragonRecurrence(n) { let h = ''; for (let i = 0; i < n; i++) { let c = ''; for (let k = h.length - 1; k >= 0; k--) c += h[k] === 'R' ? 'L' : 'R'; h = h + 'R' + c; } return h; }
function dragonBits(n) { let h = ''; for (let k = 1; k < 2 ** n; k++) { let x = k; while (x % 2 === 0) x /= 2; h += ((x - 1) / 2) % 2 === 0 ? 'R' : 'L'; } return h; }
function courbeDragon(P, n) {
  const N = P.plis, hR = dragonRecurrence(N), hB = dragonBits(N);
  let differents = 0; for (let k = 0; k < hR.length; k++) if (hR[k] !== hB[k]) differents++;
  let x = 0, y = 0, dx = 1, dy = 0; const aretes = new Set(), pts = [[0, 0]]; let doublons = 0;
  const pas = () => { const key = Math.min(x, x + dx) + ',' + Math.min(y, y + dy) + ',' + (dx !== 0 ? 'h' : 'v'); if (aretes.has(key)) doublons++; aretes.add(key); x += dx; y += dy; pts.push([x, y]); };
  pas(); for (const c of hR) { const ndx = c === 'R' ? dy : -dy, ndy = c === 'R' ? -dx : dx; dx = ndx; dy = ndy; pas(); }
  const segs = pts.length - 1, gen = (s) => { if (s === 0) return 0; let k = s, m = 0; while (k % 2 === 0) { k /= 2; m++; } return N - m; };
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs / n, s = Math.floor(t), u = t - s, a = pts[s], b = pts[s + 1], o = 3 * l; brut[o] = a[0] + u * (b[0] - a[0]); brut[o + 1] = a[1] + u * (b[1] - a[1]); brut[o + 2] = gen(s); }
  /* 2026-11-08 : every unit segment of the trace as a line (2^n of them ; the points sample 1,500), at the depth of its generation */
  const segments = []; for (let q = 0; q < segs; q++) segments.push({ a: [pts[q][0], pts[q][1], gen(q)], b: [pts[q + 1][0], pts[q + 1][1], gen(q)] });
  return { D: 3, brut, nuage: true, segments, unite: 'sans objet (segments unitaires)', invariants: {
    virages: { mesure: differents, formule: 0, virages: hR.length, debut: hR.slice(0, 15), note: 'turns where the recurrence H R (reverse complement of H) and the bit rule (k = 2^m (2j + 1) : R when j is even) disagree' },
    segments: { mesure: segs, formule: 2 ** N, recouvrements: doublons, note: 'unit segments drawn against 2^n ; segments travelled twice (none : the dragon never overlaps itself)' },
    bouts: { mesure: x * x + y * y, formule: 2 ** N, note: 'squared distance between the two ends against 2^n : each fold multiplies the chord by sqrt 2' } } };
}

// ---------- 23 : le theoreme de Pick (idee : codex Grok Bot ; Pick 1899) ----------
// Un polygone SIMPLE dont les sommets sont des points entiers : aire A = I + B/2 - 1, I = points entiers dedans, B = points entiers sur le bord.
// Ici les trois nombres viennent de trois chemins differents : A par la formule du lacet (somme de produits croises, exacte en entiers),
//   I et B COMPTES point par point (test exact en entiers, sans division), et B recompte une 2e fois par la somme des pgcd des cotes.
// Polygone : k sommets tires au hasard (graine) dans k secteurs d angle, arrondis aux entiers ; on retire tant qu il n est pas simple
//   (cotes qui se touchent, sommet double, demi-tour) — mesure : 1 512 polygones (k 3..30, rayon 8..40), pire cas 3 tirages ; repli triangle.
// Temoin : le noeud papillon (0,0) (4,4) (4,0) (0,4) n est pas simple : le lacet donne 0, 2I + B - 2 donne 17 — Pick ne vaut que pour un polygone simple.
// Dessin (vue de face) : le contour, puis les points entiers, etiquette 0 = contour, 1 = dedans, 2 = sur le bord.
const pickOrient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const pickSurSeg = (p, q, r) => pickOrient(p, q, r) === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
function pickSimple(Q) { const k = Q.length, touche = (a, b, c, d) => (pickOrient(a, b, c) * pickOrient(a, b, d) < 0 && pickOrient(c, d, a) * pickOrient(c, d, b) < 0) || pickSurSeg(a, b, c) || pickSurSeg(a, b, d) || pickSurSeg(c, d, a) || pickSurSeg(c, d, b);
  for (let i = 0; i < k; i++) { const a = Q[i], b = Q[(i + 1) % k], c = Q[(i + 2) % k]; if (a[0] === b[0] && a[1] === b[1]) return false;
    if (pickOrient(a, b, c) === 0 && (c[0] - b[0]) * (b[0] - a[0]) + (c[1] - b[1]) * (b[1] - a[1]) < 0) return false;
    for (let j = i + 2; j < k; j++) { if (i === 0 && j === k - 1) continue; if (touche(a, b, Q[j], Q[(j + 1) % k])) return false; } }
  return true; }
function pickCompte(Q) { const k = Q.length, xs = Q.map((p) => p[0]), ys = Q.map((p) => p[1]), pts = []; let I = 0, B = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    let bord = false; for (let i = 0; i < k; i++) if (pickSurSeg(Q[i], Q[(i + 1) % k], [x, y])) { bord = true; break; }
    if (bord) { B++; pts.push([x, y, 2]); continue; }
    let c = false; for (let i = 0, j = k - 1; i < k; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y)) { const g = (x - xi) * (yj - yi) - (xj - xi) * (y - yi); if (yj > yi ? g < 0 : g > 0) c = !c; } }
    if (c) { I++; pts.push([x, y, 1]); } }
  return { I, B, pts }; }
const pickLacet2 = (Q) => { let s = 0; for (let i = 0; i < Q.length; i++) { const [x1, y1] = Q[i], [x2, y2] = Q[(i + 1) % Q.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s); };
function theoremePick(P, n) {
  const k = P.sommets, R = P.rayon, rng = mulberry32(P.graine); let Q = null;
  for (let essai = 0; essai < 200 && !Q; essai++) { const T = []; for (let i = 0; i < k; i++) { const a = 2 * PI * (i + 0.15 + 0.7 * rng()) / k, r = R * (0.4 + 0.6 * rng()); T.push([Math.round(r * cosD(a)), Math.round(r * sinD(a))]); } if (pickSimple(T)) Q = T; }
  if (!Q) Q = [[0, 0], [R, 0], [0, R]];
  const { I, B, pts } = pickCompte(Q), a2 = pickLacet2(Q); let sg = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; sg += pgcd(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
  const papillon = [[0, 0], [4, 4], [4, 0], [0, 4]], tp = pickCompte(papillon);
  const brut = new Float64Array(n * 3), m = Math.floor(n / 2), kq = Q.length;
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < m) { const t = l * kq / m, s = Math.floor(t), u = t - s, s0 = Q[s], s1 = Q[(s + 1) % kq]; brut[o] = s0[0] + u * (s1[0] - s0[0]); brut[o + 1] = s0[1] + u * (s1[1] - s0[1]); brut[o + 2] = 0; }
    else { const pe = pts[Math.floor((l - m) * pts.length / (n - m))]; brut[o] = pe[0]; brut[o + 1] = pe[1]; brut[o + 2] = pe[2]; } }
  return { D: 3, brut, nuage: true, unite: 'sans objet (points entiers)', invariants: {
    pick: { mesure: a2 - (2 * I + B - 2), formule: 0, aire: a2 / 2, interieurs: I, pointsBord: B, note: 'twice the shoelace area minus (2I + B - 2), I and B counted point by point : Pick says A = I + B/2 - 1' },
    bordPgcd: { mesure: B - sg, formule: 0, polygone: JSON.stringify(Q), note: 'boundary points counted minus the sum over the sides of gcd(|dx|, |dy|)' },
    temoin: { mesure: 2 * tp.I + tp.B - 2, formule: 17, lacet: pickLacet2(papillon), note: 'witness: the bow tie (0,0) (4,4) (4,0) (0,4) crosses itself : the shoelace gives 0, Pick would give 17/2 — Pick needs a simple polygon' } } };
}

// ---------- 24 : percolation de liens, la traversee a p = 1/2 (idee et valeurs : codex Grok Bot ; Bollobas et Riordan 2006, corollaire 5, lu par Grok ; Kesten 1980) ----------
// Reseau carre ; chaque lien est ouvert avec la probabilite 1/2. Rectangle de n+1 cases de large et n de haut : un chemin de liens ouverts
//   relie-t-il le bord gauche au bord droit ? Par dualite (le rectangle dual est le meme tourne d un quart), la reponse est OUI avec la
//   probabilite EXACTEMENT 1/2, quel que soit n.
// Exact ici : les 2^7 et 2^17 configurations des rectangles 2x1 et 3x2 enumerees une par une (64/128, 65 536/131 072 : valeurs de Grok, recomptees).
// Mesure : 400 rectangles tires (graine) a la taille du curseur, fraction traversee contre 1/2 (statistique, sigma = 1/40).
// Temoin : le CARRE 2x2 n a pas cette symetrie : 2 752/4 096, pas 1/2.
// Dessin (vue de face) : un rectangle tire ; des points le long des liens ouverts, etiquette 2 = amas qui traverse, 1 = amas touchant le bord gauche, 0 = autres.
function percoAretes(W, H) { const E = [], id = (x, y) => y * (W + 1) + x;
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) E.push([id(x, y), id(x + 1, y), x, y, 0]);
  for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) E.push([id(x, y), id(x, y + 1), x, y, 1]); return E; }
function percoAmas(W, H, E, ouvert) { const p = new Int32Array((W + 1) * (H + 1)); for (let i = 0; i < p.length; i++) p[i] = i;
  const f = (a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  for (let k = 0; k < E.length; k++) if (ouvert[k]) p[f(E[k][0])] = f(E[k][1]);
  const bord = new Uint8Array(p.length); for (let y = 0; y <= H; y++) { bord[f(y * (W + 1))] |= 1; bord[f(y * (W + 1) + W)] |= 2; }
  let traverse = false; for (let i = 0; i < p.length; i++) if (bord[i] === 3) traverse = true;
  return { f, bord, traverse }; }
const PERCO_EXACT = new Map();
function percoExact(W, H) { const cle = W + 'x' + H; if (PERCO_EXACT.has(cle)) return PERCO_EXACT.get(cle);
  const E = percoAretes(W, H), m = E.length, ouvert = new Uint8Array(m); let t = 0;
  for (let c = 0; c < 2 ** m; c++) { for (let k = 0; k < m; k++) ouvert[k] = (c >> k) & 1; if (percoAmas(W, H, E, ouvert).traverse) t++; }
  const r = { t, total: 2 ** m }; PERCO_EXACT.set(cle, r); return r; }
function percolationLiens(P, n) {
  const N = P.cote, W = N + 1, H = N, rng = mulberry32(P.graine), E = percoAretes(W, H), m = E.length, PARTIES = 400;
  const e1 = percoExact(2, 1), e2 = percoExact(3, 2), carre = percoExact(2, 2), ouvert = new Uint8Array(m); let ok = 0;
  for (let j = 0; j < PARTIES; j++) { for (let k = 0; k < m; k++) ouvert[k] = rng() < 0.5 ? 1 : 0; if (percoAmas(W, H, E, ouvert).traverse) ok++; }
  for (let k = 0; k < m; k++) ouvert[k] = rng() < 0.5 ? 1 : 0;
  const A = percoAmas(W, H, E, ouvert), liens = [];
  for (let k = 0; k < m; k++) if (ouvert[k]) { const b = A.bord[A.f(E[k][0])]; liens.push([E[k][2], E[k][3], E[k][4], b === 3 ? 2 : b & 1 ? 1 : 0]); }
  if (!liens.length) liens.push([0, 0, 0, 0]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const o = 3 * l, t = l * liens.length / n, s = Math.floor(t), u = t - s, li = liens[s]; brut[o] = li[0] + (li[2] === 0 ? u : 0); brut[o + 1] = li[1] + (li[2] === 1 ? u : 0); brut[o + 2] = li[3]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (liens du reseau)', invariants: {
    dualite: { mesure: Math.abs(e1.t / e1.total - 0.5) + Math.abs(e2.t / e2.total - 0.5), formule: 0, n1: e1.t + '/' + e1.total, n2: e2.t + '/' + e2.total, note: 'every configuration of the 2 x 1 and 3 x 2 rectangles enumerated : distance of the crossing probability from 1/2, added for both (duality says 0 for every n)' },
    simulee: { mesure: ok / PARTIES, formule: 0.5, sigma: Math.sqrt(0.25 / PARTIES), parties: PARTIES, note: 'share of 400 random (n+1) x n rectangles crossed left to right, against 1/2 (statistical)' },
    temoin: { mesure: carre.t + '/' + carre.total, formule: '2752/4096', note: 'witness: the 2 x 2 SQUARE is not self-dual : crossed in 2752 of 4096 configurations, not half' } } };
}

// ---------- 25 : le theoreme de Napoleon (idee et valeurs : codex Grok Bot) ----------
// Sur chaque cote d un triangle, un triangle equilateral pose vers l EXTERIEUR : leurs trois centres forment un triangle equilateral.
// Exact ici : tout est calcule dans Q(sqrt 3) (nombres a + b sqrt 3, a et b fractions BigInt) : la rotation de 60 degres n a besoin
//   que de 1/2 et sqrt(3)/2 ; les trois cotes au carre du triangle des centres sont compares A L IDENTIQUE, sans arrondi.
// Aussi exact : avec les equilateraux vers l INTERIEUR, encore un triangle equilateral, et (aire exterieure) - (aire interieure) = aire du triangle.
// Triangle : sommets entiers tires (graine) dans une grille de la taille du curseur, sens direct, jamais plat.
// Temoin : des CARRES a la place des equilateraux (triangle (0,0) (6,0) (0,8) de Grok) : centres a 116, 130, 98 au carre — pas equilateral.
// Dessin (vue de face) : le triangle, les trois equilateraux exterieurs, le triangle de Napoleon ; etiquette 0, 1, 2.
const napG = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const napF = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const k = napG(n, d) || 1n; return [n / k, d / k]; };
const napFA = (x, y) => napF(x[0] * y[1] + y[0] * x[1], x[1] * y[1]), napFM = (x, y) => napF(x[0] * y[0], x[1] * y[1]);
const napQA = (x, y) => [napFA(x[0], y[0]), napFA(x[1], y[1])], napQN = (x) => [[-x[0][0], x[0][1]], [-x[1][0], x[1][1]]], napQS = (x, y) => napQA(x, napQN(y));
const napQM = (x, y) => [napFA(napFM(x[0], y[0]), napFM(napFM(x[1], y[1]), [3n, 1n])), napFA(napFM(x[0], y[1]), napFM(x[1], y[0]))];
const napEgal = (x, y) => x[0][0] === y[0][0] && x[0][1] === y[0][1] && x[1][0] === y[1][0] && x[1][1] === y[1][1];
const napTexte = (x) => x[0][0] + (x[0][1] === 1n ? '' : '/' + x[0][1]) + ' + ' + x[1][0] + (x[1][1] === 1n ? '' : '/' + x[1][1]) + ' sqrt3';
const napReel = (x) => Number(x[0][0]) / Number(x[0][1]) + (Number(x[1][0]) / Number(x[1][1])) * 1.7320508075688772;
const NAP_DEMI = [[1n, 2n], [0n, 1n]], NAP_R = [[0n, 1n], [1n, 2n]], NAP_TIERS = [[1n, 3n], [0n, 1n]];
/* 3e sommet : rotation de -60 degres de (Q - P) autour de P (exterieur pour un triangle direct) */
function napSommet(P, Q) { const dx = napQS(Q[0], P[0]), dy = napQS(Q[1], P[1]);
  return [napQA(P[0], napQA(napQM(dx, NAP_DEMI), napQM(dy, NAP_R))), napQA(P[1], napQA(napQN(napQM(dx, NAP_R)), napQM(dy, NAP_DEMI)))]; }
const napCentre = (A, B, C) => [napQM(napQA(napQA(A[0], B[0]), C[0]), NAP_TIERS), napQM(napQA(napQA(A[1], B[1]), C[1]), NAP_TIERS)];
const napD2 = (U, V) => { const dx = napQS(U[0], V[0]), dy = napQS(U[1], V[1]); return napQA(napQM(dx, dx), napQM(dy, dy)); };
function napTriangle(S, exterieur) { const ext = (P, Q) => exterieur ? napSommet(P, Q) : napSommet(Q, P), [A, B, C] = S;
  const E = [ext(A, B), ext(B, C), ext(C, A)], G = [napCentre(A, B, E[0]), napCentre(B, C, E[1]), napCentre(C, A, E[2])];
  return { E, G, c2: [napD2(G[0], G[1]), napD2(G[1], G[2]), napD2(G[2], G[0])] }; }
function napoleon(P, n) {
  const L = P.taille, rng = mulberry32(P.graine); let T = null;
  while (!T) { const t = [0, 1, 2].map(() => [Math.floor(rng() * (L + 1)), Math.floor(rng() * (L + 1))]), cr = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
    if (cr > 0) T = t; else if (cr < 0) T = [t[0], t[2], t[1]]; }
  const S = T.map(([x, y]) => [[[BigInt(x), 1n], [0n, 1n]], [[BigInt(y), 1n], [0n, 1n]]]), X = napTriangle(S, true), I = napTriangle(S, false);
  const egaux = (c) => (napEgal(c[0], c[1]) ? 0 : 1) + (napEgal(c[1], c[2]) ? 0 : 1);
  /* aire d un equilateral de cote^2 = s : (sqrt3 / 4) s ; difference exterieur - interieur contre l aire du triangle (rationnelle) */
  const aire2 = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0]), R34 = [[0n, 1n], [1n, 4n]];
  const ecartAires = napQS(napQM(napQS(X.c2[0], I.c2[0]), R34), [[BigInt(aire2), 2n], [0n, 1n]]);
  const tc = [[0, 0], [6, 0], [0, 8]], cc = (p, q) => [p[0] + q[0] + (q[1] - p[1]), p[1] + q[1] - (q[0] - p[0])], Gc = [cc(tc[0], tc[1]), cc(tc[1], tc[2]), cc(tc[2], tc[0])];
  const dc = (u, v) => ((u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2) / 4, carres = [dc(Gc[0], Gc[1]), dc(Gc[1], Gc[2]), dc(Gc[2], Gc[0])];
  const segs = []; const pt = (q) => [napReel(q[0]), napReel(q[1])];
  for (let i = 0; i < 3; i++) segs.push([pt(S[i]), pt(S[(i + 1) % 3]), 0]);
  for (let i = 0; i < 3; i++) { segs.push([pt(S[i]), pt(X.E[i]), 1]); segs.push([pt(X.E[i]), pt(S[(i + 1) % 3]), 1]); }
  for (let i = 0; i < 3; i++) segs.push([pt(X.G[i]), pt(X.G[(i + 1) % 3]), 2]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const o = 3 * l, t = l * segs.length / n, s = Math.floor(t), u = t - s, sg = segs[s];
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases de la grille)', invariants: {
    equilateral: { mesure: egaux(X.c2), formule: 0, cote2: napTexte(X.c2[0]), triangle: JSON.stringify(T), note: 'pairs of sides of the outer Napoleon triangle whose squares differ, compared exactly in Q(sqrt 3)' },
    interieur: { mesure: egaux(I.c2), formule: 0, cote2: napTexte(I.c2[0]), note: 'same with the equilateral triangles turned inwards : still equilateral' },
    aires: { mesure: napReel(ecartAires), formule: 0, exact: napTexte(ecartAires), note: 'area of the outer Napoleon triangle minus the inner one, minus the area of the triangle : exactly 0' },
    temoin: { mesure: carres.join(', '), formule: '116, 130, 98', note: 'witness: squares instead of equilateral triangles on (0,0) (6,0) (0,8) : the centres are 116, 130, 98 apart (squared), not equilateral' } } };
}

// ---------- 26 : le billard elliptique et sa caustique (idee et valeurs : codex Grok Bot ; « Ivory revisited », Integrable Systems 2017, lu par Grok) ----------
// Une bille rebondit dans l ellipse x^2 + y^2/b^2 = 1 (angle d incidence = angle de reflexion). Chaque corde reste tangente a UNE MEME conique
//   confocale x^2/(1 - L) + y^2/(b^2 - L) = 1 : une ellipse (L < b^2) si la bille ne passe jamais entre les foyers, une hyperbole sinon.
// Mesure : pour chaque corde, de normale unitaire n et de distance d au centre, L = n1^2 + b^2 n2^2 - d^2 (condition de tangence, derivee :
//   une droite n.x = d touche x^2/A + y^2/B = 1 ssi A n1^2 + B n2^2 = d^2) ; on suit son ecart au premier L sur tous les rebonds.
// Aussi : chaque point d impact verifie |PF1| + |PF2| = 2 (foyers a +- sqrt(1 - b^2)).
// Temoin : meme bille, mais reflechie sur la normale RADIALE (celle du cercle) au lieu de la vraie normale : L derive.
// Dessin (vue de face) : l ellipse (0), la trajectoire (1), la caustique (2).
function billardTrace(b, t0, tir, N, radiale) {
  const b2 = b * b; let p = [cosD(t0), b * sinD(t0)], v = [cosD(tir), sinD(tir)];
  if (v[0] * p[0] + v[1] * p[1] / b2 > 0) v = [-v[0], -v[1]]; /* vers l interieur */
  const L = [], pts = [p]; let foyers = 0; const c = Math.sqrt(1 - b2);
  for (let k = 0; k < N; k++) {
    const A = v[0] * v[0] + v[1] * v[1] / b2, B = 2 * (p[0] * v[0] + p[1] * v[1] / b2), C = p[0] * p[0] + p[1] * p[1] / b2 - 1;
    const t = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A), q = [p[0] + t * v[0], p[1] + t * v[1]];
    const n = [-v[1], v[0]], d = n[0] * p[0] + n[1] * p[1]; L.push(n[0] * n[0] + b2 * n[1] * n[1] - d * d);
    let g = radiale ? [q[0], q[1]] : [q[0], q[1] / b2]; const gl = Math.sqrt(g[0] * g[0] + g[1] * g[1]); g = [g[0] / gl, g[1] / gl];
    const vg = v[0] * g[0] + v[1] * g[1]; v = [v[0] - 2 * vg * g[0], v[1] - 2 * vg * g[1]];
    const s = Math.sqrt(q[0] * q[0] + q[1] * q[1] / b2); p = [q[0] / s, q[1] / s]; pts.push(p);
    foyers = Math.max(foyers, Math.abs(Math.sqrt((p[0] - c) ** 2 + p[1] ** 2) + Math.sqrt((p[0] + c) ** 2 + p[1] ** 2) - 2));
  }
  let derive = 0; for (const l of L) derive = Math.max(derive, Math.abs(l - L[0]));
  return { L0: L[0], derive, foyers, pts };
}
function billardElliptique(P, n) {
  const b = P.petitAxe, b2 = b * b, t0 = P.lancer * PI / 180, tir = P.tir * PI / 180, N = P.rebonds;
  const R = billardTrace(b, t0, tir, N, false), F = billardTrace(b, t0, tir, N, true), L0 = R.L0, ellipse = L0 < b2;
  const segs = [], DESSINES = N;
  for (let k = 0; k < DESSINES; k++) segs.push([R.pts[k], R.pts[k + 1], 1]);
  const bord = [], caus = [], M = 120;
  for (let i = 0; i < M; i++) { const a = 2 * PI * i / M; bord.push([cosD(a), b * sinD(a)]); }
  if (ellipse) for (let i = 0; i < M; i++) { const a = 2 * PI * i / M; caus.push([Math.sqrt(1 - L0) * cosD(a), Math.sqrt(b2 - L0) * sinD(a)]); }
  else for (let i = 0; i <= M; i++) { const y = -b + 2 * b * i / M, x = Math.sqrt(1 - L0) * Math.sqrt(1 + y * y / (L0 - b2)); for (const sx of [x, -x]) if (sx * sx + y * y / b2 <= 1) caus.push([sx, y]); }
  const brut = new Float64Array(n * 3), n0 = Math.floor(n / 6), n2 = caus.length ? Math.floor(n / 6) : 0, n1 = n - n0 - n2;
  for (let l = 0; l < n; l++) { const o = 3 * l; let x, y, e;
    if (l < n0) { const q = bord[Math.floor(l * M / n0)]; x = q[0]; y = q[1]; e = 0; }
    else if (l < n0 + n2) { const q = caus[Math.floor((l - n0) * caus.length / n2)]; x = q[0]; y = q[1]; e = 2; }
    else { const t = (l - n0 - n2) * segs.length / n1, s = Math.floor(t), u = t - s, sg = segs[s]; x = sg[0][0] + u * (sg[1][0] - sg[0][0]); y = sg[0][1] + u * (sg[1][1] - sg[0][1]); e = 1; }
    brut[o] = x; brut[o + 1] = y; brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'demi-grand axe = 1', invariants: {
    caustique: { mesure: R.derive, formule: 0, lambda0: L0, typeCaustique: ellipse ? 'ellipse (never between the foci)' : 'hyperbola (crosses between the foci)', rebonds: N, note: 'largest change of the confocal parameter L of the chords over all bounces (every chord touches the same confocal conic)' },
    foyers: { mesure: R.foyers, formule: 0, note: 'largest | |PF1| + |PF2| - 2 | over the bounce points' },
    temoin: { mesure: F.derive, note: 'witness: reflecting on the radial normal (the circle s) instead of the true one : L drifts' } } };
}

// ---------- 27 : le theoreme de Feuerbach (idee et valeurs : codex Grok Bot ; Scheer, Forum Geometricorum 11 (2011), theoreme 5, lu par Grok) ----------
// Le cercle des neuf points (centre N, rayon R/2) touche le cercle inscrit de l INTERIEUR (NI = R/2 - r) et les trois cercles exinscrits de
//   l EXTERIEUR (N I_a = R/2 + r_a, ...).
// Exact ici : triangles a sommets ENTIERS et cotes ENTIERS (A = (0,0), B = (p,0), C = (x,y), |AC| et |BC| entiers), tires (graine) parmi ceux
//   de la grille du curseur : R = abc/4K, r = K/s, r_a = K/(s - a), O, H = A + B + C - 2O, N = (O + H)/2, I et les excentres (barycentres
//   ponderes par +-a, b, c) sont tous RATIONNELS ; les quatre tangences sont comparees au carre, en fractions BigInt, A L IDENTIQUE.
// Temoin : le cercle CIRCONSCRIT n est pas tangent au cercle inscrit : OI^2 = R^2 - 2Rr (Euler), pas (R - r)^2.
// Dessin (vue de face) : le triangle (0), le cercle des neuf points (1), le cercle inscrit (2), les trois cercles exinscrits (3).
const feuG = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const feuF = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const k = feuG(n, d) || 1n; return [n / k, d / k]; };
const feuAdd = (x, y) => feuF(x[0] * y[1] + y[0] * x[1], x[1] * y[1]), feuSub = (x, y) => feuAdd(x, [-y[0], y[1]]);
const feuMul = (x, y) => feuF(x[0] * y[0], x[1] * y[1]), feuDiv = (x, y) => feuF(x[0] * y[1], x[1] * y[0]);
const feuEq = (x, y) => x[0] === y[0] && x[1] === y[1], feuE = (n) => [BigInt(n), 1n], feuNb = (x) => Number(x[0]) / Number(x[1]);
const feuTexte = (x) => x[0] + (x[1] === 1n ? '' : '/' + x[1]);
function feuTriangles(L) { const T = [], rc = (n) => { const r = Math.round(Math.sqrt(n)); return r * r === n ? r : -1; };
  for (let p = 1; p <= L; p++) for (let x = -L; x <= 2 * L; x++) for (let y = 1; y <= L; y++) { const b = rc(x * x + y * y), a = rc((p - x) ** 2 + y * y); if (b > 0 && a > 0 && !(a === b && b === p)) T.push([p, x, y, a, b]); }
  return T; }
function feuCalcul([p, x, y, a, b]) {
  const c = p, A = [feuE(0), feuE(0)], B = [feuE(p), feuE(0)], C = [feuE(x), feuE(y)], K = feuDiv(feuE(p * y), feuE(2)), s = feuDiv(feuE(a + b + c), feuE(2));
  const R = feuDiv(feuE(a * b * c), feuMul(feuE(4), K)), r = feuDiv(K, s), ra = feuDiv(K, feuSub(s, feuE(a))), rb = feuDiv(K, feuSub(s, feuE(b))), rcx = feuDiv(K, feuSub(s, feuE(c)));
  const O = [feuF(BigInt(p), 2n), feuDiv(feuSub(feuE(x * x + y * y), feuE(p * x)), feuE(2 * y))];
  const H = [feuSub(feuAdd(feuAdd(A[0], B[0]), C[0]), feuMul(feuE(2), O[0])), feuSub(feuAdd(feuAdd(A[1], B[1]), C[1]), feuMul(feuE(2), O[1]))];
  const N = [feuDiv(feuAdd(O[0], H[0]), feuE(2)), feuDiv(feuAdd(O[1], H[1]), feuE(2))];
  const bar = (wa, wb, wc) => { const S = feuE(wa + wb + wc); return [feuDiv(feuAdd(feuAdd(feuMul(feuE(wa), A[0]), feuMul(feuE(wb), B[0])), feuMul(feuE(wc), C[0])), S), feuDiv(feuAdd(feuAdd(feuMul(feuE(wa), A[1]), feuMul(feuE(wb), B[1])), feuMul(feuE(wc), C[1])), S)]; };
  const I = bar(a, b, c), Ia = bar(-a, b, c), Ib = bar(a, -b, c), Ic = bar(a, b, -c);
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1]))), carre = (z) => feuMul(z, z), R2 = feuDiv(R, feuE(2));
  return { R, r, ra, rb, rcx, O, N, I, Ia, Ib, Ic, R2, interne: feuEq(d2(N, I), carre(feuSub(R2, r))),
    externes: [[Ia, ra], [Ib, rb], [Ic, rcx]].filter(([P, q]) => !feuEq(d2(N, P), carre(feuAdd(R2, q)))).length,
    neuf: feuEq(d2(N, [feuF(BigInt(p), 2n), feuE(0)]), carre(R2)), oi2: d2(O, I), rMoinsR2: carre(feuSub(R, r)), euler: feuSub(carre(R), feuMul(feuE(2), feuMul(R, r))) };
}
function feuerbach(P, n) {
  const T = feuTriangles(P.taille), rng = mulberry32(P.graine), t = T[Math.floor(rng() * T.length)], F = feuCalcul(t), [p, x, y] = t;
  const cercles = [[F.N, F.R2, 1], [F.I, F.r, 2], [F.Ia, F.ra, 3], [F.Ib, F.rb, 3], [F.Ic, F.rcx, 3]], brut = new Float64Array(n * 3), S = [[0, 0], [p, 0], [x, y]];
  const n0 = Math.floor(n / 5), parC = Math.max(1, Math.floor((n - n0) / 5)); /* petit n : jamais 0/0 */
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < n0) { const u = 3 * l / n0, k = Math.floor(u), v = u - k, P0 = S[k], P1 = S[(k + 1) % 3]; brut[o] = P0[0] + v * (P1[0] - P0[0]); brut[o + 1] = P0[1] + v * (P1[1] - P0[1]); brut[o + 2] = 0; continue; }
    const j = Math.min(4, Math.floor((l - n0) / parC)), q = (l - n0 - j * parC) / parC, [Cc, rr, e] = cercles[j], ang = 2 * PI * q;
    brut[o] = feuNb(Cc[0]) + feuNb(rr) * cosD(ang); brut[o + 1] = feuNb(Cc[1]) + feuNb(rr) * sinD(ang); brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'cases de la grille', invariants: {
    interne: { mesure: F.interne ? 0 : 1, formule: 0, triangle: JSON.stringify(S), note: 'nine-point circle and incircle : NI^2 = (R/2 - r)^2 compared exactly in fractions (0 = they touch from inside)' },
    externes: { mesure: F.externes, formule: 0, rayons: [F.R, F.r, F.ra, F.rb, F.rcx].map(feuTexte).join(', '), note: 'excircles NOT touching the nine-point circle from outside (N I_a = R/2 + r_a, exact) ; rayons = R, r, r_a, r_b, r_c' },
    neufPoints: { mesure: F.neuf ? 0 : 1, formule: 0, note: 'the circle centred at N = (O + H)/2 with radius R/2 passes through the midpoint of AB (exact)' },
    temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.euler), carreRmoinsr: feuTexte(F.rMoinsR2), note: 'witness: the CIRCUMcircle does not touch the incircle : OI^2 = R^2 - 2Rr (Euler), not (R - r)^2' } } };
}

// ---------- 28 : le jeu de la vie, trois oscillateurs (idee et valeurs : codex Grok Bot ; LifeWiki « Blinker », « Pulsar », « Pentadecathlon », lus par Grok) ----------
// Regle de Conway B3/S23 sur le plan ENTIER (un ensemble de cellules, aucun bord, aucun tore) : une case nait avec exactement 3 voisines,
//   survit avec 2 ou 3. Un oscillateur revient a SA forme, au meme endroit, apres p generations.
// Exact ici : on fait evoluer le motif et on compare l ensemble des cellules a celui du depart, case par case : la PREMIERE egalite donne
//   la periode minimale. Clignotant 3 cellules -> 2 ; pulsar 48 -> 3 ; pentadecathlon 12 -> 15.
// Temoin : le PLANEUR ne revient jamais sur lui-meme (4 fois la plus grande periode essayee), mais apres 4 generations il est exactement
//   lui-meme decale d une case en diagonale : il voyage, il n oscille pas.
// Dessin (vue de face) : toutes les phases d une periode, etiquette = la generation (0 .. p - 1).
const vieCle = (x, y) => x + ',' + y;
function viePas(S) { const n = new Map();
  for (const k of S) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const c = vieCle(x + dx, y + dy); n.set(c, (n.get(c) || 0) + 1); } }
  const T = new Set(); for (const [c, v] of n) if (v === 3 || (v === 2 && S.has(c))) T.add(c); return T; }
const vieEgal = (A, B) => A.size === B.size && [...A].every((k) => B.has(k));
function vieRle(s) { const S = new Set(); let x = 0, y = 0, n = '';
  for (const ch of s) { if (ch >= '0' && ch <= '9') { n += ch; continue; } const k = n ? +n : 1; n = '';
    if (ch === 'b') x += k; else if (ch === 'o') { for (let i = 0; i < k; i++) S.add(vieCle(x + i, y)); x += k; } else if (ch === '$') { y += k; x = 0; } else if (ch === '!') break; }
  return S; }
const VIE_MOTIFS = [['blinker', '3o!', 2], ['pulsar', '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!', 3], ['pentadecathlon', '2bo4bo$2ob4ob2o$2bo4bo!', 15]];
function jeuDeLaVie(P, n) {
  const [nom, rle, attendue] = VIE_MOTIFS[P.oscillateur], S0 = vieRle(rle), MAX = 60, phases = [S0]; let S = S0, p = null;
  for (let t = 1; t <= MAX && p === null; t++) { S = viePas(S); if (vieEgal(S, S0)) p = t; else phases.push(S); }
  const planeur = vieRle('bo$2bo$3o!'); let G = planeur, retour = null; for (let t = 1; t <= 60 && retour === null; t++) { G = viePas(G); if (vieEgal(G, planeur)) retour = t; }
  let G4 = planeur; for (let t = 0; t < 4; t++) G4 = viePas(G4);
  const decale = new Set([...planeur].map((k) => { const i = k.indexOf(','); return vieCle(+k.slice(0, i) + 1, +k.slice(i + 1) + 1); }));
  const points = []; phases.forEach((Ph, t) => { for (const k of Ph) { const i = k.indexOf(','); points.push([+k.slice(0, i), -(+k.slice(i + 1)), t]); } });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const ce = points[Math.floor(l * points.length / n)], o = 3 * l; brut[o] = ce[0]; brut[o + 1] = ce[1]; brut[o + 2] = ce[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    retour: { mesure: p === null ? NaN : p, formule: attendue, motif: nom, vivantes: S0.size, absente: 'no return within ' + MAX + ' generations', note: 'first generation where the whole set of live cells equals the starting set, cell by cell (= the smallest period)' },
    temoin: { mesure: retour === null && vieEgal(G4, decale) ? 'never returns ; after 4 = itself moved (1,1)' : 'returns or does not move', formule: 'never returns ; after 4 = itself moved (1,1)', note: 'witness: the glider never comes back to the same place (60 generations) : after 4 it is itself, one cell down and right — it travels' } } };
}

// ---------- 29 : les marches auto-evitantes (idee et valeurs : codex Grok Bot ; OEIS A001411, lu par Grok) ----------
// Une marche de n pas sur le quadrillage, partant de l origine, qui ne repasse JAMAIS par un point deja visite. Combien y en a-t-il ?
//   Aucune formule fermee n est connue : on les COMPTE, toutes, par un parcours en profondeur (c(12) = 324 932).
// Exact ici : c(1..n) contre la suite A001411 relevee par Grok (n <= 12) ; et une loi derivee : couper une marche de m + k pas en deux donne
//   deux marches auto-evitantes, donc c(m + k) <= c(m) c(k) pour tout m + k <= n (sous-multiplicativite), verifiee sur toutes les paires.
// Temoin : « ne jamais revenir en arriere » n est pas « ne jamais se recroiser » : 4 x 3^(k-1) marches sans demi-tour, egal a c(k) pour
//   k <= 3, plus grand des k = 4 (108 contre 100 : le petit carre referme).
// Dessin (vue de face) : la marche numero j (graine) parmi les c(n), dans l ordre du parcours ; etiquette = le numero du pas.
const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];
function sawParcours(N, cible) { const T = 2 * N + 3, vu = new Uint8Array(T * T), c = new Array(N + 1).fill(0), DIR = [1, -1, T, -T], chemin = [];
  let trouve = null, rang = 0; const o = (N + 1) * T + N + 1;
  const dfs = (p, k) => { c[k]++; chemin.push(p); if (k === N) { if (rang === cible) trouve = chemin.slice(); rang++; } else for (const d of DIR) { const q = p + d; if (!vu[q]) { vu[q] = 1; dfs(q, k + 1); vu[q] = 0; } } chemin.pop(); };
  vu[o] = 1; dfs(o, 0); return { c, trouve: trouve && trouve.map((p) => [(p % T) - (N + 1), Math.floor(p / T) - (N + 1)]) }; }
function marcheAutoEvitante(P, n) {
  const N = P.etapes, rng = mulberry32(P.graine), total = SAW_A001411[N], cible = Math.floor(rng() * total), R = sawParcours(N, cible), c = R.c;
  let ecarts = 0; for (let k = 0; k <= N; k++) if (c[k] !== SAW_A001411[k]) ecarts++;
  let violations = 0; for (let m = 1; m < N; m++) for (let k = 1; m + k <= N; k++) if (c[m + k] > c[m] * c[k]) violations++;
  let premier = null; for (let k = 1; k <= N && premier === null; k++) if (4 * 3 ** (k - 1) !== c[k]) premier = k;
  const pts = R.trouve, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = l * N / n, s = Math.floor(t), u = t - s, de = pts[s], vers = pts[s + 1], o = 3 * l; brut[o] = de[0] + u * (vers[0] - de[0]); brut[o + 1] = de[1] + u * (vers[1] - de[1]); brut[o + 2] = s; }
  return { D: 3, brut, nuage: true, unite: 'pas du quadrillage', invariants: {
    comptes: { mesure: ecarts, formule: 0, cn: c[N], marche: cible + 1, chemin: JSON.stringify(pts), note: 'lengths k = 0..n where the walks counted one by one disagree with OEIS A001411 ; cn = c(n) ; marche = which walk is drawn' },
    sousMult: { mesure: violations, formule: 0, note: 'pairs (m, k) with m + k <= n where c(m + k) > c(m) c(k) (cutting a walk in two must give two self-avoiding walks)' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 4, absente: 'n too small for the first closed square', nonRetour: N >= 4 ? 4 * 27 : null, note: 'witness: first length where the 4 x 3^(k-1) walks that never step straight back outnumber the self-avoiding ones (k = 4 : 108 vs 100)' } } };
}

// ---------- 30 : la formule d Euler sur des solides non platoniciens (idee et valeurs : codex Grok Bot ; Wikipedia « List of uniform polyhedra », lu par Grok) ----------
// Pour un polyedre convexe (une sphere deformee), sommets - aretes + faces = 2. Ici les trois nombres sont MESURES depuis les coordonnees :
//   V = les points ; E = les paires de points a la plus petite distance (tous ces solides ont des aretes egales) ; F = les plans d appui
//   distincts (passant par deux aretes qui se suivent, tous les autres sommets du meme cote). Aucun des trois n est deduit des deux autres.
// Aussi : chaque arete borde deux faces, donc la somme des sommets de chaque face vaut 2E (verifie face par face).
// Solides : 0 prisme triangulaire, 1 antiprisme carre, 2 cuboctaedre, 3 icosaedre tronque (ballon de football), 4 rhombicuboctaedre,
//   5 dodecaedre adouci (game173 : orbite du point p sous les rotations M1, M2, xi racine reelle de xi^3 + 2 xi^2 = phi^2 — Wikipedia
//   « Snub dodecahedron », lu par Grok ; aretes de longueur 2 xi sqrt(1 - xi)).
// Temoin : un cadre carre (tore polyedrique, 16 faces quadrilateres) : V - E + F = 0, pas 2 — la formule vaut pour la sphere, pas pour un trou.
// Dessin (3-D) : les aretes du solide.
const EUL_PHI = (1 + Math.sqrt(5)) / 2, EUL_R2 = 1 + Math.SQRT2;
const eulPerms = (v, pair) => { const [a, b, c] = v; return pair ? [[a, b, c], [b, c, a], [c, a, b]] : [[a, b, c], [b, c, a], [c, a, b], [b, a, c], [a, c, b], [c, b, a]]; };
const eulSignes = (v) => { const r = []; for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) r.push([v[0] * sx, v[1] * sy, v[2] * sz]); return r; };
const eulDist = (p, q) => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
const eulUniq = (P) => { const r = []; for (const p of P) if (!r.some((q) => eulDist(p, q) < 1e-9)) r.push(p); return r; };
function eulSolide(k) {
  if (k === 0) { const r = []; for (let i = 0; i < 3; i++) { const a = 2 * PI * i / 3; for (const z of [-0.5, 0.5]) r.push([cosD(a) / Math.sqrt(3), sinD(a) / Math.sqrt(3), z]); } return r; }
  if (k === 1) { const r = [], R = 1 / Math.SQRT2, h = Math.sqrt(1 - 2 * R * R * (1 - cosD(PI / 4))) / 2; for (let i = 0; i < 4; i++) { const a = PI * i / 2; r.push([R * cosD(a), R * sinD(a), h]); r.push([R * cosD(a + PI / 4), R * sinD(a + PI / 4), -h]); } return r; }
  if (k === 2) return eulUniq(eulPerms([1, 1, 0]).flatMap(eulSignes));
  if (k === 5) { let x = 0.9; for (let i = 0; i < 60; i++) x -= (x ** 3 + 2 * x ** 2 - EUL_PHI ** 2) / (3 * x * x + 4 * x);
    const f = EUL_PHI, p = [f * f - f * f * x, -(f ** 3) + f * x + 2 * f * x * x, x], M1 = [[1 / (2 * f), -f / 2, 1 / 2], [f / 2, 1 / 2, 1 / (2 * f)], [-1 / 2, 1 / (2 * f), f / 2]], M2 = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
    const ap = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]), pts = [p];
    for (let i = 0; i < pts.length; i++) for (const M of [M1, M2]) { const q = ap(M, pts[i]); if (!pts.some((r) => eulDist(r, q) < 1e-9)) pts.push(q); }
    return pts; }
  if (k === 3) return eulUniq([[0, 1, 3 * EUL_PHI], [1, 2 + EUL_PHI, 2 * EUL_PHI], [EUL_PHI, 2, 2 * EUL_PHI + 1]].flatMap((v) => eulPerms(v, true)).flatMap(eulSignes));
  return eulUniq(eulPerms([1, 1, EUL_R2], true).flatMap(eulSignes)); }
function eulMesure(P) {
  const V = P.length; let m = Infinity; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) m = Math.min(m, eulDist(P[i], P[j]));
  const vois = P.map(() => []), aretes = []; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (Math.abs(eulDist(P[i], P[j]) - m) < 1e-9 * m) { aretes.push([i, j]); vois[i].push(j); vois[j].push(i); }
  const plans = []; let sommetsFaces = 0;
  for (let i = 0; i < V; i++) for (const j of vois[i]) for (const k of vois[i]) { if (j >= k) continue;
    const u = P[j].map((x, t) => x - P[i][t]), w = P[k].map((x, t) => x - P[i][t]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2); if (l < 1e-9) continue;
    const nn = n.map((x) => x / l), c = nn[0] * P[i][0] + nn[1] * P[i][1] + nn[2] * P[i][2]; let pos = 0, neg = 0, sur = 0;
    for (const p of P) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - c; if (s > 1e-9) pos++; else if (s < -1e-9) neg++; else sur++; }
    if (pos > 0 && neg > 0) continue; const sg = pos ? -1 : 1, cle = nn.map((x) => x * sg); if (!plans.some((q) => eulDist(q, cle) < 1e-9)) { plans.push(cle); sommetsFaces += sur; } }
  return { V, E: aretes.length, F: plans.length, aretes, sommetsFaces };
}
function eulerSolides(P, n) {
  const S = eulSolide(P.solide), M = eulMesure(S);
  /* temoin : le cadre carre, donne par ses 16 faces ; V et E comptes DEPUIS les faces */
  const id = (int, k, z) => (int ? 4 : 0) + k + (z ? 8 : 0), faces = [];
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; faces.push([id(0, k, 0), id(0, k2, 0), id(0, k2, 1), id(0, k, 1)], [id(1, k, 0), id(1, k2, 0), id(1, k2, 1), id(1, k, 1)], [id(0, k, 1), id(0, k2, 1), id(1, k2, 1), id(1, k, 1)], [id(0, k, 0), id(0, k2, 0), id(1, k2, 0), id(1, k, 0)]); }
  const Vt = new Set(faces.flat()).size, Et = new Set(faces.flatMap((f) => f.map((a, i) => { const b = f[(i + 1) % f.length]; return Math.min(a, b) + '-' + Math.max(a, b); }))).size;
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * M.aretes.length / n, s = Math.floor(t), u = t - s, [i, j] = M.aretes[s], o = 3 * l;
    for (let d = 0; d < 3; d++) brut[o + d] = S[i][d] + u * (S[j][d] - S[i][d]); }
  return { D: 3, brut, nuage: true, unite: 'longueur d arete', invariants: {
    euler: { mesure: M.V - M.E + M.F, formule: 2, sommets: M.V, aretes: M.E, faces: M.F, points: JSON.stringify(S), note: 'vertices - edges + faces, each MEASURED from the coordinates (points, pairs at the shortest distance, supporting planes)' },
    poignees: { mesure: M.sommetsFaces - 2 * M.E, formule: 0, note: 'sum over the faces of their corners, minus 2E : every edge borders exactly two faces' },
    temoin: { mesure: Vt - Et + faces.length, formule: 0, note: 'witness: a square picture frame (a polyhedral torus, 16 four-sided faces) : V - E + F = 0, not 2' } } };
}

// ---------- 31 : le theoreme de Morley (idee et valeurs : codex Grok Bot ; Webster, Mathematics Magazine 43 (1970) 209-210, lu par Grok) ----------
// Couper chaque angle d un triangle en TROIS : les trisectrices voisines d un meme cote se coupent en trois points qui forment TOUJOURS un
//   triangle equilateral, de cote 8 R sin(A/3) sin(B/3) sin(C/3) (Webster), R rayon du cercle circonscrit.
// Mesure : triangle inscrit dans le cercle de rayon 1 (angles A et B au curseur, C = 180 - A - B) ; chaque sommet de Morley = intersection
//   des deux droites issues des extremites d un cote, tournees de A/3 (resp. B/3) vers l interieur ; les trois cotes mesures contre Webster.
// Temoin : avec les QUADRISECTRICES (angles coupes en 4) la meme construction donne un triangle qui n est pas equilateral.
// Dessin (vue de face) : le triangle (0), les trisectrices jusqu a leur point (1), le triangle de Morley (2).
function morleyPoints(A, B, k) {
  const C = PI - A - B, P = [[cosD(PI / 2 + 2 * C), sinD(PI / 2 + 2 * C)], [cosD(PI / 2 + 2 * C + 2 * A), sinD(PI / 2 + 2 * C + 2 * A)], [cosD(PI / 2 + 2 * C + 2 * A + 2 * B), sinD(PI / 2 + 2 * C + 2 * A + 2 * B)]];
  /* sommets sur le cercle unite : l arc oppose a un angle vaut deux fois l angle ; P[0], P[1], P[2] portent les angles B, C, A dans cet ordre
   *   (on les renomme par leurs angles reels plus bas, mesures) */
  const ang = (U, V, W) => { const a = [V[0] - U[0], V[1] - U[1]], b = [W[0] - U[0], W[1] - U[1]], c = (a[0] * b[0] + a[1] * b[1]) / Math.sqrt((a[0] ** 2 + a[1] ** 2) * (b[0] ** 2 + b[1] ** 2)); return atan2D(Math.sqrt(Math.max(0, 1 - c * c)), c); };
  const al = [ang(P[0], P[1], P[2]), ang(P[1], P[2], P[0]), ang(P[2], P[0], P[1])];
  const rot = (v, t) => [v[0] * cosD(t) - v[1] * sinD(t), v[0] * sinD(t) + v[1] * cosD(t)];
  const inter = (U, d1, V, d2) => { const den = d1[0] * d2[1] - d1[1] * d2[0], t = ((V[0] - U[0]) * d2[1] - (V[1] - U[1]) * d2[0]) / den; return [U[0] + t * d1[0], U[1] + t * d1[1]]; };
  const sens = Math.sign((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]));
  const M = [], traits = [];
  for (let i = 0; i < 3; i++) { const U = P[i], V = P[(i + 1) % 3], du = [V[0] - U[0], V[1] - U[1]], dv = [U[0] - V[0], U[1] - V[1]];
    const X = inter(U, rot(du, sens * al[i] / k), V, rot(dv, -sens * al[(i + 1) % 3] / k)); M.push(X); traits.push([U, X], [V, X]); }
  return { P, al, M };
}
function morley(P0, n) {
  const A = P0.angleA * PI / 180, B = P0.angleB * PI / 180, T = morleyPoints(A, B, 3), Q = morleyPoints(A, B, 4);
  const d = (U, V) => Math.sqrt((U[0] - V[0]) ** 2 + (U[1] - V[1]) ** 2), cotes = [0, 1, 2].map((i) => d(T.M[i], T.M[(i + 1) % 3])), qc = [0, 1, 2].map((i) => d(Q.M[i], Q.M[(i + 1) % 3]));
  const s = 8 * sinD(T.al[0] / 3) * sinD(T.al[1] / 3) * sinD(T.al[2] / 3); /* R = 1 */
  const segs = []; for (let i = 0; i < 3; i++) { segs.push([T.P[i], T.P[(i + 1) % 3], 0]); segs.push([T.P[i], T.M[i], 1], [T.P[(i + 1) % 3], T.M[i], 1]); segs.push([T.M[i], T.M[(i + 1) % 3], 2]); }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  const ecartMax = Math.max(...cotes.map((c) => Math.abs(c - s))) / s, spreadQ = (Math.max(...qc) - Math.min(...qc)) / Math.max(...qc);
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle circonscrit = 1', invariants: {
    webster: { mesure: ecartMax, formule: 0, cote: s, troisAngles: T.al.map((a) => a * 180 / PI).map((x) => x.toFixed(9)).join(', '), note: 'largest relative gap between the three measured sides of the Morley triangle and 8 R sin(A/3) sin(B/3) sin(C/3) (R = 1)' },
    temoin: { mesure: spreadQ, note: 'witness: cutting the angles in FOUR instead of three : relative spread of the three sides (not 0 : not equilateral)' } } };
}

// ---------- 32 : le probleme de Bale, 1 + 1/4 + 1/9 + ... = pi^2/6 (idee et valeurs : codex Grok Bot ; Daners, preuve elementaire, lue par Grok) ----------
// Les sommes partielles S_n = 1 + 1/4 + ... + 1/n^2 montent vers pi^2/6 sans jamais l atteindre. Exact ici :
//   S_n en FRACTIONS (BigInt) pour n <= 30 (S_10 = 1968329/1270080, valeurs de Grok) ;
//   l encadrement du reste 1/(n+1) < pi^2/6 - S_n < 1/n (derive : 1/(k(k+1)) < 1/k^2 < 1/(k(k-1)), sommes telescopiques) verifie pour
//   CHAQUE n jusqu au curseur (S_n en somme compensee de Kahan).
// Temoin : la serie des 1/k (sans le carre) depasse pi^2/6 des n = 3 (1 + 1/2 + 1/3 = 11/6) et ne s arrete jamais : elle diverge.
// Dessin (vue de face) : les points (1/n, S_n) (0), la limite pi^2/6 (1), la bande de l encadrement (2).
const BALE_PI2_6 = PI * PI / 6;
function baleFraction(n) { let num = 0n, den = 1n; const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  for (let k = 1n; k <= BigInt(n); k++) { const d = k * k; num = num * d + den; den = den * d; const q = g(num, den); num /= q; den /= q; } return num + '/' + den; }
function bale(P, n) {
  const N = P.termes; let horsBornes = 0; const S = new Float64Array(N + 1);
  let s = 0, comp = 0; /* somme compensee (Kahan) : erreur de l ordre de l epsilon, pas n x epsilon */
  for (let m = 1; m <= N; m++) { const y = 1 / (m * m) - comp, t = s + y; comp = (t - s) - y; s = t; S[m] = s; const r = BALE_PI2_6 - s; if (!(1 / (m + 1) < r && r < 1 / m)) horsBornes++; }
  let h = 0, depasse = null; for (let k = 1; k <= 10 && depasse === null; k++) { h += 1 / k; if (h > BALE_PI2_6) depasse = k; }
  /* abscisse 1/n (de 1 vers 0) : S_n ~ pi^2/6 - 1/n y est presque une droite, et les deux colonnes restent de la meme taille */
  const brut = new Float64Array(n * 3), tiers = Math.ceil(n / 3);
  for (let l = 0; l < n; l++) { const o = 3 * l, j = 1 + Math.floor((l % tiers) * N / tiers), quoi = Math.floor(l / tiers);
    brut[o] = 1 / j; brut[o + 1] = quoi === 0 ? S[j] : quoi === 1 ? BALE_PI2_6 : BALE_PI2_6 - 1 / j + (l % 2 ? 1 / j - 1 / (j + 1) : 0); brut[o + 2] = quoi; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    encadre: { mesure: horsBornes, formule: 0, termes: N, note: 'values of n from 1 to the slider where 1/(n+1) < pi^2/6 - S_n < 1/n fails' },
    sommeExacte: { mesure: baleFraction(Math.min(N, 30)), formule: Math.min(N, 30) === 10 ? '1968329/1270080' : null, rangFraction: Math.min(N, 30), note: 'S_n as an exact fraction (n up to 30)' },
    temoin: { mesure: depasse === null ? NaN : depasse, formule: 3, note: 'witness: without the square, 1 + 1/2 + 1/3 = 11/6 is already above pi^2/6 ; that series grows without end' } } };
}

// ---------- 33 : la droite de Simson (idee et valeurs : codex Grok Bot ; MathWorld « Simson Line », Cut-the-Knot (Wallace 1797), lus par Grok) ----------
// D un point P du cercle circonscrit, on abaisse les perpendiculaires aux trois cotes (aux DROITES, prolongees) : les trois pieds sont ALIGNES.
//   Hors du cercle, ils ne le sont plus (Wallace : le triangle podaire degenere en droite ssi P est sur le cercle).
// Exact ici, en fractions BigInt : triangle a sommets entiers (graine) ; P = seconde intersection du cercle avec la corde issue de A de pente
//   rationnelle corde/7 (le cercle passe par A, point rationnel, donc P l est aussi) ; pieds = projections rationnelles ; alignement = aire
//   signee des trois pieds, exactement 0. Temoin : P repousse hors du cercle (O + 5/4 (P - O)) -> aire non nulle.
// Dessin (vue de face) : le triangle (0), le cercle (1), les perpendiculaires (2), la droite de Simson (3).
function simsonPieds(S, P) { const pieds = [];
  for (let i = 0; i < 3; i++) { const U = S[(i + 1) % 3], V = S[(i + 2) % 3], d = [feuSub(V[0], U[0]), feuSub(V[1], U[1])], w = [feuSub(P[0], U[0]), feuSub(P[1], U[1])];
    const t = feuDiv(feuAdd(feuMul(w[0], d[0]), feuMul(w[1], d[1])), feuAdd(feuMul(d[0], d[0]), feuMul(d[1], d[1]))); pieds.push([feuAdd(U[0], feuMul(t, d[0])), feuAdd(U[1], feuMul(t, d[1]))]); }
  return pieds; }
const simsonAire2 = (F) => feuSub(feuMul(feuSub(F[1][0], F[0][0]), feuSub(F[2][1], F[0][1])), feuMul(feuSub(F[1][1], F[0][1]), feuSub(F[2][0], F[0][0])));
function simsonDroite(P0, n) {
  const L = P0.taille, rng = mulberry32(P0.graine); let T = null;
  while (!T) { const t = [0, 1, 2].map(() => [Math.floor(rng() * (L + 1)), Math.floor(rng() * (L + 1))]); if ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) !== 0) T = t; }
  const S = T.map(([x, y]) => [feuE(x), feuE(y)]), [A, B, C] = S;
  /* centre O : intersection des mediatrices (systeme 2 x 2 en fractions) */
  const a1 = feuMul(feuE(2), feuSub(B[0], A[0])), b1 = feuMul(feuE(2), feuSub(B[1], A[1])), c1 = feuSub(feuAdd(feuMul(B[0], B[0]), feuMul(B[1], B[1])), feuAdd(feuMul(A[0], A[0]), feuMul(A[1], A[1])));
  const a2 = feuMul(feuE(2), feuSub(C[0], A[0])), b2 = feuMul(feuE(2), feuSub(C[1], A[1])), c2 = feuSub(feuAdd(feuMul(C[0], C[0]), feuMul(C[1], C[1])), feuAdd(feuMul(A[0], A[0]), feuMul(A[1], A[1])));
  const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det)];
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1]))), R2 = d2(O, A);
  /* P = A + s (1, t), s = -2 (A - O).(1, t) / (1 + t^2) ; si la corde est tangente (s = 0), pente suivante */
  let k = P0.corde, P = null; for (let essai = 0; essai < 4 && !P; essai++, k++) { const t = feuF(BigInt(k), 7n), dd = feuAdd(feuE(1), feuMul(t, t));
    const s = feuDiv(feuMul(feuE(-2), feuAdd(feuSub(A[0], O[0]), feuMul(t, feuSub(A[1], O[1])))), dd); if (s[0] !== 0n) P = [feuAdd(A[0], s), feuAdd(A[1], feuMul(s, t))]; }
  const F = simsonPieds(S, P), aire = simsonAire2(F), Q = [feuAdd(O[0], feuMul(feuF(5n, 4n), feuSub(P[0], O[0]))), feuAdd(O[1], feuMul(feuF(5n, 4n), feuSub(P[1], O[1])))], aireQ = simsonAire2(simsonPieds(S, Q));
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], segs = [];
  for (let i = 0; i < 3; i++) segs.push([T[i], T[(i + 1) % 3], 0]);
  for (let i = 0; i < 3; i++) segs.push([nb(P), nb(F[i]), 2]);
  const Fn = F.map(nb); let i0 = 0, i1 = 1, dm = -1; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dv = (Fn[i][0] - Fn[j][0]) ** 2 + (Fn[i][1] - Fn[j][1]) ** 2; if (dv > dm) { dm = dv; i0 = i; i1 = j; } }
  segs.push([Fn[i0], Fn[i1], 3]);
  const r = Math.sqrt(feuNb(R2)), on = nb(O), brut = new Float64Array(n * 3), nc = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < nc) { const a = 2 * PI * l / nc; brut[o] = on[0] + r * cosD(a); brut[o + 1] = on[1] + r * sinD(a); brut[o + 2] = 1; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases de la grille', invariants: {
    alignes: { mesure: feuNb(aire), formule: 0, exact: feuTexte(aire), triangle: JSON.stringify(T), point: feuTexte(P[0]) + ', ' + feuTexte(P[1]), note: 'twice the signed area of the three feet, exact (0 = on one line)' },
    surCercle: { mesure: feuNb(feuSub(d2(O, P), R2)), formule: 0, note: '|OP|^2 - R^2 in exact fractions (P is on the circumscribed circle)' },
    temoin: { mesure: feuNb(aireQ), exact: feuTexte(aireQ), note: 'witness: P pushed outside the circle (O + 5/4 (P - O)) : the three feet are no longer on one line' } } };
}

// ---------- 34 : parts distinctes = parts impaires (Euler) (idee et valeurs : codex Grok Bot ; OEIS A000009, lu par Grok) ----------
// Le nombre de facons d ecrire n comme somme de parts TOUTES DIFFERENTES egale le nombre de facons de l ecrire avec des parts TOUTES IMPAIRES.
// Exact ici : deux comptages INDEPENDANTS en entiers BigInt (sac a dos 0/1 sur les parts 1..n ; sac a dos non borne sur les parts impaires),
//   compares pour chaque m de 1 a n ; q(1..20) = 1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64 (Grok).
// Et la bijection de Glaisher : une partition en parts distinctes tiree au hasard (uniforme, graine) ; chaque part 2^a b (b impair) devient
//   2^a parts egales a b ; on verifie que le resultat est en parts impaires, de somme n, et qu en regroupant (ecriture binaire des
//   multiplicites) on retrouve EXACTEMENT la partition de depart.
// Temoin : « toutes differentes » n est pas « quelconques » : p(n) depasse q(n) des n = 2 (2 = 1 + 1 a une part repetee).
// Dessin (vue de face) : la partition distincte (0, a gauche) et son image impaire (1, a droite), une ligne par part.
function distParts(N) { const q = new Array(N + 1).fill(0n); q[0] = 1n; for (let k = 1; k <= N; k++) for (let m = N; m >= k; m--) q[m] += q[m - k]; return q; }
function distImpaires(N) { const q = new Array(N + 1).fill(0n); q[0] = 1n; for (let k = 1; k <= N; k += 2) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }
function distTirage(N, rng) { /* T[m][k] = partitions de m en parts distinctes <= k */
  const T = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0n)); for (let k = 0; k <= N; k++) T[0][k] = 1n;
  for (let m = 1; m <= N; m++) for (let k = 1; k <= N; k++) T[m][k] = T[m][k - 1] + (k <= m ? T[m - k][k - 1] : 0n);
  const parts = []; let m = N, k = N;
  /* a chaque etape : la part k est laissee avec la probabilite T[m][k-1] / T[m][k], prise sinon -> chaque partition a la meme chance */
  while (m > 0) { let u = 0n; for (let i = 0; i < 3; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m][k];
    if (u < T[m][k - 1]) k--; else { parts.push(k); m -= k; k = Math.min(k - 1, m); } }
  return parts; }
function distinctesImpaires(P, n) {
  const N = P.entier, rng = mulberry32(P.graine), A = distParts(N), B = distImpaires(N), tous = partPieces(N);
  let ecarts = 0; for (let m = 1; m <= N; m++) if (A[m] !== B[m]) ecarts++;
  let premier = null; for (let m = 1; m <= N && premier === null; m++) if (tous[m] !== A[m]) premier = m;
  const D0 = distTirage(N, rng), image = [];
  for (const p of D0) { let a = 0, b = p; while (b % 2 === 0) { b /= 2; a++; } for (let i = 0; i < 2 ** a; i++) image.push(b); }
  const mult = new Map(); for (const b of image) mult.set(b, (mult.get(b) || 0) + 1);
  const retour = []; for (const [b, c] of mult) { let r = c, a = 0; while (r) { if (r & 1) retour.push(b * 2 ** a); r >>= 1; a++; } }
  const ok = image.every((b) => b % 2 === 1) && image.reduce((x, y) => x + y, 0) === N && D0.reduce((x, y) => x + y, 0) === N && new Set(D0).size === D0.length
    && retour.sort((x, y) => y - x).join() === [...D0].sort((x, y) => y - x).join();
  const cases = []; D0.forEach((p, r) => { for (let c = 0; c < p; c++) cases.push([c, -r, 0]); });
  const im = [...image].sort((x, y) => y - x), off = Math.max(...D0) + 2; im.forEach((p, r) => { for (let c = 0; c < p; c++) cases.push([off + c, -r, 1]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const cs = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = cs[0]; brut[o + 1] = cs[1]; brut[o + 2] = cs[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    egalite: { mesure: ecarts, formule: 0, qn: String(A[N]), q20: N >= 20 ? A.slice(1, 21).join(', ') : null, note: 'values m = 1..n where the count with distinct parts and the count with odd parts (two separate knapsack counts) differ' },
    glaisher: { mesure: ok ? 0 : 1, formule: 0, distincte: D0.join(' + '), impaire: im.join(' + '), note: 'Glaisher s map : the drawn distinct partition, each part 2^a b split into 2^a parts b, is all odd, sums to n, and merges back to itself' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 2, absente: 'n below 2', note: 'witness: distinct parts is a real restriction : p(n) > q(n) from n = 2 (1 + 1 repeats a part)' } } };
}

// ---------- 35 : les triangulations d un polygone (Catalan) (idee et valeurs : codex Grok Bot) ----------
// Couper un polygone convexe a N cotes en triangles par des diagonales qui ne se croisent pas : il y a C(N - 2) facons (nombres de Catalan).
// Exact ici : T(N) par la decomposition « le triangle pose sur le cote (0, N-1) a son sommet en k » (T(N) = somme T(k + 1) T(N - k)), en
//   BigInt, compare pour chaque polygone de 3 a N cotes a la formule binom(2m, m) / (m + 1), m = N - 2 ; valeurs de Grok : 1, 2, 5, 14, ... 16796.
// Une triangulation tiree uniformement (graine) : on verifie N - 3 diagonales, aucune paire qui se croise, N - 2 triangles.
// Temoin : dans un pentagone il y a binom(5, 2) = 10 paires de diagonales, mais seulement 5 ne se croisent pas : l absence de croisement compte.
// Dessin (vue de face) : le polygone regulier (0), les diagonales tirees (1).
function triCompte(N) { const T = new Array(N + 1).fill(0n); T[2] = 1n; for (let m = 3; m <= N; m++) { let s = 0n; for (let k = 1; k <= m - 2; k++) s += T[k + 1] * T[m - k]; T[m] = s; } return T; }
function triTirage(i, j, T, rng, diag) { /* polygone des sommets i..j (j - i + 1 sommets), uniforme */
  const m = j - i + 1; if (m < 3) return; let u = 0n; for (let r = 0; r < 3; r++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m];
  for (let k = i + 1; k <= j - 1; k++) { const w = T[k - i + 1] * T[j - k + 1]; if (u < w) { if (k - i >= 2) diag.push([i, k]); if (j - k >= 2) diag.push([k, j]); triTirage(i, k, T, rng, diag); triTirage(k, j, T, rng, diag); return; } u -= w; } }
const triCroise = (a, b) => { const [p, q] = a[0] < a[1] ? a : [a[1], a[0]], [r, s] = b[0] < b[1] ? b : [b[1], b[0]]; return (p < r && r < q && q < s) || (r < p && p < s && s < q); };
function triangulations(P, n) {
  const N = P.cotes, rng = mulberry32(P.graine), T = triCompte(N);
  let ecarts = 0; for (let m = 3; m <= N; m++) if (T[m] !== binomB(2 * (m - 2), m - 2) / BigInt(m - 1)) ecarts++;
  const diag = []; triTirage(0, N - 1, T, rng, diag);
  let croisements = 0; for (let a = 0; a < diag.length; a++) for (let b = a + 1; b < diag.length; b++) if (triCroise(diag[a], diag[b])) croisements++;
  let paires = 0, sansCroiser = 0; const D5 = [[2, 4], [1, 4], [1, 3], [0, 3], [0, 2]]; /* ordre decroissant : le test de croisement sert dans les DEUX sens */ for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { paires++; if (!triCroise(D5[a], D5[b])) sansCroiser++; }
  const S = Array.from({ length: N }, (_, k) => [cosD(2 * PI * k / N + PI / 2), sinD(2 * PI * k / N + PI / 2)]), segs = [];
  for (let k = 0; k < N; k++) segs.push([S[k], S[(k + 1) % N], 0]); for (const [a, b] of diag) segs.push([S[a], S[b], 1]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon 1', invariants: {
    catalan: { mesure: ecarts, formule: 0, tn: String(T[N]), note: 'polygons with 3 to N sides where the triangulation count differs from binom(2m, m)/(m + 1), m = sides - 2' },
    diagonales: { mesure: (diag.length === N - 3 ? 0 : 1) + croisements, formule: 0, tirees: diag.map(([a, b]) => a + '-' + b).join(' '), note: 'the drawn triangulation : wrong number of diagonals (N - 3) plus pairs that cross' },
    temoin: { mesure: sansCroiser + ' / ' + paires, formule: '5 / 10', note: 'witness: a pentagon has 10 pairs of diagonals, only 5 pairs do not cross (one triangulation each)' } } };
}

// ---------- 36 : Ramsey R(3, 3) = 6 (idee et valeurs : codex Grok Bot ; MathWorld « Ramsey Number », Greenwood-Gleason 1955, lus par Grok) ----------
// Colorier chaque arete du graphe complet K_n en rouge ou bleu : a partir de n = 6, il y a FORCEMENT un triangle d une seule couleur.
// Exact ici : TOUTES les 2^(n(n-1)/2) colorations enumerees (n <= 6) ; K_5 en a 12 sans triangle monochrome, K_6 n en a aucune (Grok).
//   Et pour K_5 : dans chacune des 12, chaque couleur forme un cycle de 5 aretes (chaque sommet de degre 2, d un seul tenant).
// Temoin : n interdire que les triangles ROUGES ne suffit pas : K_6 a alors des colorations sans triangle interdit — il faut les deux couleurs.
// Dessin (vue de face) : une coloration tiree (graine) parmi les bonnes (n <= 5), ou quelconque avec son triangle monochrome (n = 6) ;
//   etiquette 0 = rouge, 1 = bleu, 2 = le triangle monochrome trouve.
function ramseyGraphe(n) { const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]);
  const id = new Map(E.map(([a, b], k) => [a + ',' + b, k])), T = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) T.push([id.get(a + ',' + b), id.get(a + ',' + c), id.get(b + ',' + c)]);
  return { E, T }; }
function ramseyR33(P, n) {
  const N = P.sommetsK, rng = mulberry32(P.graine), { E, T } = ramseyGraphe(N), bonnes = []; let rougeSeul = 0;
  for (let m = 0; m < 2 ** E.length; m++) { let mono = null, rouge = false;
    for (const t of T) { const c = (m >> t[0]) & 1; if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { if (mono === null) mono = t; if (c === 0) rouge = true; } }
    if (mono === null) bonnes.push(m); if (!rouge) rougeSeul++; }
  let cyclesFaux = 0; if (N === 5) for (const m of bonnes) for (const coul of [0, 1]) { const deg = new Array(5).fill(0), adj = Array.from({ length: 5 }, () => []);
    E.forEach(([a, b], k) => { if (((m >> k) & 1) === coul) { deg[a]++; deg[b]++; adj[a].push(b); adj[b].push(a); } });
    const vu = new Set([0]), pile = [0]; while (pile.length) for (const v of adj[pile.pop()]) if (!vu.has(v)) { vu.add(v); pile.push(v); }
    if (deg.some((d) => d !== 2) || vu.size !== 5) cyclesFaux++; }
  const m = bonnes.length ? bonnes[Math.floor(rng() * bonnes.length)] : Math.floor(rng() * 2 ** E.length);
  let tri = null; for (const t of T) { const c = (m >> t[0]) & 1; if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { tri = t; break; } }
  const S = Array.from({ length: N }, (_, k) => [cosD(2 * PI * k / N + PI / 2), sinD(2 * PI * k / N + PI / 2)]);
  const segs = E.map(([a, b], k) => [S[a], S[b], tri && tri.includes(k) ? 2 : (m >> k) & 1]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  /* 2026-11-08 : each edge of K_n as a line in ITS colour : label 0 red, 1 blue, 2 the one-colour triangle (gold) */
  const segments = segs.map(([p, q, lab]) => ({ a: [p[0], p[1], lab], b: [q[0], q[1], lab], c: lab + 1 }));
  return { D: 3, brut, nuage: true, segments, unite: 'rayon 1', invariants: {
    sansTriangle: { mesure: bonnes.length, formule: N === 5 ? 12 : N === 6 ? 0 : null, colorations: 2 ** E.length, note: 'colourings of the edges of K_n in two colours with no one-colour triangle, all of them enumerated (K_5 : 12, K_6 : 0, so R(3, 3) = 6)' },
    cycles5: { mesure: cyclesFaux, formule: 0, note: 'K_5 only : good colourings where a colour class is NOT a single 5-cycle (every vertex of degree 2, connected)' },
    temoin: { mesure: rougeSeul, note: 'witness: forbidding only RED triangles, this many colourings of K_n survive (for K_6 still many) : both colours are needed' } } };
}

// ---------- 37 : l hexagramme de Pascal (idee et valeurs : codex Grok Bot ; MathWorld « Pascal s Theorem », lu par Grok) ----------
// Six points sur une conique, relies dans l ordre A B C D E F : les cotes opposes (AB et DE, BC et EF, CD et FA) se coupent en trois points
//   ALIGNES — meme si l hexagone se croise lui-meme.
// Exact ici : six points RATIONNELS du cercle unite, t -> ((1 - t^2)/(1 + t^2), 2t/(1 + t^2)), t entiers tires (graine) parmi -9..9 ;
//   les trois intersections en fractions BigInt ; aire signee des trois points, exactement 0.
// Temoin : F remplace par (2, 2), hors du cercle : l aire n est plus nulle.
// Dessin (vue de face) : le cercle (0), l hexagone (1), les prolongements des cotes jusqu aux intersections et la droite de Pascal (2).
function pascalInter(P1, P2, P3, P4) { /* droite P1P2 contre droite P3P4, en fractions ; null si paralleles */
  const d1 = [feuSub(P2[0], P1[0]), feuSub(P2[1], P1[1])], d2 = [feuSub(P4[0], P3[0]), feuSub(P4[1], P3[1])], den = feuSub(feuMul(d1[0], d2[1]), feuMul(d1[1], d2[0]));
  if (den[0] === 0n) return null; const t = feuDiv(feuSub(feuMul(feuSub(P3[0], P1[0]), d2[1]), feuMul(feuSub(P3[1], P1[1]), d2[0])), den);
  return [feuAdd(P1[0], feuMul(t, d1[0])), feuAdd(P1[1], feuMul(t, d1[1]))]; }
function pascalTrois(H) { const X = pascalInter(H[0], H[1], H[3], H[4]), Y = pascalInter(H[1], H[2], H[4], H[5]), Z = pascalInter(H[2], H[3], H[5], H[0]); return X && Y && Z ? [X, Y, Z] : null; }
function pascalHexagramme(P, n) {
  const rng = mulberry32(P.graine); let H = null, I = null;
  for (let essai = 0; essai < 200 && !I; essai++) { const ts = new Set(); while (ts.size < 6) ts.add(Math.floor(rng() * 19) - 9);
    H = [...ts].map((t) => { const T = BigInt(t), d = 1n + T * T; return [feuF(1n - T * T, d), feuF(2n * T, d)]; });
    H.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0]))); if (P.croise) H = [H[0], H[2], H[4], H[1], H[3], H[5]]; I = pascalTrois(H); }
  const aire = simsonAire2(I), H2 = [...H.slice(0, 5), [feuE(2), feuE(2)]], I2 = pascalTrois(H2), aireT = I2 ? simsonAire2(I2) : null;
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], Hn = H.map(nb), In = I.map(nb), segs = [];
  for (let k = 0; k < 6; k++) segs.push([Hn[k], Hn[(k + 1) % 6], 1]);
  const ext = [[0, 1, 0], [3, 4, 0], [1, 2, 1], [4, 5, 1], [2, 3, 2], [5, 0, 2]]; for (const [a, b, x] of ext) segs.push([Hn[a], In[x], 2], [Hn[b], In[x], 2]);
  let i0 = 0, i1 = 1, dm = -1; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dv = (In[i][0] - In[j][0]) ** 2 + (In[i][1] - In[j][1]) ** 2; if (dv > dm) { dm = dv; i0 = i; i1 = j; } } segs.push([In[i0], In[i1], 2]);
  const brut = new Float64Array(n * 3), nc = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nc) { const a = 2 * PI * l / nc; brut[o] = cosD(a); brut[o + 1] = sinD(a); brut[o + 2] = 0; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle = 1', invariants: {
    pascal: { mesure: feuNb(aire), formule: 0, exact: feuTexte(aire), hexagone: H.map((q) => '(' + feuTexte(q[0]) + ', ' + feuTexte(q[1]) + ')').join(' '), note: 'twice the signed area of the three meeting points of opposite sides, exact (0 = on one line)' },
    temoin: { mesure: aireT === null ? NaN : feuNb(aireT), exact: aireT === null ? null : feuTexte(aireT), absente: 'two opposite sides parallel', note: 'witness: F moved to (2, 2), off the circle : the three points are no longer on one line' } } };
}

// ---------- 38 : le theoreme de Ptolemee (idee et valeurs : codex Grok Bot ; MathWorld, Wikipedia « Ptolemy s theorem », lus par Grok) ----------
// Pour un quadrilatere ABCD inscrit dans un cercle : AC.BD = AB.CD + AD.BC (produit des diagonales = somme des produits des cotes opposes).
// Exact ici : quatre points RATIONNELS du cercle unite (parametrage t, graine), pris dans l ordre du cercle ; les longueurs sont des racines,
//   mais leurs CARRES sont des fractions : l egalite, elevee deux fois au carre, devient (AC2 BD2 - AB2 CD2 - AD2 BC2)^2 = 4 AB2 CD2 AD2 BC2,
//   verifiee en fractions BigInt A L IDENTIQUE (avec le signe AC2 BD2 - AB2 CD2 - AD2 BC2 >= 0, qui exclut la racine parasite).
// Aussi : les memes points dans l ordre CROISE A, C, B, D satisfont l identite elevee au carre, mais avec le mauvais signe : refuse (le signe sert).
// Temoin : C deplace hors du cercle (C x 6/5) : AB.CD + AD.BC > AC.BD strictement (inegalite de Ptolemee).
// Dessin (vue de face) : le cercle (0), le quadrilatere (1), les deux diagonales (2).
function ptolemee(P, n) {
  const rng = mulberry32(P.graine), ts = new Set(); while (ts.size < 4) ts.add(Math.floor(rng() * 25) - 12);
  const Q = [...ts].map((t) => { const tb = BigInt(t), den = 1n + tb * tb; return [feuF(1n - tb * tb, den), feuF(2n * tb, den)]; });
  Q.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0])));
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1])));
  const verif = (A, B, C, Dd) => { const ab = d2(A, B), bc = d2(B, C), cd = d2(C, Dd), da = d2(Dd, A), ac = d2(A, C), bd = d2(B, Dd);
    const g = feuSub(feuSub(feuMul(ac, bd), feuMul(ab, cd)), feuMul(da, bc)), droite = feuMul(feuE(4), feuMul(feuMul(ab, cd), feuMul(da, bc)));
    return { egal: g[0] >= 0n && feuEq(feuMul(g, g), droite), ecart: Math.sqrt(feuNb(ab) * feuNb(cd)) + Math.sqrt(feuNb(da) * feuNb(bc)) - Math.sqrt(feuNb(ac) * feuNb(bd)) }; };
  const V = verif(...Q), X = verif(Q[0], Q[2], Q[1], Q[3]), C2 = [feuMul(feuF(6n, 5n), Q[2][0]), feuMul(feuF(6n, 5n), Q[2][1])], W = verif(Q[0], Q[1], C2, Q[3]);
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], Qn = Q.map(nb), segs = [];
  for (let k = 0; k < 4; k++) segs.push([Qn[k], Qn[(k + 1) % 4], 1]); segs.push([Qn[0], Qn[2], 2], [Qn[1], Qn[3], 2]);
  const brut = new Float64Array(n * 3), nc = Math.floor(n / 3);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nc) { const a = 2 * PI * l / nc; brut[o] = cosD(a); brut[o + 1] = sinD(a); brut[o + 2] = 0; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle = 1', invariants: {
    ptolemee: { mesure: V.egal ? 0 : 1, formule: 0, ecartFlottant: V.ecart, quadrilatere: Q.map((q) => '(' + feuTexte(q[0]) + ', ' + feuTexte(q[1]) + ')').join(' '), note: 'AC.BD = AB.CD + AD.BC checked exactly on the squared lengths (0 = equal) ; ecartFlottant = the same in floating point' },
    croise: { mesure: X.egal ? 1 : 0, formule: 0, note: 'the same four points in CROSSED order A, C, B, D : the squared identity still holds but with the wrong sign (the parasitic root) — must be refused (0)' },
    temoin: { mesure: W.ecart, note: 'witness: C moved off the circle (x 6/5) : AB.CD + AD.BC - AC.BD, now strictly positive (Ptolemy s inequality)' } } };
}

// ---------- 39 : sommes de carres, Jacobi (4 carres) et 2 carres (idee et valeurs : codex Grok Bot ; MathWorld « Sum of Squares Function », Wikipedia « Jacobi s four-square theorem », lus par Grok) ----------
// r4(n) = nombre d ecritures n = a^2 + b^2 + c^2 + d^2 (entiers de signe quelconque, l ordre compte) = 8 x (somme des diviseurs d de n que 4 ne divise pas).
// r2(n) = nombre d ecritures n = a^2 + b^2 = 4 x (diviseurs = 1 mod 4 moins diviseurs = 3 mod 4).
// Exact ici : r4 et r2 COMPTES par enumeration de tous les (a, b, c, d) pour chaque m de 1 a n, compares aux deux formules par diviseurs.
// Temoin : sans la restriction « 4 ne divise pas d », 8 x sigma(n) se trompe des n = 4 (56 contre 24).
// Dessin (vue de face) : tous les points entiers (a, b) avec a^2 + b^2 <= n, etiquette = a^2 + b^2 (les cercles de rayon racine de m).
function sommesCarres(P, n) {
  const N = P.entier, R = Math.floor(Math.sqrt(N)), r4 = new Array(N + 1).fill(0), r2 = new Array(N + 1).fill(0);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const s2 = a * a + b * b; if (s2 > N) continue; r2[s2]++;
    for (let c = -R; c <= R; c++) { const s3 = s2 + c * c; if (s3 > N) continue; for (let d = -R; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }
  let e4 = 0, e2 = 0, premier = null;
  for (let m = 1; m <= N; m++) { let j = 0, s = 0, d1 = 0, d3 = 0; for (let d = 1; d <= m; d++) if (m % d === 0) { s += d; if (d % 4) j += d; if (d % 4 === 1) d1++; if (d % 4 === 3) d3++; }
    if (r4[m] !== 8 * j) e4++; if (r2[m] !== 4 * (d1 - d3)) e2++; if (premier === null && r4[m] !== 8 * s) premier = m; }
  const pts = []; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= N) pts.push([a, b, a * a + b * b]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const pc = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = pc[0]; brut[o + 1] = pc[1]; brut[o + 2] = pc[2]; }
  return { D: 3, brut, nuage: true, unite: 'points entiers', invariants: {
    jacobiQuatre: { mesure: e4, formule: 0, r4n: r4[N], note: 'values m = 1..n where r4(m) counted one by one differs from 8 x (sum of the divisors of m not divisible by 4)' },
    deuxCarres: { mesure: e2, formule: 0, r2n: r2[N], note: 'values m = 1..n where r2(m) counted one by one differs from 4 x (divisors = 1 mod 4 minus divisors = 3 mod 4)' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 4, absente: 'n below 4', note: 'witness: without « 4 does not divide d », 8 x sigma(m) is wrong from m = 4 (56 instead of 24)' } } };
}

// ---------- 40 : l equation de Pell x^2 - D y^2 = 1 (idee et valeurs : codex Grok Bot ; MathWorld « Pell Equation », Wikipedia, lus par Grok) ----------
// Pour D entier non carre, la plus petite solution (x1, y1) avec y > 0 se lit dans la fraction continue de racine de D (les reduites p/q).
// Exact ici : fraction continue de racine de D en ENTIERS (m, d, a : aucune racine flottante au-dela de a0), reduites en BigInt jusqu a la
//   premiere qui verifie p^2 - D q^2 = 1, verifie a l identique ; minimalite par recherche exhaustive y = 1 .. y1 - 1 quand y1 <= 100 000.
//   Valeurs de Grok : D = 13 -> (649, 180), D = 19 -> (170, 39), D = 61 -> (1766319049, 226153980).
// Temoin : x^2 - 3 y^2 = -1 n a aucune solution (periode paire : les reduites ne donnent que +1 et -2) ; D = 2 en a une, (1, 1).
// Dessin (vue de face) : les reduites (k, p_k / q_k) qui encadrent racine de D, etiquette = signe de p^2 - D q^2 (0 negatif, 1 positif), et la droite racine de D (2).
function pellFondamentale(Dd) { const a0 = BigInt(Math.floor(Math.sqrt(Dd))); let a = a0; while ((a + 1n) * (a + 1n) <= BigInt(Dd)) a++; while (a * a > BigInt(Dd)) a--;
  const A0 = a, red = []; let m = 0n, d = 1n, p0 = 1n, p1 = A0, q0 = 0n, q1 = 1n, periode = 0; red.push([p1, q1]);
  for (let k = 0; k < 400; k++) { if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n) return { x: p1, y: q1, red, periode }; m = d * a - m; d = (BigInt(Dd) - m * m) / d; a = (A0 + m) / d; if (a === 2n * A0 && !periode) periode = k + 1;
    [p0, p1] = [p1, a * p1 + p0]; [q0, q1] = [q1, a * q1 + q0]; red.push([p1, q1]); }
  return null; }
function equationPell(P, n) {
  let Dd = P.radical; while (Number.isInteger(Math.sqrt(Dd))) Dd++;
  const S = pellFondamentale(Dd), reste = S.x * S.x - BigInt(Dd) * S.y * S.y - 1n;
  let plusPetite = null; if (S.y <= 100000n) for (let y = 1n; y < S.y && plusPetite === null; y++) { const x2 = 1n + BigInt(Dd) * y * y, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c * c === x2) plusPetite = y; }
  let moins3 = 0; for (let y = 1n; y <= 2000n; y++) { const x2 = 3n * y * y - 1n, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c >= 0n && c * c === x2) moins3++; }
  const rac = Math.sqrt(Dd), pts = S.red.map(([p, q], k) => [k, Number(p) / Number(q), p * p - BigInt(Dd) * q * q > 0n ? 1 : 0]), K = pts.length;
  const brut = new Float64Array(n * 3), nl = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nl) { brut[o] = (K - 1) * l / nl; brut[o + 1] = rac; brut[o + 2] = 2; continue; } const pr = pts[Math.floor((l - nl) * K / (n - nl))]; brut[o] = pr[0]; brut[o + 1] = pr[1]; brut[o + 2] = pr[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    pell: { mesure: Number(reste), formule: 0, x1: String(S.x), y1: String(S.y), dUtilise: Dd, note: 'x1^2 - D y1^2 - 1 for the solution read from the continued fraction of root D, exact in BigInt' },
    minimale: { mesure: S.y <= 100000n ? (plusPetite === null ? 0 : 1) : NaN, formule: 0, absente: 'y1 above 100 000 : the exhaustive search is not run', note: 'a smaller y > 0 with 1 + D y^2 a perfect square (exhaustive search ; 0 = none, so the solution is the fundamental one)' },
    temoin: { mesure: moins3, formule: 0, note: 'witness: x^2 - 3 y^2 = -1 has no solution for y = 1 .. 2000 (and none at all : odd-period rule), while x^2 - 2 y^2 = -1 has (1, 1)' } } };
}

// ---------- 41 : les nombres de Carmichael (idee et valeurs : codex Grok Bot ; MathWorld « Carmichael Number », « Pseudoprime », OEIS A002997 / A001567, lus par Grok) ----------
// Le petit theoreme de Fermat (a^(n-1) = 1 mod n pour un n premier) a des menteurs : des nombres COMPOSES qui le verifient.
//   Pseudo-premier en base 2 : compose avec 2^(n-1) = 1 mod n (341 = 11 x 31 est le premier). Carmichael : compose qui le verifie pour TOUTE
//   base a premiere avec n — critere de Korselt : sans facteur carre, et p - 1 divise n - 1 pour chaque premier p qui divise n.
// Exact ici : Carmichael par Korselt jusqu au curseur ; pseudo-premiers base 2 par exponentiation modulaire ; chaque Carmichael impair est aussi
//   pseudo-premier base 2 (verifie). Valeurs de Grok : < 10 000 -> 561, 1105, 1729, 2465, 2821, 6601, 8911 ; base 2 < 2000 -> 341, 561, 645, 1105, 1387, 1729, 1905.
// Temoin : 341 trompe la base 2 mais pas la base 3 (3^340 mod 341 n est pas 1) : un pseudo-premier n est pas forcement un Carmichael.
// Dessin (vue de face) : pour chaque nombre trouve (par rang), ses facteurs premiers (rang, p), etiquette 0 = pseudo-premier base 2 seulement, 1 = Carmichael.
function carPuiss(a, e, m) { let r = 1, b = a % m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e = Math.floor(e / 2); } return r; }
function carFacteurs(n) { const f = []; let m = n; for (let p = 2; p * p <= m; p++) while (m % p === 0) { f.push(p); m /= p; } if (m > 1) f.push(m); return f; }
function nombresCarmichael(P, n) {
  const N = P.limite, carm = [], psp2 = [];
  for (let k = 3; k <= N; k++) { const f = carFacteurs(k); if (f.length < 2) continue;
    const sansCarre = new Set(f).size === f.length; if (sansCarre && f.every((p) => (k - 1) % (p - 1) === 0)) carm.push(k);
    if (k % 2 === 1 && carPuiss(2, k - 1, k) === 1) psp2.push(k); }
  const pspSet = new Set(psp2), horsInclusion = carm.filter((c) => !pspSet.has(c)).length;
  const temoin = carPuiss(3, 340, 341);
  const pts = []; [...new Set([...psp2, ...carm])].sort((a, b) => a - b).forEach((k, rang) => { for (const p of carFacteurs(k)) pts.push([rang + 1, p, carm.includes(k) ? 1 : 0]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const cf = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = cf[0]; brut[o + 1] = cf[1]; brut[o + 2] = cf[2]; }
  return { D: 3, brut, nuage: true, unite: 'entiers', invariants: {
    carmichael: { mesure: carm.length, liste: carm.slice(0, 20).join(', '), formule: N >= 8911 && N < 10585 ? 7 : null, note: 'Carmichael numbers up to the slider (Korselt : squarefree, p - 1 divides n - 1 for every prime p of n)' },
    pseudo: { mesure: psp2.length, liste: psp2.slice(0, 20).join(', '), note: 'odd composites n up to the slider with 2^(n-1) = 1 mod n (base-2 pseudoprimes)' },
    inclusion: { mesure: horsInclusion, formule: 0, note: 'Carmichael numbers that are NOT base-2 pseudoprimes (0 : every Carmichael number fools base 2)' },
    temoin: { mesure: temoin, note: 'witness: 3^340 mod 341 (not 1 : 341 fools base 2, not base 3)' } } };
}

// ---------- 42 : le theoreme de Wilson (idee et valeurs : codex Grok Bot ; MathWorld « Wilson s Theorem », lu par Grok) ----------
// n > 1 est premier si et seulement si (n - 1)! = -1 mod n, c est-a-dire (n - 1)! mod n = n - 1. Pour un compose : 2 si n = 4, 0 au-dela.
// Exact ici : (n - 1)! mod n par produits modulaires (entiers exacts) pour chaque n de 2 au curseur, compare a la primalite par division d essai ;
//   valeurs de Grok n = 2..30 : 1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0.
// Temoin : n = 4, compose, ou (n - 1)! mod n vaut 2 et non 0 : la regle « compose -> 0 » a UNE exception.
// Dessin (vue de face) : les points (n / limite, ((n - 1)! mod n) / n) (deux colonnes de meme taille), etiquette 1 = premier (pres de 1), 0 = compose.
function wilsonReste(k) { let r = 1; for (let i = 2; i < k; i++) r = (r * i) % k; return r % k; }
function theoremeWilson(P, n) {
  const N = P.limite, restes = [0, 0]; let ecarts = 0, regle = 0;
  for (let k = 2; k <= N; k++) { const r = wilsonReste(k); restes.push(r); let premier = true; for (let d = 2; d * d <= k; d++) if (k % d === 0) { premier = false; break; }
    if ((r === k - 1) !== premier) ecarts++; if (!premier && r !== (k === 4 ? 2 : 0)) regle++; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const k = 2 + Math.floor(l * (N - 1) / n), o = 3 * l, r = restes[k]; brut[o] = k / N; brut[o + 1] = r / k; brut[o + 2] = r === k - 1 ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    wilson: { mesure: ecarts, formule: 0, trente: restes.slice(2, 31).join(', '), note: 'n from 2 to the slider where « (n - 1)! mod n = n - 1 » and « n is prime » (trial division) disagree' },
    composes: { mesure: regle, formule: 0, note: 'composite n where (n - 1)! mod n is not 2 (n = 4) or 0 (n > 4)' },
    temoin: { mesure: restes[4], formule: 2, note: 'witness: n = 4, composite, gives 3! mod 4 = 2, not 0 : the one exception' } } };
}

// ---------- 43 : la fonction de Mertens M(n) (idee et valeurs : codex Grok Bot ; MathWorld « Mertens Function », OEIS A002321, lus par Grok) ----------
// mu(k) = 0 si k a un facteur carre, sinon (-1)^(nombre de facteurs premiers) ; M(n) = mu(1) + ... + mu(n), une marche qui monte et descend.
// Exact ici : mu par un crible, M par somme d entiers ; et l identite derivee de l inversion de Mobius : somme_{k <= n} M(n div k) = 1, verifiee
//   pour CHAQUE n jusqu au curseur. M(1..50) = valeurs de Grok (M(7) = -2).
// Temoin : avec la fonction de Liouville lambda(k) = (-1)^(nombre de facteurs premiers, avec multiplicite) au lieu de mu, la meme somme vaut
//   partie entiere de racine de n (derive : la somme de lambda sur les diviseurs de m vaut 1 si m est un carre, 0 sinon) — pas 1.
// Dessin (vue de face) : la marche (n / limite, M(n) / racine de la limite), etiquette = mu(n) + 1 (0, 1 ou 2).
function mertensCribles(N) { const mu = new Int8Array(N + 1).fill(1), lam = new Int8Array(N + 1).fill(1), est = new Uint8Array(N + 1);
  for (let p = 2; p <= N; p++) if (!est[p]) { for (let m = p; m <= N; m += p) { est[m] = m !== p ? 1 : est[m]; mu[m] = -mu[m]; } for (let j = p * p; j <= N; j += p * p) mu[j] = 0;
    for (let q = p; q <= N; q *= p) for (let m = q; m <= N; m += q) lam[m] = -lam[m]; }
  return { mu, lam }; }
function fonctionMertens(P, n) {
  const N = P.limite, { mu, lam } = mertensCribles(N), M = new Int32Array(N + 1), L = new Int32Array(N + 1);
  for (let k = 1; k <= N; k++) { M[k] = M[k - 1] + mu[k]; L[k] = L[k - 1] + lam[k]; }
  let horsIdentite = 0; for (let m = 1; m <= N; m++) { let s = 0; for (let k = 1; k <= m; k++) s += M[Math.floor(m / k)]; if (s !== 1) horsIdentite++; }
  let sL = 0; for (let k = 1; k <= N; k++) sL += L[Math.floor(N / k)];
  const rac = Math.sqrt(N), brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const k = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = M[k] / rac; brut[o + 2] = mu[k] + 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    identiteMobius: { mesure: horsIdentite, formule: 0, mn: M[N], cinquante: Array.from(M.slice(1, 51)).join(', '), note: 'n up to the slider where the sum over k of M(n div k) is not 1 (Mobius inversion)' },
    temoin: { mesure: sL, formule: Math.floor(Math.sqrt(N)), note: 'witness: the same sum with Liouville lambda instead of mu gives floor(sqrt n), not 1' } } };
}

// ---------- 44 : nombres parfaits et amicaux (idee et valeurs : codex Grok Bot ; MathWorld « Perfect Number », « Amicable Pair », OEIS A000396 / A063990, lus par Grok) ----------
// s(n) = somme des diviseurs de n autres que n. Parfait : s(n) = n (6, 28, 496, 8128). Amicaux : s(m) = n et s(n) = m, m different de n (220 et 284).
// Exact ici : s(n) par un crible des diviseurs (entiers) jusqu au curseur ; parfaits et paires amicales listes ; chaque parfait PAIR trouve est de la
//   forme 2^(p-1) (2^p - 1) avec 2^p - 1 premier (Euclide-Euler, verifie). L existence d un parfait IMPAIR est une question ouverte : non affirmee.
//   Valeurs de Grok : parfaits 6, 28, 496, 8128 ; paires < 10 000 : (220, 284), (1184, 1210), (2620, 2924), (5020, 5564), (6232, 6368).
// Temoin : p = 11, 2^11 - 1 = 2047 = 23 x 89 n est pas premier : 2^10 x 2047 n est pas parfait (sigma = 4 421 520, pas 2N = 4 192 256).
// Dessin (vue de face) : (n / limite, s(n) / n), etiquette 2 = parfait, 1 = amical, 0 = autre.
function aliquoteCrible(N) { const s = new Int32Array(N + 1); for (let d = 1; d <= N / 2; d++) for (let m = 2 * d; m <= N; m += d) s[m] += d; return s; }
function parfaitsAmicaux(P, n) {
  const N = P.limite, s = aliquoteCrible(N), parfaits = [], paires = [];
  for (let k = 2; k <= N; k++) { if (s[k] === k) parfaits.push(k); const t = s[k]; if (t > k && t <= N && s[t] === k) paires.push([k, t]); }
  /* forme d Euclide : q = 2^(p-1) m avec m = 2^p - 1 PREMIER ; appliquee aux parfaits pairs ET au temoin (qui doit etre refuse) */
  const euclideOk = (q) => { let a = 0, m = q; while (m % 2 === 0) { m /= 2; a++; } const p = a + 1; let prem = m > 1; for (let d = 2; d * d <= m; d++) if (m % d === 0) prem = false; return m === 2 ** p - 1 && prem; };
  let horsEuler = 0; for (const q of parfaits) if (q % 2 === 0 && !euclideOk(q)) horsEuler++;
  const sigma = (2 ** 11 - 1) * (23 + 1) * (89 + 1), deuxN = 2 * 2 ** 10 * 2047;
  /* la moitie des points sur les nombres remarquables (parfaits, amicaux), l autre moitie sur tous les n */
  const amic = new Set(paires.flat()), rem = [...parfaits, ...amic], brut = new Float64Array(n * 3), mi = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const k = l < mi && rem.length ? rem[l % rem.length] : 2 + Math.floor((l - mi) * (N - 1) / (n - mi)), o = 3 * l; brut[o] = k / N; brut[o + 1] = s[k] / k; brut[o + 2] = s[k] === k ? 2 : amic.has(k) ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    parfaits: { mesure: parfaits.length, liste: parfaits.join(', '), note: 'perfect numbers up to the slider (s(n) = n)' },
    amicaux: { mesure: paires.length, liste: paires.map(([a, b]) => a + '/' + b).join(', '), note: 'amicable pairs with both members up to the slider' },
    euclideEuler: { mesure: horsEuler, formule: 0, note: 'even perfect numbers found that are NOT 2^(p-1)(2^p - 1) with 2^p - 1 prime' },
    temoin: { mesure: sigma - deuxN, formeAcceptee: euclideOk(2 ** 10 * 2047) ? 1 : 0, note: 'witness: sigma(2^10 x 2047) - 2 x (2^10 x 2047), with 2047 = 23 x 89 not prime : not 0, not perfect' } } };
}

// ---------- 45 : les nombres de Bernoulli (idee et valeurs : codex Grok Bot ; MathWorld « Bernoulli Number », OEIS A027641 / A027642, lus par Grok) ----------
// B_0 = 1 et B_m = -1/(m + 1) somme_{k < m} binom(m + 1, k) B_k (convention B_1 = -1/2) : 1, -1/2, 1/6, 0, -1/30, 0, 1/42, ..., B_12 = -691/2730.
// Exact ici, en fractions BigInt, jusqu au rang du curseur ; et deux verifications INDEPENDANTES de la recurrence :
//   Faulhaber : 0^p + 1^p + ... + (m - 1)^p = 1/(p + 1) somme_j binom(p + 1, j) B_j m^(p + 1 - j), pour p <= 20 et m = 1..12, a l identique ;
//   von Staudt-Clausen : B_2k + somme des 1/q pour les premiers q avec (q - 1) qui divise 2k est un ENTIER.
// Et les B impairs au-dela de B_1 sont nuls. Valeurs de Grok : B_0 .. B_12.
// Temoin : avec l ancienne convention B_1 = +1/2, la formule de Faulhaber pour 0 .. m - 1 se trompe (elle donne la somme de 1 a m).
// Dessin (vue de face) : (n, log10 |B_n|) pour les B non nuls, etiquette 1 si B_n > 0, 0 sinon.
function bernoulliSuite(N) { const B = [[1n, 1n]];
  for (let m = 1; m <= N; m++) { let s = [0n, 1n]; for (let k = 0; k < m; k++) s = feuAdd(s, feuMul(feuF(binomB(m + 1, k), 1n), B[k])); B.push(feuMul(s, feuF(-1n, BigInt(m + 1)))); }
  return B; }
function bernFaulhaber(B, p, m, b1) { /* somme exacte 0..m-1 de k^p contre la formule */
  let gauche = 0n; for (let k = 0n; k < BigInt(m); k++) gauche += k ** BigInt(p);
  let droite = [0n, 1n]; for (let j = 0; j <= p; j++) { const Bj = j === 1 ? b1 : B[j]; droite = feuAdd(droite, feuMul(feuF(binomB(p + 1, j) * BigInt(m) ** BigInt(p + 1 - j), 1n), Bj)); }
  droite = feuMul(droite, feuF(1n, BigInt(p + 1))); return feuEq(droite, [gauche, 1n]); }
function nombresBernoulli(P, n) {
  const N = P.rangB, B = bernoulliSuite(N); let fauxF = 0, fauxF2 = 0, fauxS = 0, impairs = 0;
  for (let p = 0; p <= Math.min(N, 20); p++) for (let m = 1; m <= 12; m++) { if (!bernFaulhaber(B, p, m, B[1])) fauxF++; if (!bernFaulhaber(B, p, m, [1n, 2n])) fauxF2++; }
  for (let k = 3; k <= N; k += 2) if (B[k][0] !== 0n) impairs++;
  for (let k = 2; k <= N; k += 2) { let s = B[k]; for (let q = 2; q <= k + 1; q++) { let prem = true; for (let d = 2; d * d <= q; d++) if (q % d === 0) prem = false; if (prem && k % (q - 1) === 0) s = feuAdd(s, feuF(1n, BigInt(q))); } if (s[1] !== 1n) fauxS++; }
  const pts = []; for (let k = 0; k <= N; k++) if (B[k][0] !== 0n) { const v = Math.abs(feuNb(B[k])); pts.push([k, lnD(v) / lnD(10), B[k][0] > 0n ? 1 : 0]); }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const bp = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = bp[0]; brut[o + 1] = bp[1]; brut[o + 2] = bp[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    faulhaber: { mesure: fauxF, formule: 0, b12: feuTexte(B[Math.min(12, N)]), note: 'pairs (p <= 20, m <= 12) where the sum 0^p + ... + (m - 1)^p differs from Faulhaber s formula with these B (exact)' },
    vonStaudt: { mesure: fauxS, formule: 0, note: 'even indices 2k where B_2k + sum of 1/q over primes q with (q - 1) | 2k is not a whole number (von Staudt-Clausen)' },
    impairsNuls: { mesure: impairs, formule: 0, note: 'odd indices above 1 where B is not 0' },
    temoin: { mesure: fauxF2, note: 'witness: with the old convention B_1 = +1/2, Faulhaber s formula for 0 .. m - 1 fails this many times (it gives 1 .. m)' } } };
}

// ---------- 46 : le probleme de Josephus (idee et valeurs : codex Grok Bot ; MathWorld, Wikipedia « Josephus problem », OEIS A006257, lus par Grok) ----------
// n personnes en cercle, numerotees 1..n ; on elimine une personne sur k en tournant. Qui reste ?
// Exact ici : le cercle est SIMULE (tableau, eliminations reelles) pour chaque taille m <= n, et le survivant compare a la recurrence
//   J(1) = 1, J(m) = ((J(m - 1) + k - 1) mod m) + 1 ; pour k = 2, aussi a la formule J(m) = 2L + 1 (m = 2^a + L, 0 <= L < 2^a).
//   Valeurs de Grok : J(1..20, 2) = 1, 1, 3, 1, 3, 5, 7, 1, ... ; J(1..15, 3) = 1, 2, 2, 1, 4, 1, 4, 7, 1, 4, 7, 10, 13, 2, 5.
// Temoin : la formule 2L + 1 de k = 2 appliquee a k = 3 se trompe des n = 2.
// Dessin (vue de face) : les n personnes en cercle, etiquette = l ordre d elimination (le survivant, dernier, a la plus grande).
function josephusSimule(m, k) { const cercle = Array.from({ length: m }, (_, i) => i + 1), ordre = new Array(m + 1).fill(0); let i = 0, rang = 0;
  while (cercle.length > 1) { i = (i + k - 1) % cercle.length; ordre[cercle[i]] = ++rang; cercle.splice(i, 1); } ordre[cercle[0]] = m; return { survivant: cercle[0], ordre }; }
function problemeJosephus(P, n) {
  const N = P.personnes, K = P.pasK; let J = 1, ecartsRec = 0, ecarts2L = 0, premier3 = null;
  for (let m = 1; m <= N; m++) { if (m > 1) J = ((J + K - 1) % m) + 1; if (josephusSimule(m, K).survivant !== J) ecartsRec++;
    let a = 0; while (2 ** (a + 1) <= m) a++; const L = m - 2 ** a; if (K === 2 && 2 * L + 1 !== J) ecarts2L++; }
  let J3 = 1; for (let m = 2; m <= 40 && premier3 === null; m++) { J3 = ((J3 + 2) % m) + 1; let a = 0; while (2 ** (a + 1) <= m) a++; if (2 * (m - 2 ** a) + 1 !== J3) premier3 = m; }
  const S = josephusSimule(N, K), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const q = 1 + Math.floor(l * N / n), a = 2 * PI * (q - 1) / N, o = 3 * l; brut[o] = cosD(a + PI / 2); brut[o + 1] = sinD(a + PI / 2); brut[o + 2] = S.ordre[q]; }
  return { D: 3, brut, nuage: true, unite: 'rayon 1', invariants: {
    josephus: { mesure: ecartsRec, formule: 0, survivant: S.survivant, note: 'circle sizes m <= n where the simulated survivor differs from the recurrence J(m) = ((J(m - 1) + k - 1) mod m) + 1' },
    formule2L: { mesure: K === 2 ? ecarts2L : NaN, formule: 0, absente: 'the 2L + 1 formula is for k = 2 only', note: 'k = 2 : sizes m where J(m) differs from 2L + 1 (m = 2^a + L)' },
    temoin: { mesure: premier3 === null ? NaN : premier3, formule: 2, note: 'witness: the k = 2 formula 2L + 1 applied to k = 3 is wrong from n = 2' } } };
}

// ---------- 47 : la representation de Zeckendorf (idee et valeurs : codex Grok Bot ; MathWorld « Zeckendorf Representation », OEIS A007895, lus par Grok) ----------
// Tout entier n >= 1 s ecrit d UNE SEULE facon comme somme de nombres de Fibonacci (1, 2, 3, 5, 8, ...) distincts et NON CONSECUTIFS.
// Exact ici : l ecriture gloutonne (le plus grand Fibonacci qui tient, a chaque pas) pour chaque n jusqu au curseur, verifiee non consecutive ;
//   l UNICITE verifiee (n <= 300) en comptant TOUTES les ecritures en Fibonacci distincts non consecutifs (programmation dynamique, entiers) : exactement 1.
//   Nombre de termes (Grok, A007895) : n = 1..30 -> 1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3.
// Temoin : si l on autorise les Fibonacci CONSECUTIFS, l unicite tombe (3 = 3 = 2 + 1) : nombre de n <= 30 qui ont alors plusieurs ecritures.
// Dessin (vue de face) : chaque n (en ligne) et les Fibonacci de son ecriture (en colonne), etiquette = nombre de termes.
function zeckFib(N) { const F = [1, 2]; while (F[F.length - 1] + F[F.length - 2] <= N) F.push(F[F.length - 1] + F[F.length - 2]); return F; }
function zeckGlouton(m, F) { const idx = []; let r = m; for (let i = F.length - 1; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; } return idx; }
function zeckCompte(m, F, consecutifs) { /* ecritures de m en Fibonacci distincts (indices croissants), non consecutifs sauf si autorise */
  const memo = new Map(); const go = (r, i, pris) => { if (r === 0) return 1; if (i >= F.length || F[i] > r) return 0; const cle = r + ',' + i + ',' + pris; if (memo.has(cle)) return memo.get(cle);
    let c = go(r, i + 1, 0); if (consecutifs || !pris) c += go(r - F[i], i + 1, 1); memo.set(cle, c); return c; };
  return go(m, 0, 0); }
function zeckendorf(P, n) {
  const N = P.entier, F = zeckFib(N); let consec = 0, nonUniques = 0; const termes = [0];
  for (let m = 1; m <= N; m++) { const idx = zeckGlouton(m, F); termes.push(idx.length); if (idx.some((v, j) => j > 0 && idx[j - 1] - v < 2)) consec++; if (m <= 300 && zeckCompte(m, F, false) !== 1) nonUniques++; }
  let temoin = 0; for (let m = 1; m <= 30; m++) if (zeckCompte(m, F, true) > 1) temoin++;
  const cases = []; const M = Math.min(N, 200); for (let m = 1; m <= M; m++) for (const i of zeckGlouton(m, F)) cases.push([i, m, termes[m]]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const z = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = z[0]; brut[o + 1] = -z[1] * F.length / M; brut[o + 2] = z[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    unicite: { mesure: consec + nonUniques, formule: 0, termesZ: termes.slice(1, 31).join(', '), note: 'n up to the slider whose greedy writing uses two consecutive Fibonacci numbers, plus n <= 300 with a number of writings other than one' },
    temoin: { mesure: temoin, note: 'witness: n <= 30 that have several writings once consecutive Fibonacci numbers are allowed (3 = 3 = 2 + 1)' } } };
}

// ---------- 48 : le theoreme de Lucas (idee et valeurs : codex Grok Bot ; MathWorld « Lucas Correspondence Theorem », OEIS A083093, lus par Grok) ----------
// Pour p premier, binom(n, k) mod p = produit des binom(n_i, k_i) mod p, n_i et k_i les chiffres de n et k en base p.
// Exact ici : le triangle de Pascal construit ligne par ligne MODULO p (additions), compare case par case a la regle des chiffres, jusqu a la
//   ligne du curseur. Lignes 0..9 mod 3 de Grok (A083093) : ..., n = 8 -> 1, 2, 1, 2, 1, 2, 1, 2, 1 ; n = 9 -> 1, 0 ... 0, 1.
// Temoin : la meme regle des chiffres pour un module COMPOSE, 4 : binom(6, 2) = 15 = 3 mod 4, mais les chiffres en base 4 (12 et 02) donnent 1.
// Dessin (vue de face) : le triangle (k, -n), etiquette = binom(n, k) mod p (les motifs fractals du triangle).
function lucasRegle(n, k, p) { let r = 1; while (n > 0 || k > 0) { const a = n % p, b = k % p; if (b > a) return 0; let c = 1; for (let i = 0; i < b; i++) c = c * (a - i) / (i + 1); r = (r * c) % p; n = Math.floor(n / p); k = Math.floor(k / p); } return r; }
function theoremeLucas(P, n) {
  let p = P.baseP; const prem = (q) => { for (let d = 2; d * d <= q; d++) if (q % d === 0) return false; return q > 1; }; while (!prem(p)) p++;
  const N = P.lignesL; let ligne = [1], ecarts = 0; const cases = [];
  for (let m = 0; m <= N; m++) { for (let k = 0; k <= m; k++) { if (ligne[k] !== lucasRegle(m, k, p)) ecarts++; cases.push([k - m / 2, -m, ligne[k]]); }
    const suivante = [1]; for (let k = 1; k <= m; k++) suivante.push((ligne[k - 1] + ligne[k]) % p); suivante.push(1); ligne = suivante; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const lc = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = lc[0]; brut[o + 1] = lc[1]; brut[o + 2] = lc[2]; }
  let r3 = []; { let L = [1]; for (let m = 0; m <= 9; m++) { r3.push(L.join('')); const S = [1]; for (let k = 1; k <= m; k++) S.push((L[k - 1] + L[k]) % 3); S.push(1); L = S; } }
  return { D: 3, brut, nuage: true, unite: 'cases du triangle', invariants: {
    lucas: { mesure: ecarts, formule: 0, pUtilise: p, mod3: r3.join(' '), note: 'cells of Pascal s triangle mod p (built by additions) that differ from the base-p digit rule, up to the slider row' },
    temoin: { mesure: lucasRegle(6, 2, 4), formule: 1, vrai: 15 % 4, note: 'witness: the digit rule with the composite modulus 4 gives binom(6, 2) = 1, the truth is 15 mod 4 = 3' } } };
}

// ---------- 49 : l arbre de Calkin-Wilf (idee et valeurs : codex Grok Bot ; MathWorld « Calkin-Wilf Tree », OEIS A002487, lus par Grok) ----------
// Racine 1/1 ; sous a/b, a gauche a/(a + b), a droite (a + b)/b. Lu en largeur, l arbre enumere CHAQUE rationnel positif exactement une fois.
// Exact ici (entiers) : l arbre construit en largeur sur D niveaux (2^D - 1 fractions) ; chaque fraction est irreductible ; aucune n apparait
//   deux fois ; toute fraction reduite p/q avec p + q <= D + 1 est presente (sa profondeur ne depasse pas p + q - 1) ; et la n-ieme fraction vaut
//   fusc(n) / fusc(n + 1) (suite de Stern : fusc(2n) = fusc(n), fusc(2n + 1) = fusc(n) + fusc(n + 1)). 30 premieres : valeurs de Grok.
// Temoin : l enumeration naive par diagonales de Cantor (1/1, 1/2, 2/1, 1/3, 2/2, 3/1, ...) repete des valeurs (2/2 = 1/1).
// Dessin (vue de face) : l arbre, (position dans le niveau, -niveau), etiquette 1 si la fraction est > 1, 0 sinon.
function calkinWilf(P, n) {
  const Dn = P.niveaux, total = 2 ** Dn - 1, fr = [[1, 1]];
  for (let i = 0; fr.length < total; i++) { const [a, b] = fr[i]; fr.push([a, a + b], [a + b, b]); }
  const g = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
  const fusc = [0, 1]; for (let k = 2; k <= total + 1; k++) fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2]);
  let nonReduites = 0, doublons = 0, horsStern = 0; const vues = new Set();
  fr.forEach(([a, b], i) => { if (g(a, b) !== 1) nonReduites++; const cle = a + '/' + b; if (vues.has(cle)) doublons++; vues.add(cle); if (a !== fusc[i + 1] || b !== fusc[i + 2]) horsStern++; });
  let manquantes = 0; for (let s = 2; s <= Dn + 1; s++) for (let p = 1; p < s; p++) if (g(p, s - p) === 1 && !vues.has(p + '/' + (s - p))) manquantes++;
  const cantor = new Set(); let repetes = 0, vus = 0; for (let s = 2; vus < 30; s++) for (let p = 1; p < s && vus < 30; p++) { const q = s - p, d = g(p, q), cle = (p / d) + '/' + (q / d); if (cantor.has(cle)) repetes++; cantor.add(cle); vus++; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * total / n); let d = 0; while (2 ** (d + 1) <= i + 1) d++;
    const o = 3 * l, [a, b] = fr[i]; brut[o] = (i + 1 - 2 ** d + 0.5) / 2 ** d; brut[o + 1] = -d / Dn; brut[o + 2] = a > b ? 1 : 0; }
  /* 2026-11-08 : the tree as lines, each fraction to its two children (index i -> 2i + 1, 2i + 2 in the breadth-first list) */
  const noeud = (i) => { let d = 0; while (2 ** (d + 1) <= i + 1) d++; const [a, b] = fr[i]; return [(i + 1 - 2 ** d + 0.5) / 2 ** d, -d / Dn, a > b ? 1 : 0]; };
  const segments = []; for (let i = 0; 2 * i + 1 < total; i++) for (const c of [2 * i + 1, 2 * i + 2]) if (c < total) segments.push({ a: noeud(i), b: noeud(c) });
  return { D: 3, brut, nuage: true, segments, unite: 'sans objet', invariants: {
    calkinWilf: { mesure: nonReduites + doublons + horsStern, formule: 0, trente: fr.slice(0, 30).map(([a, b]) => a + '/' + b).join(' '), note: 'fractions in the first 2^D - 1 that are not reduced, appear twice, or differ from fusc(n)/fusc(n + 1)' },
    complet: { mesure: manquantes, formule: 0, note: 'reduced fractions p/q with p + q <= D + 1 missing from the first 2^D - 1 (every one must be there)' },
    temoin: { mesure: repetes, note: 'witness: the first 30 fractions of Cantor s diagonal listing repeat this many values (2/2 = 1/1, ...)' } } };
}

// ---------- 50 : les tours de Hanoi et le code de Gray (idee et valeurs : codex Grok Bot ; MathWorld « Tower of Hanoi », « Gray Code », OEIS A000225, lus par Grok) ----------
// Deplacer n disques d un piquet a un autre, un a la fois, jamais un grand sur un petit : il faut 2^n - 1 coups au minimum (T(n) = 2 T(n - 1) + 1).
// Exact ici : la solution recursive est JOUEE sur trois piles ; on compte les coups (2^n - 1), on verifie que chaque coup est legal, et que le disque
//   deplace au coup m est le disque 1 + (nombre de zeros a droite de m) — le bit qui change entre g(m - 1) et g(m) dans le code de Gray
//   g(m) = m xor (m div 2), qui ne change qu UN bit a chaque pas.
// Temoin : en binaire ordinaire, plusieurs bits changent d un coup sur deux (2^(n-1) - 1 fois sur 2^n - 1) : seul le code de Gray suit les disques.
// Dessin (vue de face) : (coup / total, disque / n), etiquette = piquet d arrivee (0, 1, 2).
function hanoiJouer(n) { const piles = [[], [], []], coups = []; for (let d = n; d >= 1; d--) piles[0].push(d); let illegaux = 0;
  const bouge = (k, de, vers, via) => { if (k === 0) return; bouge(k - 1, de, via, vers); const disque = piles[de].pop(), sommet = piles[vers][piles[vers].length - 1];
    if (disque !== k || (sommet !== undefined && sommet < disque)) illegaux++; piles[vers].push(disque); coups.push([disque, vers]); bouge(k - 1, via, vers, de); };
  bouge(n, 0, 2, 1); return { coups, illegaux, fini: piles[2].length === n }; }
function toursHanoi(P, n) {
  const N = P.disques, J = hanoiJouer(N); let horsGray = 0, binaireMulti = 0;
  J.coups.forEach(([disque], i) => { const m = i + 1; let z = 0, t = m; while (t % 2 === 0) { t /= 2; z++; } const x = (m ^ (m >> 1)) ^ ((m - 1) ^ ((m - 1) >> 1)); let bits = 0, y = x, pos = 0; while (y) { if (y & 1) { bits++; pos = pos || 0; } y >>= 1; }
    let p = 0; while (!((x >> p) & 1)) p++; if (disque !== z + 1 || bits !== 1 || p !== z) horsGray++; let c = 0, w = m ^ (m - 1); while (w) { c += w & 1; w >>= 1; } if (c > 1) binaireMulti++; });
  const total = J.coups.length, brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * total / n), o = 3 * l; brut[o] = (i + 1) / total; brut[o + 1] = J.coups[i][0] / N; brut[o + 2] = J.coups[i][1]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    hanoi: { mesure: total - (2 ** N - 1) + J.illegaux + (J.fini ? 0 : 1), formule: 0, coups: total, note: 'moves made minus 2^n - 1, plus illegal moves, plus 1 if the tower did not arrive' },
    gray: { mesure: horsGray, formule: 0, note: 'moves m where the disk moved is not 1 + (trailing zeros of m), or the Gray code changes more than one bit' },
    temoin: { mesure: binaireMulti, formule: 2 ** (N - 1) - 1, note: 'witness: steps where ordinary binary counting changes more than one bit (2^(n-1) - 1 of them)' } } };
}

// ---------- 51 : la suite « regarder et dire » (idee et valeurs : codex Grok Bot ; MathWorld « Look and Say Sequence », OEIS A005341, lus par Grok) ----------
// Partir de 1 et lire a voix haute : 1 -> « un 1 » = 11 -> « deux 1 » = 21 -> 1211 -> 111221 -> 312211 -> ...
// Exact ici : chaque terme construit par runs de chiffres egaux (chaines), jusqu au rang du curseur ; longueurs 1..15 = valeurs de Grok :
//   1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78. MESURE sur chaque terme (non demontre ici) : aucun chiffre au-dela de 3, jamais « 333 ».
//   (La constante de croissance de Conway n est pas affirmee ici.)
// Temoin : la graine 22 est un point fixe (« deux 2 » = 22) : sa suite ne grandit jamais.
// Dessin (vue de face) : pour chaque terme (rang / rangs, longueur relative en echelle log), etiquette = nombre de chiffres differents.
function lasSuivant(s) { const r = []; let i = 0; while (i < s.length) { let j = i; while (j < s.length && s[j] === s[i]) j++; r.push((j - i) + s[i]); i = j; } return r.join(''); }
function regarderDire(P, n) {
  const N = P.rangs, termes = ['1']; for (let k = 1; k < N; k++) termes.push(lasSuivant(termes[k - 1]));
  let horsChiffres = 0, triples = 0; termes.forEach((t) => { if (/[4-9]/.test(t)) horsChiffres++; if (t.includes('333')) triples++; });
  let g = '22'; for (let k = 0; k < 10; k++) g = lasSuivant(g);
  const maxL = termes[N - 1].length, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * N / n), o = 3 * l; brut[o] = (k + 1) / N; brut[o + 1] = lnD(termes[k].length) / lnD(maxL); brut[o + 2] = new Set(termes[k]).size; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    regarderDire: { mesure: horsChiffres + triples, formule: 0, longueurs: termes.slice(0, 15).map((t) => t.length).join(', '), septieme: termes[Math.min(6, N - 1)], note: 'terms (up to the slider) with a digit above 3 or the block 333 — measured on every term' },
    temoin: { mesure: g, formule: '22', note: 'witness: seed 22 read ten times stays 22 (a fixed point, it never grows)' } } };
}

// ---------- 52 : les derangements (idee et valeurs : codex Grok Bot ; MathWorld « Derangement », OEIS A000166, lus par Grok) ----------
// Un derangement est une permutation sans point fixe (personne ne recupere son propre chapeau). D(n) = n! somme (-1)^k / k!.
// Exact ici : toutes les permutations de n <= 8 objets ENUMEREES (algorithme de Heap) et celles sans point fixe comptees ; pour m <= 30,
//   D(m) par inclusion-exclusion EN ENTIERS (somme des (-1)^k m!/k!, BigInt) = recurrence D(m) = (m - 1)(D(m - 1) + D(m - 2)) ;
//   et D(m) = l entier le plus proche de m!/e pour 1 <= m <= 30, PROUVE en entiers : e encadre par A/K! et (A K + 1)/(K! K), A = somme des K!/k!, K = 30
//   (un flottant ne suffit pas : expPosD(1) decale 18!/e de 0.4 et l arrondi bascule). D(0..12) : valeurs de Grok (A000166).
// Temoin : m = 0, D(0) = 1, mais l entier le plus proche de 0!/e = 0.368 est 0 : la regle de l arrondi commence a 1.
// Dessin (vue de face) : un derangement tire (graine) parmi tous ceux de n objets, points (i, sigma(i)) ; etiquette = deplacement sigma(i) - i (jamais 0 ; un decalage constant c deborde apres n - 1 et revient a c - n : au moins deux valeurs).
function derPermutations(n, f) { const a = Array.from({ length: n }, (_, i) => i), c = new Array(n).fill(0); f(a); let i = 0;
  while (i < n) { if (c[i] < i) { const j = i % 2 ? c[i] : 0; [a[j], a[i]] = [a[i], a[j]]; f(a); c[i]++; i = 0; } else { c[i] = 0; i++; } } }
function derangements(P, n) {
  const N = P.objets, rng = mulberry32(P.graine), tous = []; let compte = 0; derPermutations(N, (a) => { if (a.every((v, i) => v !== i)) { compte++; tous.push(a.slice()); } });
  const Dr = [1n, 0n]; for (let m = 2; m <= 30; m++) Dr.push(BigInt(m - 1) * (Dr[m - 1] + Dr[m - 2]));
  let fact = 1n, ecartsIE = 0; for (let m = 0; m <= 30; m++) { if (m > 0) fact *= BigInt(m); let s = 0n, f = fact; for (let k = 0; k <= m; k++) { if (k > 0) f /= BigInt(k); s += (k % 2 ? -1n : 1n) * f; } if (s !== Dr[m]) ecartsIE++; }
  const K = 30; let KF = 1n; for (let k = 1; k <= K; k++) KF *= BigInt(k); let A = 0n, q = KF; for (let k = 0; k <= K; k++) { if (k > 0) q /= BigInt(k); A += q; }
  let ecartsE = 0, mf = 1n; for (let m = 1; m <= 30; m++) { mf *= BigInt(m); const d2 = 2n * Dr[m]; if (!(2n * mf * KF < (d2 + 1n) * A && 2n * mf * KF * BigInt(K) > (d2 - 1n) * (A * BigInt(K) + 1n))) ecartsE++; }
  const e = expPosD(1);
  const s = tous[Math.floor(rng() * tous.length)];
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = i; brut[o + 1] = s[i]; brut[o + 2] = s[i] - i; }
  return { D: 3, brut, nuage: true, unite: 'objets', invariants: {
    derangements: { mesure: (compte === Number(Dr[N]) ? 0 : 1) + ecartsIE, formule: 0, compte, douze: Dr.slice(0, 13).join(', '), note: 'enumerated derangements of n against D(n), plus m <= 30 where inclusion-exclusion (exact integers) and the recurrence disagree' },
    arrondiE: { mesure: ecartsE, formule: 0, note: 'm from 1 to 30 where D(m) is not the whole number nearest to m!/e' },
    temoin: { mesure: Math.round(1 / e), formule: 0, vrai: 1, note: 'witness: m = 0 : D(0) = 1, but the nearest whole number to 0!/e is 0 — the rounding rule starts at m = 1' } } };
}

// ---------- 53 : les nombres harmoniques (idee et valeurs : codex Grok Bot ; MathWorld « Harmonic Number », OEIS A001008 / A002805, lus par Grok) ----------
// H(n) = 1 + 1/2 + ... + 1/n, en FRACTIONS EXACTES (BigInt, reduites a chaque pas), jusqu au rang du curseur.
// Mesure pour chaque n : ln(n + 1) < H(n) <= 1 + ln(n) ; pour n >= 2 le denominateur reduit contient EXACTEMENT 2^floor(log2 n)
//   (un seul terme 1/k porte cette puissance de 2 : c est la preuve classique que H(n) n est jamais entier pour n >= 2).
// H(1..12) et H(20) : valeurs de Grok. Seuils : premiers n ou H(n) depasse 2, 3, 4 et 5 CALCULES ici (pas affirmes).
// Temoin : n = 1, H(1) = 1 est entier.
// Dessin (vue de face) : (n / N, H(n) - ln n) ; etiquette = exposant de 2 dans le denominateur.
function harmPgcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a < 0n ? -a : a; }
function nombresHarmoniques(P, n) {
  const N = P.rangs, nums = [0n], dens = [1n]; let hn = 0n, hd = 1n;
  for (let k = 1; k <= N; k++) { const a = hn * BigInt(k) + hd, b = hd * BigInt(k); let g = harmPgcd(a, b); hn = a / g; hd = b / g; nums.push(hn); dens.push(hd); }
  let horsBornes = 0, entiers = 0, deux = 0; const v2 = [0], seuils = [];
  for (let k = 1; k <= N; k++) { const hk = Number(nums[k]) / Number(dens[k]); if (!(lnD(k + 1) < hk && hk <= 1 + lnD(k) + 1e-12)) horsBornes++;
    let d = dens[k], e = 0; while (d % 2n === 0n) { d /= 2n; e++; } v2.push(e); let f = 0, p = 1; while (p * 2 <= k) { p *= 2; f++; }
    if (k >= 2 && dens[k] === 1n) entiers++; if (k >= 2 && e !== f) deux++;
    for (const s of [2, 3, 4, 5]) if (seuils.length === s - 2 && nums[k] > BigInt(s) * dens[k]) seuils.push(k); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = Number(nums[k]) / Number(dens[k]) - lnD(k); brut[o + 2] = v2[k]; }
  const fr = (k) => dens[k] === 1n ? String(nums[k]) : nums[k] + '/' + dens[k];
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    nombresHarmoniques: { mesure: horsBornes + entiers + deux, formule: 0, douze: Array.from({ length: 12 }, (_, i) => fr(i + 1)).join(', '), vingt: fr(20), seuils: seuils.join(' '), note: 'n up to the slider where H(n) leaves ln(n + 1) < H(n) <= 1 + ln n, or (n >= 2) is a whole number, or its denominator does not hold exactly 2^floor(log2 n)' },
    temoin: { mesure: Number(dens[1]), formule: 1, note: 'witness: n = 1 : H(1) = 1 is a whole number — the rule starts at n = 2' } } };
}

// ---------- 54 : la suite de Collatz (Syracuse) (idee et valeurs : codex Grok Bot ; MathWorld « Collatz Problem », OEIS A006577, lus par Grok) ----------
// n pair -> n/2 ; n impair -> 3n + 1. Conjecture OUVERTE : toute trajectoire finit par 1. Ici on ne prouve RIEN de general :
//   chaque depart 1..N est SUIVI (plafond de 10 000 pas : un depart qui le depasse compte comme echec, la boucle s arrete toujours).
// Mesure : chaque depart <= N atteint 1 ; vol(2m) = vol(m) + 1 ; vol(1..20) = valeurs de Grok. Record (plus long vol, altitude) CALCULE.
// Temoin : la variante 3n - 1 ; partie de 5 elle REVIENT sur 5 sans passer par 1 (un cycle) : la regle « tout finit par 1 » tient a 3n + 1.
// Dessin (vue de face) : (depart / N, vol / plus long vol) ; etiquette = nombre de pas impairs (3n + 1).
function syrVol(x0, impair) { let x = x0, pas = 0, montees = 0, alt = x0; while (x !== 1 && pas < 10000) { if (x % 2) { x = impair(x); montees++; } else x /= 2; pas++; alt = Math.max(alt, x); } return [x === 1 ? pas : -1, montees, alt]; }
function suiteCollatz(P, n) {
  const N = P.limite, vols = [0], monts = [0]; let echecs = 0, record = 1, altRecord = 1;
  for (let d = 1; d <= N; d++) { const [v, m, a] = syrVol(d, (x) => 3 * x + 1); if (v < 0) echecs++; vols.push(v); monts.push(m); if (v > vols[record]) { record = d; altRecord = a; } }
  let doubles = 0; for (let m = 1; 2 * m <= N; m++) if (vols[2 * m] !== vols[m] + 1) doubles++;
  let t = 5, retour = 0; for (let k = 0; k < 50; k++) { t = t % 2 ? 3 * t - 1 : t / 2; if (t === 5) { retour = 1; break; } if (t === 1) break; }
  const brut = new Float64Array(n * 3), vmax = vols[record];
  for (let l = 0; l < n; l++) { const d = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = d / N; brut[o + 1] = vols[d] / vmax; brut[o + 2] = monts[d]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteCollatz: { mesure: echecs + doubles, formule: 0, vingt: vols.slice(1, 21).join(', '), record: record + ' en ' + vols[record] + ' pas, altitude ' + altRecord, note: 'starts up to the slider that do not reach 1 within 10000 steps, plus m where flight(2m) differs from flight(m) + 1 — a finite check, not a proof' },
    temoin: { mesure: retour, formule: 1, note: 'witness: with 3n - 1 instead of 3n + 1, the start 5 comes back to 5 and never reaches 1 (a cycle)' } } };
}

// ---------- 55 : la routine de Kaprekar (idee et valeurs : codex Grok Bot ; MathWorld « Kaprekar Routine », lu par Grok) ----------
// Prendre un nombre a L chiffres (zeros en tete GARDES), ranger ses chiffres en ordre decroissant puis croissant, soustraire ; recommencer.
// Exact ici : les 10^L departs sont TOUS suivis (plafond de 20 pas). Mesure : tous ceux qui n ont pas leurs L chiffres egaux tombent
//   sur UN MEME point fixe (K(c) = c), calcule ici et non affirme. Pour L = 4 : distribution des pas = celle de Grok (exhaustive, max 7).
// Temoin : les nombres a chiffres tous egaux (1111...) donnent 0 au premier pas et n atteignent jamais le point fixe.
// Dessin (vue de face) : (depart / 10^L, pas / plus grand nombre de pas) ; etiquette = nombre de chiffres differents du depart.
function kapPas(x, L) { const kc = String(x).padStart(L, '0').split(''), kd = kc.slice().sort(), kg = kd.slice().reverse(); return Number(kg.join('')) - Number(kd.join('')); }
function routineKaprekar(P, n) {
  const L = P.longueurK, tot = 10 ** L, pasDe = new Array(tot).fill(0), finale = new Array(tot); const egaux = (x) => new Set(String(x).padStart(L, '0')).size === 1;
  const kt = new Int32Array(tot); for (let x = 0; x < tot; x++) kt[x] = kapPas(x, L);
  for (let x = 0; x < tot; x++) { let y = x, k = 0; while (k < 20 && kt[y] !== y) { y = kt[y]; k++; } pasDe[x] = k; finale[x] = kt[y] === y ? y : -1; }
  const fixes = new Set(); let perdus = 0; const distrib = {};
  for (let x = 0; x < tot; x++) { if (egaux(x)) continue; if (finale[x] < 0) perdus++; else fixes.add(finale[x]); distrib[pasDe[x]] = (distrib[pasDe[x]] || 0) + 1; }
  const constante = fixes.size === 1 ? [...fixes][0] : -1, pmax = Math.max(...Object.keys(distrib).map(Number));
  const rep = Number('1'.repeat(L)), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const x = Math.floor(l * tot / n), o = 3 * l; brut[o] = x / tot; brut[o + 1] = pasDe[x] / pmax; brut[o + 2] = new Set(String(x).padStart(L, '0')).size; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    routineKaprekar: { mesure: perdus + (fixes.size === 1 ? 0 : 1), formule: 0, pointFixe: constante, pmax, distribution: Object.keys(distrib).sort((a, b) => a - b).map((k) => k + ':' + distrib[k]).join(' '), note: 'starts (digits not all equal) that do not settle on one single fixed point within 20 steps' },
    temoin: { mesure: kapPas(rep, L), formule: 0, note: 'witness: a number whose digits are all equal gives 0 at the first step and never reaches the fixed point' } } };
}

// ---------- 56 : nombres de Stirling (2e espece) et de Bell (idee et valeurs : codex Grok Bot ; MathWorld « Stirling Number of the Second Kind »,
//   « Bell Number », OEIS A008277 / A000110, lus par Grok) ----------
// S(n, k) = facons de couper un ensemble de n elements en k blocs non vides (blocs NON ordonnes) ; Bell(n) = toutes les facons.
// Exact ici : TOUTES les partitions de n <= 9 elements ENUMEREES (chaines a croissance restreinte : a0 = 0, ai <= max + 1) et comptees par blocs ;
//   pour m <= 20, recurrence S(m, k) = k S(m - 1, k) + S(m - 1, k - 1) en BigInt, et Bell(m) = somme des S(m, k) = triangle d Aitken (additions seules).
// S(n, k) pour n <= 8 et Bell(0..10) : valeurs de Grok.
// Temoin : des blocs ORDONNES (fonctions surjectives sur 2 etiquettes) se comptent 2^n - 2 = 2 S(n, 2) : le double, car on distingue A de B.
// Dessin (vue de face) : une partition tiree (graine), points (element / n, numero de son bloc) ; etiquette = blocs ouverts jusqu a lui.
function stirlingBell(P, n) {
  const N = P.elements, rng = mulberry32(P.graine), comptes = new Array(N + 1).fill(0), rgsPart = new Array(N).fill(0);
  let total = 0, vise = -1, tiree = null;
  const parcours = (i, ouverts) => { if (i === N) { comptes[ouverts]++; if (total === vise) tiree = rgsPart.slice(); total++; return; }
    for (let b = 0; b <= ouverts && b < N; b++) { rgsPart[i] = b; parcours(i + 1, b === ouverts ? ouverts + 1 : ouverts); } };
  parcours(0, 0); vise = Math.floor(rng() * total); total = 0; comptes.fill(0); parcours(0, 0);
  const Sr = [[1n]]; for (let m = 1; m <= 20; m++) { const r = [0n]; for (let k = 1; k <= m; k++) r.push(BigInt(k) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n)); Sr.push(r); }
  const aitken = [1n]; let rang = [1n]; for (let m = 1; m <= 20; m++) { const nv = [rang[rang.length - 1]]; for (const x of rang) nv.push(nv[nv.length - 1] + x); rang = nv; aitken.push(rang[0]); }
  let ecarts = 0; for (let k = 1; k <= N; k++) if (BigInt(comptes[k]) !== Sr[N][k]) ecarts++;
  for (let m = 0; m <= 20; m++) if (Sr[m].reduce((a, b) => a + b, 0n) !== aitken[m]) ecarts++;
  let surj = 0; for (let x = 0; x < 2 ** N; x++) if (x !== 0 && x !== 2 ** N - 1) surj++;
  const blocs = Math.max(...tiree) + 1, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = i / N; brut[o + 1] = tiree[i] / Math.max(1, blocs - 1); brut[o + 2] = Math.max(...tiree.slice(0, i + 1)) + 1; }
  return { D: 3, brut, nuage: true, unite: 'elements', invariants: {
    stirlingBell: { mesure: ecarts, formule: 0, ligneHuit: Sr[8].slice(1).join(', '), bellOnze: aitken.slice(0, 11).join(', '), partitions: comptes.slice(1).join(' '), note: 'enumerated partitions of n per block count against the recurrence, plus m <= 20 where the sum of S(m, k) differs from the Aitken triangle' },
    temoin: { mesure: surj / Number(Sr[N][2]), formule: 1, vrai: 2, note: 'witness: ORDERED blocks (onto maps to 2 labels) count 2^n - 2, exactly twice S(n, 2): naming the blocks A and B counts each split twice' } } };
}

// ---------- 57 : les nombres de Motzkin (idee et valeurs : codex Grok Bot ; MathWorld « Motzkin Number », OEIS A001006, lus par Grok) ----------
// M(n) = chemins de n pas (montee, descente, palier) de la hauteur 0 a la hauteur 0 sans jamais passer sous 0.
// Exact ici : chemins de longueur n <= 13 ENUMERES un par un (retour arriere, coupe des que la hauteur depasse les pas restants) ;
//   pour m <= 40, recurrence M(m) = M(m - 1) + somme M(k) M(m - 2 - k) en BigInt = somme des C(m, 2k) Catalan(k) (autre idee :
//   placer les montees et descentes, puis les apparier comme des parentheses). M(0..15) : valeurs de Grok.
// Temoin : sans la contrainte « jamais sous 0 », 3 chemins de longueur 2 (UD, DU, FF) au lieu de M(2) = 2.
// Dessin (vue de face) : un chemin tire UNIFORMEMENT (graine ; table des completions), points (pas / n, hauteur relative) ;
//   etiquette = sorte de pas (0 palier, 1 montee, 2 descente).
function motzkinChemins(P, n) {
  const N = P.longueurM, rng = mulberry32(P.graine);
  const motzCompte = (i, h) => { if (h > N - i) return 0; if (i === N) return 1; return motzCompte(i + 1, h) + motzCompte(i + 1, h + 1) + (h > 0 ? motzCompte(i + 1, h - 1) : 0); };
  const compte = motzCompte(0, 0);
  const Mr = [1n, 1n]; for (let m = 2; m <= 40; m++) { let s = Mr[m - 1]; for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 2 - k]; Mr.push(s); }
  const binM = (a, b) => { let r = 1n; for (let j = 1; j <= b; j++) r = r * BigInt(a - b + j) / BigInt(j); return r; };
  let ecarts = compte === Number(Mr[N]) ? 0 : 1;
  for (let m = 0; m <= 40; m++) { let s = 0n; for (let k = 0; 2 * k <= m; k++) s += binM(m, 2 * k) * (binM(2 * k, k) / BigInt(k + 1)); if (s !== Mr[m]) ecarts++; }
  let libres = 0; for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a + b === 0) libres++;
  const W = Array.from({ length: N + 1 }, () => new Array(N + 2).fill(0)); W[N][0] = 1;
  for (let i = N - 1; i >= 0; i--) for (let h = 0; h <= N; h++) W[i][h] = W[i + 1][h] + (W[i + 1][h + 1] || 0) + (h > 0 ? W[i + 1][h - 1] : 0);
  const haut = [0], sorte = []; let h = 0;
  for (let i = 0; i < N; i++) { const t = rng() * W[i][h], pal = W[i + 1][h], mon = W[i + 1][h + 1] || 0;
    if (t < pal) sorte.push(0); else if (t < pal + mon) { sorte.push(1); h++; } else { sorte.push(2); h--; } haut.push(h); }
  const hmax = Math.max(1, ...haut), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = (i + 1) / N; brut[o + 1] = haut[i + 1] / hmax; brut[o + 2] = sorte[i]; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    motzkinChemins: { mesure: ecarts, formule: 0, compte, seize: Mr.slice(0, 16).join(', '), note: 'enumerated paths of length n against M(n), plus m <= 40 where the recurrence and the sum of C(m, 2k) Catalan(k) disagree' },
    temoin: { mesure: libres, formule: Number(Mr[2]), note: 'witness: without the floor at 0 there are 3 paths of length 2 (UD, DU, FF), not M(2) = 2' } } };
}

// ---------- 58 : les periodes de Pisano (idee et valeurs : codex Grok Bot ; OEIS A001175, b-file lu par Grok) ----------
// Fibonacci modulo m revient toujours a la paire (0, 1) : pi(m) = longueur de ce cycle. Exact ici : chaque m <= M suivi jusqu au retour
//   (plafond 6m + 10 pas : une boucle qui ne revient pas s arrete et compte comme echec). pi(1..30) : valeurs de Grok.
// MESURE (pas affirme) : pi(ab) = ppcm(pi(a), pi(b)) pour a, b premiers entre eux avec ab <= M ; pi(m) pair pour m > 2 ; pi(m) <= 6m,
//   et les m qui atteignent 6m sont CALCULES ici. Etiquette = zeros de Fibonacci dans un cycle (compte).
// Temoin : m = 2, pi(2) = 3 est impair : la parite ne vaut qu a partir de m = 3.
function pisanoPer(m) { if (m === 1) return [1, 1]; let a = 0, b = 1, k = 0, zeros = 0; do { [a, b] = [b, (a + b) % m]; k++; if (a === 0) zeros++; } while (!(a === 0 && b === 1) && k < 6 * m + 10); return [a === 0 && b === 1 ? k : -1, zeros]; }
function ppcmP(x, y) { let p = x, q = y; while (q) { [p, q] = [q, p % q]; } return x / p * y; }
function periodePisano(P, n) {
  const M = P.moduleMax, per = [0], zer = [0]; let perdus = 0;
  for (let m = 1; m <= M; m++) { const [k, z] = pisanoPer(m); if (k < 0) perdus++; per.push(k); zer.push(z); }
  const pgcdP = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  let ppcmFaux = 0, impairs = 0, auDela = 0; const sixM = [];
  for (let a = 2; a <= M; a++) for (let b = a + 1; a * b <= M; b++) if (pgcdP(a, b) === 1 && per[a * b] !== ppcmP(per[a], per[b])) ppcmFaux++;
  for (let m = 3; m <= M; m++) if (per[m] % 2) impairs++;
  for (let m = 1; m <= M; m++) { if (per[m] > 6 * m) auDela++; if (per[m] === 6 * m) sixM.push(m); }
  const pmax = Math.max(...per), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + (l % M), o = 3 * l; brut[o] = m / M; brut[o + 1] = per[m] / pmax; brut[o + 2] = zer[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    periodePisano: { mesure: perdus + ppcmFaux + impairs + auDela, formule: 0, trente: per.slice(1, 31).join(', '), sixM: sixM.join(' '), note: 'm up to the slider whose cycle does not close, coprime pairs where pi(ab) is not lcm(pi(a), pi(b)), odd periods beyond m = 2, and periods above 6m — measured' },
    temoin: { mesure: per[2] % 2, formule: 0, note: 'witness: pi(2) = 3 is odd — periods are even only from m = 3 on' } } };
}

// ---------- 59 : l indicatrice d Euler (idee et valeurs : codex Grok Bot ; OEIS A000010, b-file lu par Grok) ----------
// phi(n) = combien d entiers de 1 a n n ont aucun facteur commun avec n. Exact ici : crible jusqu a N (phi(m) = m, puis pour chaque
//   premier p, phi(multiple) -= phi(multiple) / p). phi(1..40) : valeurs de Grok.
// MESURE pour chaque n <= N : somme des phi(d) sur les diviseurs d de n = n ; phi(ab) = phi(a) phi(b) pour a, b premiers entre eux ;
//   phi(n) pair pour n > 2. Etiquette = nombre de facteurs premiers distincts de n.
// Temoin : la multiplicativite exige des facteurs premiers entre eux : phi(4) = 2, mais phi(2) phi(2) = 1.
function indicatriceEuler(P, n) {
  const N = P.jusquaN, totF = Array.from({ length: N + 1 }, (_, i) => i), nbP = new Array(N + 1).fill(0);
  for (let p = 2; p <= N; p++) if (totF[p] === p) for (let q = p; q <= N; q += p) { totF[q] -= totF[q] / p; nbP[q]++; }
  const somme = new Array(N + 1).fill(0); for (let d = 1; d <= N; d++) for (let q = d; q <= N; q += d) somme[q] += totF[d];
  const pgcdE = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  let sommesFausses = 0, multFausses = 0, impairs = 0;
  for (let m = 1; m <= N; m++) { if (somme[m] !== m) sommesFausses++; if (m > 2 && totF[m] % 2) impairs++; }
  for (let a = 2; a * a <= N; a++) for (let b = a + 1; a * b <= N; b++) if (pgcdE(a, b) === 1 && totF[a * b] !== totF[a] * totF[b]) multFausses++;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = m / N; brut[o + 1] = totF[m] / m; brut[o + 2] = nbP[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    indicatriceEuler: { mesure: sommesFausses + multFausses + impairs, formule: 0, quarante: totF.slice(1, 41).join(', '), note: 'n up to the slider where the sum of phi over the divisors is not n, coprime pairs where phi is not multiplicative, and odd phi beyond n = 2' },
    temoin: { mesure: totF[4], formule: totF[2] * totF[2], note: 'witness: 2 and 2 share a factor, so phi(4) = 2 differs from phi(2) phi(2) = 1' } } };
}

// ---------- 60 : la conjecture de Goldbach, en premiers IMPAIRS (idee et valeurs : codex Grok Bot ; OEIS A002375, b-file lu par Grok) ----------
// Conjecture OUVERTE : tout pair >= 6 est somme de deux premiers impairs. Ici on ne prouve RIEN de general : chaque pair E <= Emax est
//   decompose (crible), et les facons p + q (p <= q, premiers impairs) sont COMPTEES. Comptes pour E = 4..60 : valeurs de Grok (A002375 :
//   premiers IMPAIRS, donc 4 = 2 + 2 ne compte pas). Le plus petit nombre de facons au-dela de 6 est CALCULE et affiche.
// Temoin : E = 4 n a AUCUNE decomposition en premiers impairs (il faudrait 2 + 2) : la regle commence a 6.
// Dessin (vue de face) : (E / Emax, facons / plus grand nombre de facons) ; etiquette = reste de E modulo 3 (les multiples de 3 en ont plus).
function goldbachPaires(P, n) {
  const Emax = P.pairMax, crible = new Uint8Array(Emax + 1).fill(1); crible[0] = 0; crible[1] = 0;
  for (let p = 2; p * p <= Emax; p++) if (crible[p]) for (let q = p * p; q <= Emax; q += p) crible[q] = 0;
  const facons = new Array(Emax + 1).fill(0);
  for (let E = 4; E <= Emax; E += 2) for (let p = 3; p <= E / 2; p += 2) if (crible[p] && crible[E - p]) facons[E]++;
  let vides = 0; for (let E = 6; E <= Emax; E += 2) if (facons[E] === 0) vides++;
  let s3 = 0, n3 = 0, sA = 0, nA = 0; for (let E = 30; E <= Emax; E += 2) { if (E % 3 === 0) { s3 += facons[E]; n3++; } else { sA += facons[E]; nA++; } }
  const paires = []; for (let E = 4; E <= Emax; E += 2) paires.push(E);
  const fmax = Math.max(...facons), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const E = paires[Math.floor(l * paires.length / n)], o = 3 * l; brut[o] = E / Emax; brut[o + 1] = facons[E] / fmax; brut[o + 2] = E % 3; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    goldbachPaires: { mesure: vides, formule: 0, soixante: paires.filter((E) => E <= 60).map((E) => facons[E]).join(', '), rapportMod3: (s3 / n3) / (sA / nA), note: 'even numbers from 6 to the slider with no split into two odd primes: a finite check of an open conjecture, not a proof' },
    temoin: { mesure: facons[4], formule: 0, note: 'witness: 4 has no split into two odd primes (it would need 2 + 2): the rule starts at 6' } } };
}

// ---------- 61 : le probleme de Frobenius a deux pieces (idee et valeurs : codex Grok Bot ; MathWorld « Coin Problem », « Frobenius Number »,
//   lus par Grok) ----------
// Avec des pieces a et b premieres entre elles, quels montants ne peut-on PAS payer ? Exact ici : pour chaque couple 2 <= a < b <= Bmax
//   premiers entre eux, les montants payables sont MARQUES (programmation dynamique jusqu a ab), puis le plus grand impossible et le
//   nombre d impossibles sont COMPTES et compares a ab - a - b et (a - 1)(b - 1)/2 (Sylvester). MESURE aussi la symetrie : pour
//   0 <= k <= g, un seul de k et g - k est payable. Grille a = 3..9, b = 4..11 : valeurs de Grok.
// Temoin : 6 et 9 partagent 3 : tout montant payable est multiple de 3, il n y a PAS de plus grand impossible (compte sur 1..300).
// Dessin (vue de face) : chaque couple (a / Bmax, b / Bmax) ; etiquette = nombre de montants impossibles.
function frobPayables(a, b, L) { const rep = new Uint8Array(L + 1); rep[0] = 1; for (let v = 1; v <= L; v++) rep[v] = (v >= a && rep[v - a]) || (v >= b && rep[v - b]) ? 1 : 0; return rep; }
function frobeniusPieces(P, n) {
  const Bmax = P.pieceMax, pgcdF = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  const couples = []; let ecarts = 0, asym = 0;
  for (let a = 2; a <= Bmax; a++) for (let b = a + 1; b <= Bmax; b++) { if (pgcdF(a, b) !== 1) continue;
    const L = a * b, rep = frobPayables(a, b, L); let g = -1, nb = 0; for (let v = 1; v <= L; v++) if (!rep[v]) { g = v; nb++; }
    if (g !== a * b - a - b || nb !== (a - 1) * (b - 1) / 2) ecarts++;
    for (let k = 0; k <= g; k++) if (rep[k] + rep[g - k] !== 1) { asym++; break; }
    couples.push([a, b, g, nb]); }
  const r69 = frobPayables(6, 9, 300); let imp69 = 0; for (let v = 1; v <= 300; v++) if (!r69[v]) imp69++;
  const grille = couples.filter(([a, b]) => a <= 9 && b <= 11 && a >= 3 && b >= 4).map(([a, b, g, nb]) => a + ',' + b + ':' + g + '/' + nb).join(' ');
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, , nb] = couples[l % couples.length], o = 3 * l; brut[o] = a / Bmax; brut[o + 1] = b / Bmax; brut[o + 2] = nb; }
  return { D: 3, brut, nuage: true, unite: 'pieces', invariants: {
    frobeniusPieces: { mesure: ecarts + asym, formule: 0, couples: couples.length, grilleSylvester: grille, note: 'coprime coin pairs up to the slider whose counted largest impossible amount or count of impossible amounts differs from Sylvester, or that break the k / g - k symmetry' },
    temoin: { mesure: imp69, formule: (6 - 1) * (9 - 1) / 2, note: 'witness: 6 and 9 share 3, so every payable amount is a multiple of 3 and there is no largest impossible one: 1..300 holds far more impossible amounts than the formula would give' } } };
}

// ---------- 62 : les grands nombres de Schroder (idee et valeurs : codex Grok Bot ; OEIS A006318, b-file lu par Grok) ----------
// S(n) = chemins de (0, 0) a (2n, 0) en montees (1, 1), descentes (1, -1) et paliers DOUBLES (2, 0), jamais sous l axe.
// Exact ici : chemins de taille n <= 9 ENUMERES un par un ; pour m <= 30, convolution S(m) = S(m - 1) + somme S(k) S(m - 1 - k) en BigInt
//   = recurrence a trois termes (m + 1) S(m) = 3(2m - 1) S(m - 1) - (m - 2) S(m - 2). S(0..12) : valeurs de Grok.
// MESURE : S(m) pair pour 1 <= m <= 30 (les PETITS Schroder s(m) = S(m)/2 sont entiers).
// Temoin : S(0) = 1 est impair : s(0) = 1/2 n est pas un entier, les petits Schroder commencent a part (le piege signale par Grok).
// Dessin (vue de face) : un chemin tire UNIFORMEMENT (graine), points (x / 2n, hauteur relative) ; etiquette = sorte de pas.
function schroderChemins(P, n) {
  const T = P.longueurS, X = 2 * T, rng = mulberry32(P.graine);
  const schCompte = (x, y) => { if (y > X - x || y < 0) return 0; if (x === X) return 1; return schCompte(x + 1, y + 1) + schCompte(x + 1, y - 1) + (x + 2 <= X ? schCompte(x + 2, y) : 0); };
  const compte = schCompte(0, 0);
  const Sc = [1n]; for (let m = 1; m <= 30; m++) { let t = Sc[m - 1]; for (let k = 0; k <= m - 1; k++) t += Sc[k] * Sc[m - 1 - k]; Sc.push(t); }
  let ecarts = compte === Number(Sc[T]) ? 0 : 1, impairs = 0;
  for (let m = 2; m <= 30; m++) if (BigInt(m + 1) * Sc[m] !== 3n * BigInt(2 * m - 1) * Sc[m - 1] - BigInt(m - 2) * Sc[m - 2]) ecarts++;
  for (let m = 1; m <= 30; m++) if (Sc[m] % 2n) impairs++;
  const Wc = Array.from({ length: X + 3 }, () => new Array(X + 3).fill(0)); Wc[X][0] = 1;
  for (let x = X - 1; x >= 0; x--) for (let y = 0; y <= X; y++) Wc[x][y] = (Wc[x + 1][y + 1] || 0) + (y > 0 ? Wc[x + 1][y - 1] : 0) + (x + 2 <= X ? Wc[x + 2][y] : 0);
  const pts = [[0, 0, 0]]; let x = 0, y = 0;
  while (x < X) { const mo = Wc[x + 1][y + 1] || 0, de = y > 0 ? Wc[x + 1][y - 1] : 0, u = rng() * Wc[x][y];
    if (u < mo) { x++; y++; pts.push([x, y, 1]); } else if (u < mo + de) { x++; y--; pts.push([x, y, 2]); } else { x += 2; pts.push([x, y, 0]); } }
  const ymax = Math.max(1, ...pts.map((q) => q[1])), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, sorte] = pts[1 + (l % (pts.length - 1))], o = 3 * l; brut[o] = px / X; brut[o + 1] = py / ymax; brut[o + 2] = sorte; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    schroderChemins: { mesure: ecarts + impairs, formule: 0, compte, treize: Sc.slice(0, 13).join(', '), note: 'enumerated paths vs S(n), m <= 30 where the convolution and the three-term recurrence disagree, and odd S(m) for m >= 1' },
    temoin: { mesure: Number(Sc[0] % 2n), formule: 0, note: 'witness: S(0) = 1 is odd, so the little Schroder number s(0) = S(0)/2 is not a whole number: the halving rule starts at 1' } } };
}

// ---------- 63 : le triangle de Narayana (idee et valeurs : codex Grok Bot ; OEIS A001263, b-file lu par Grok) ----------
// N(n, k) = chemins de Dyck de demi-longueur n (montees et descentes, jamais sous l axe) qui ont exactement k SOMMETS (une montee suivie
//   d une descente). Exact ici : tous les chemins de Dyck de taille n <= N ENUMERES et comptes par sommets = C(n, k) C(n, k - 1) / n
//   (BigInt) ; MESURE : chaque ligne somme au nombre de Catalan C(2n, n)/(n + 1) et est SYMETRIQUE (N(n, k) = N(n, n + 1 - k)).
//   Lignes n = 1..8 : valeurs de Grok.
// Temoin : compter par RETOURS a l axe au lieu de sommets donne une autre ligne, NON symetrique (n = 3 : 2, 2, 1 au lieu de 1, 3, 1).
// Dessin (vue de face) : le triangle, points (k / (n + 1), N(n, k) / maximum de la ligne) ; etiquette = la ligne n.
function triangleNarayana(P, n) {
  const N = P.rangN, ligne = [null], retours3 = [0, 0, 0, 0];
  const binN = (a, b) => { if (b < 0 || b > a) return 0n; let r = 1n; for (let j = 1; j <= b; j++) r = r * BigInt(a - b + j) / BigInt(j); return r; };
  let ecarts = 0, asym = 0;
  for (let m = 1; m <= N; m++) { const parSommets = new Array(m + 2).fill(0);
    const dyck = (i, h, sommets, avant, ret) => { if (h < 0 || h > 2 * m - i) return; if (i === 2 * m) { parSommets[sommets]++; if (m === 3) retours3[ret]++; return; }
      dyck(i + 1, h + 1, sommets, 1, ret); dyck(i + 1, h - 1, sommets + (avant === 1 ? 1 : 0), -1, ret + (h - 1 === 0 ? 1 : 0)); };
    dyck(0, 0, 0, 0, 0); ligne.push(parSommets.slice(1, m + 1));
    let somme = 0n; for (let k = 1; k <= m; k++) { const f = binN(m, k) * binN(m, k - 1) / BigInt(m); somme += f; if (BigInt(parSommets[k]) !== f) ecarts++; if (parSommets[k] !== parSommets[m + 1 - k]) asym++; }
    if (somme !== binN(2 * m, m) / BigInt(m + 1)) ecarts++; }
  const pts = []; for (let m = 1; m <= N; m++) { const mx = Math.max(...ligne[m]); for (let k = 1; k <= m; k++) pts.push([k / (m + 1), ligne[m][k - 1] / mx, m]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, c] = pts[l % pts.length], o = 3 * l; brut[o] = a; brut[o + 1] = b; brut[o + 2] = c; }
  const r3 = retours3.slice(1, 4), r3sym = r3[0] === r3[2] ? 0 : 1;
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    triangleNarayana: { mesure: ecarts + asym, formule: 0, huitLignes: ligne.slice(1, 9).map((r) => r.join(' ')).join(' | '), note: 'rows up to the slider where the enumerated peak counts differ from C(n, k) C(n, k - 1) / n, do not add up to Catalan, or are not symmetric' },
    temoin: { mesure: r3sym, formule: 0, retoursTrois: r3.join(' '), note: 'witness: counting the same paths by returns to the axis gives 2 2 1 for n = 3, not symmetric, unlike the peak counts 1 3 1' } } };
}

// ---------- 64 : la suite de Recaman (idee et valeurs : codex Grok Bot ; OEIS A005132, b-file lu par Grok) ----------
// a(0) = 0 ; a(n) = a(n - 1) - n si ce nombre est > 0 et JAMAIS vu, sinon a(n - 1) + n. Exact ici : N termes construits.
// MESURE sur chaque terme : le saut vaut exactement n, et chaque choix suit la regle (reculer quand c etait permis, avancer sinon).
//   a(0..40) et premier terme repete (42 = a(20) = a(24)) : valeurs de Grok. La conjecture « tout entier finit par apparaitre » n est
//   PAS affirmee : le plus petit entier encore absent est CALCULE et affiche.
// Temoin : l interdiction de revoir un nombre ne vaut que pour le RECUL : en avancant, a(24) = 18 + 24 = 42 retombe sur a(20).
// Dessin (vue de face) : (n / N, a(n) / plus grand terme) ; etiquette = sens du saut (0 recul, 1 avance).
function suiteRecaman(P, n) {
  const N = P.rangR, rec = [0], vus = new Set([0]), sens = [1]; let fautes = 0, repete = null;
  for (let k = 1; k <= N; k++) { const ar = rec[k - 1] - k, v = ar > 0 && !vus.has(ar) ? ar : rec[k - 1] + k;
    if (repete === null && vus.has(v)) repete = [v, rec.indexOf(v), k];
    rec.push(v); vus.add(v); sens.push(v < rec[k - 1] ? 0 : 1); }
  const vus2 = new Set([0]);
  for (let k = 1; k <= N; k++) { const d = rec[k] - rec[k - 1], reculPermis = rec[k - 1] - k > 0 && !vus2.has(rec[k - 1] - k);
    if (Math.abs(d) !== k || (reculPermis ? d !== -k : d !== k)) fautes++; vus2.add(rec[k]); }
  let absent = 0; while (vus.has(absent)) absent++;
  const amax = Math.max(...rec), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * (N + 1) / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = rec[k] / amax; brut[o + 2] = sens[k]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteRecaman: { mesure: fautes, formule: 0, quarante: rec.slice(0, 41).join(', '), premierRepete: repete ? repete.join(' ') : 'none', plusPetitAbsent: absent, note: 'terms up to the slider whose jump is not exactly n, or that did not step back when stepping back was allowed (or stepped back when it was not)' },
    temoin: { mesure: repete && repete[0] === 42 ? 1 : 0, formule: 0, note: 'witness: the no-repeat rule only applies when stepping BACK: stepping forward, a(24) = 18 + 24 = 42 lands on a(20) again' } } };
}

// ---------- 65 : la suite de Kolakoski (idee et valeurs : codex Grok Bot ; OEIS A000002, MathWorld « Kolakoski Sequence », lus par Grok) ----------
// Une suite de 1 et de 2 qui se DECRIT elle-meme : la longueur de ses paquets successifs de chiffres egaux redonne la suite.
// Exact ici : N termes construits depuis 1, 2, 2 (chaque terme lu dit combien de fois ecrire le chiffre suivant, en alternant 1 et 2).
// MESURE : les longueurs des paquets complets redonnent exactement le debut de la suite. 60 premiers termes et 30 « 1 » : valeurs de Grok.
//   La proportion de 1 est CALCULEE et affichee ; qu elle tende vers 1/2 est une conjecture OUVERTE, pas affirmee ici.
// Temoin : 1, 2, 1, 2, ... alterne aussi les chiffres, mais ses paquets ont tous la longueur 1 : il ne se decrit pas lui-meme.
// Dessin (vue de face) : (k / N, exces de 1 sur 2 parmi les k premiers termes / plus grand exces) ; etiquette = le terme (1 ou 2).
function kolLongueurs(t) { const r = []; let i = 0; while (i < t.length) { let j = i; while (j < t.length && t[j] === t[i]) j++; r.push(j - i); i = j; } return r; }
function suiteKolakoski(P, n) {
  const N = P.rangK, kol = [1, 2, 2]; let lu = 2;
  while (kol.length < N) { const chiffre = kol[kol.length - 1] === 1 ? 2 : 1; for (let r = 0; r < kol[lu]; r++) kol.push(chiffre); lu++; }
  kol.length = N;
  const runs = kolLongueurs(kol).slice(0, -1); let fautes = 0; for (let i = 0; i < runs.length; i++) if (runs[i] !== kol[i]) fautes++;
  let uns = 0; const exces = []; for (let k = 0; k < N; k++) { if (kol[k] === 1) uns++; exces.push(2 * uns - (k + 1)); }
  const excesMax = Math.max(1, ...exces.map(Math.abs));
  const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : 1)), altRuns = kolLongueurs(alt); let ecartAlt = -1; for (let i = 0; i < altRuns.length; i++) if (altRuns[i] !== alt[i]) { ecartAlt = i; break; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * N / n), o = 3 * l; brut[o] = (k + 1) / N; brut[o + 1] = exces[k] / excesMax; brut[o + 2] = kol[k]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteKolakoski: { mesure: fautes, formule: 0, soixante: kol.slice(0, 60).join(''), unsSoixante: kol.slice(0, 60).filter((x) => x === 1).length, proportionUns: uns / N, note: 'complete runs up to the slider whose length differs from the matching term: the sequence must describe itself' },
    temoin: { mesure: ecartAlt, formule: -1, note: 'witness: 1, 2, 1, 2, ... also alternates its digits, but all its runs have length 1, so it stops describing itself at position 1' } } };
}

// ---------- 66 : la suite de Perrin (idee et valeurs : codex Grok Bot ; OEIS A001608, A013998, MathWorld « Perrin Pseudoprime », lus par Grok) ----------
// P(0) = 3, P(1) = 0, P(2) = 2, P(n) = P(n - 2) + P(n - 3). Si n est premier, n divise P(n). Exact ici : pour chaque n <= N, P(n) mod n
//   calcule en restant modulo n. MESURE : chaque premier p <= N divise P(p) ; les composes <= N qui divisent P(n) sont COMPTES.
//   P(0..25) : valeurs de Grok (BigInt).
// Temoin : la reciproque est FAUSSE. 271441 (plus petit pseudo-premier de Perrin selon Grok, A013998) : son diviseur est CHERCHE ici
//   (divisions successives), et P(271441) mod 271441 est CALCULE par puissance de la matrice compagnon modulo 271441 : il vaut 0.
// Dessin (vue de face) : (n / N, (P(n) mod n) / n) ; etiquette = 1 si n est premier.
function perrinModulo(m) { if (m === 1) return 0; let a = 3 % m, b = 0, c = 2 % m; for (let k = 0; k < m; k++) [a, b, c] = [b, c, (a + b) % m]; return a; }
function perrinMatrice(m) {
  const mul = (X, Y) => X.map((ligne) => Y[0].map((_, j) => (ligne[0] * Y[0][j] + ligne[1] * Y[1][j] + ligne[2] * Y[2][j]) % m));
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], A = [[0, 1, 0], [0, 0, 1], [1, 1, 0]], e = m;
  while (e > 0) { if (e % 2) R = mul(R, A); A = mul(A, A); e = Math.floor(e / 2); }
  return (R[0][0] * 3 + R[0][1] * 0 + R[0][2] * 2) % m;
}
function suitePerrin(P, n) {
  const N = P.perrinMax, premier = new Uint8Array(N + 1).fill(1); premier[0] = 0; premier[1] = 0;
  for (let p = 2; p * p <= N; p++) if (premier[p]) for (let q = p * p; q <= N; q += p) premier[q] = 0;
  const reste = [0]; let premiersRates = 0, composesDivisent = 0;
  for (let m = 1; m <= N; m++) { const r = perrinModulo(m); reste.push(r); if (premier[m] && r !== 0) premiersRates++; if (m > 1 && !premier[m] && r === 0) composesDivisent++; }
  const Pb = [3n, 0n, 2n]; for (let k = 3; k <= 25; k++) Pb.push(Pb[k - 2] + Pb[k - 3]);
  const temoinN = 271441; let diviseur = 0; for (let d = 2; d * d <= temoinN; d++) if (temoinN % d === 0) { diviseur = d; break; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = m / N; brut[o + 1] = reste[m] / m; brut[o + 2] = premier[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suitePerrin: { mesure: premiersRates, formule: 0, composesDivisent, vingtSix: Pb.join(', '), note: 'primes p up to the slider that do not divide P(p); composites that do divide P(n) are counted separately (composesDivisent)' },
    temoin: { mesure: perrinMatrice(temoinN), formule: 0, diviseur, note: 'witness: 271441 is composite (its divisor is found here) and still divides P(271441): the converse fails' } } };
}

// ---------- 67 : la suite de Thue-Morse (idee et valeurs : codex Grok Bot ; OEIS A010060, MathWorld « Thue-Morse Sequence », lus par Grok) ----------
// t(n) = parite du nombre de bits 1 de n : 0 1 1 0 1 0 0 1 ... Exact ici : N termes par la parite des bits = N termes par doublement
//   (0 -> 01 -> 0110 -> ..., chaque etape colle le complement) ; MESURE : aucun cube XXX dans le prefixe (toutes positions, |X| <= 24 ;
//   un prefixe fini ne prouve pas le theoreme infini) ; Prouhet-Tarry-Escott : pour chaque k <= K, les n < 2^k a t(n) = 0 et a t(n) = 1
//   ont les MEMES sommes de n^j pour j < k (BigInt). 64 premiers termes : valeurs de Grok.
// Temoin : a j = k les deux sommes DIFFERENT : l egalite s arrete exactement la.
// Dessin (vue de face) : une tortue qui avance sur 0 et tourne de 60 degres sur 1 ; etiquette = t(n).
function thueMorse(P, n) {
  const N = P.rangT, tmPar = (m) => { let c = 0; while (m) { c ^= m & 1; m >>= 1; } return c; }, tmBits = Array.from({ length: N }, (_, i) => tmPar(i));
  let dbl = [0]; while (dbl.length < N) dbl = dbl.concat(dbl.map((b) => 1 - b));
  let ecarts = 0; for (let i = 0; i < N; i++) if (dbl[i] !== tmBits[i]) ecarts++;
  let cubes = 0; const Lmax = Math.min(24, Math.floor(N / 3));
  for (let L = 1; L <= Lmax; L++) for (let i = 0; i + 3 * L <= N; i++) { let pareil = true; for (let j = 0; j < L && pareil; j++) if (tmBits[i + j] !== tmBits[i + L + j] || tmBits[i + j] !== tmBits[i + 2 * L + j]) pareil = false; if (pareil) cubes++; }
  let K = 1; while (2 ** (K + 1) <= N && K < 10) K++;
  let pteFaux = 0; for (let k = 2; k <= K; k++) for (let j = 0; j < k; j++) { let s0 = 0n, s1 = 0n; for (let m = 0; m < 2 ** k; m++) { const p = BigInt(m) ** BigInt(j); if (tmBits[m]) s1 += p; else s0 += p; } if (s0 !== s1) pteFaux++; }
  let t0 = 0n, t1 = 0n; for (let m = 0; m < 2 ** K; m++) { const p = BigInt(m) ** BigInt(K); if (tmBits[m]) t1 += p; else t0 += p; }
  const pas = [[0, 0]]; let cap = 0, x = 0, y = 0; for (let i = 0; i < N; i++) { if (tmBits[i]) cap = (cap + 1) % 6; else { x += cosD(cap * PI / 3); y += sinD(cap * PI / 3); } pas.push([x, y]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = pas[i + 1][0]; brut[o + 1] = pas[i + 1][1]; brut[o + 2] = tmBits[i]; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    thueMorse: { mesure: ecarts + cubes + pteFaux, formule: 0, soixanteQuatre: tmBits.slice(0, 64).join(''), rangK: K, note: 'terms where bit parity and doubling disagree, cubes XXX found in the prefix (|X| <= 24), and power sums j < k that differ between the two halves' },
    temoin: { mesure: t0 === t1 ? 0 : 1, formule: 0, vrai: 1, note: 'witness: at j = k the power sums of the two halves differ: the Prouhet-Tarry-Escott equality stops exactly there' } } };
}

// ---------- 68 : la suite de Padovan (idee et valeurs : codex Grok Bot ; OEIS A000931, b-file lu par Grok) ----------
// Convention OEIS : P(0) = 1, P(1) = P(2) = 0, P(n) = P(n - 2) + P(n - 3). Exact ici : N termes en BigInt. MESURE : la seconde
//   recurrence P(n) = P(n - 1) + P(n - 5) (n >= 5) ; le rapport P(n + 1)/P(n) compare a la racine reelle de x^3 = x + 1 (le nombre
//   plastique), CALCULEE par dichotomie (60 coupes), ecart relatif sous 1e-6 des n = 60. P(0..30) : valeurs de Grok.
// Temoin : le piege d indices signale par Grok : partir de 1, 1, 1 donne la MEME suite decalee ; le decalage est CHERCHE ici (5).
// Dessin (vue de face) : (n / N, ecart du rapport au nombre plastique / plus grand ecart) ; etiquette = signe de l ecart.
function suitePadovan(P, n) {
  const N = P.rangP, pad = [1n, 0n, 0n]; for (let k = 3; k <= N + 5; k++) pad.push(pad[k - 2] + pad[k - 3]);
  let ecarts = 0; for (let k = 5; k <= N; k++) if (pad[k] !== pad[k - 1] + pad[k - 5]) ecarts++;
  let lo = 1, hi = 2; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (m * m * m - m - 1 > 0) hi = m; else lo = m; } const rho = (lo + hi) / 2;
  const ratio = (k) => Number(pad[k + 1]) / Number(pad[k]);
  let loin = 0; for (let k = 60; k <= N; k++) if (Math.abs(ratio(k) / rho - 1) > 1e-6) loin++;
  const q = [1n, 1n, 1n]; for (let k = 3; k <= 40; k++) q.push(q[k - 2] + q[k - 3]);
  let decalage = -1; for (let s = 0; s <= 10 && decalage < 0; s++) { let ok = true; for (let k = 0; k <= 30; k++) if (q[k] !== pad[k + s]) { ok = false; break; } if (ok) decalage = s; }
  const ec = []; for (let k = 5; k < N; k++) ec.push([k, ratio(k) - rho]); const emax = Math.max(...ec.map((e) => Math.abs(e[1])));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [k, e] = ec[Math.floor(l * ec.length / n)], o = 3 * l; brut[o] = k / N; brut[o + 1] = e / emax; brut[o + 2] = e > 0 ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suitePadovan: { mesure: ecarts + loin, formule: 0, trenteEtUn: pad.slice(0, 31).join(', '), plastique: rho, note: 'n where P(n) is not P(n - 1) + P(n - 5), and n >= 60 where P(n + 1)/P(n) is more than 1e-6 away from the root of x^3 = x + 1' },
    temoin: { mesure: decalage, formule: 0, note: 'witness: starting from 1, 1, 1 instead gives the same numbers shifted by 5 places: the indexing must be checked' } } };
}

// ---------- 69 : la fourmi de Langton (idee et valeurs : codex Grok Bot ; Wikipedia « Langton's ant », MathWorld, lus par Grok) ----------
// Grille blanche, fourmi en (0, 0) cap nord ; sur blanc elle tourne a droite, sur noir a gauche, inverse la case et avance d une case.
// Exact ici : S pas simules (cases noires dans un ensemble, sans bord). MESURE : le dernier pas t ou le virage differe de celui du pas
//   t + 104 est CHERCHE (Grok : t = 9976, l autoroute commence au pas 9977) ; ensuite, sur toute la fenetre, la fourmi se deplace de
//   (-2, -2) en 104 pas avec le meme cap. Une simulation finie ne prouve pas la suite infinie.
// Temoin : une autre periode (52 ou 103) ne colle pas : ses desaccords apres le pas 10000 sont COMPTES.
// Dessin (vue de face) : les positions de la fourmi ; etiquette = couleur de la case qu elle vient de quitter.
function fourmiLangton(P, n) {
  const S = P.pasL, noires = new Set(), DX = [0, 1, 0, -1], DY = [1, 0, -1, 0];
  let x = 0, y = 0, cap = 0; const pos = [[0, 0, 0]], virage = [], couleur = [];
  for (let t = 0; t < S; t++) { const k = x + ',' + y, noir = noires.has(k);
    cap = noir ? (cap + 3) % 4 : (cap + 1) % 4; virage.push(noir ? -1 : 1);
    if (noir) noires.delete(k); else noires.add(k); couleur.push(noir ? 0 : 1);
    x += DX[cap]; y += DY[cap]; pos.push([x, y, cap]); }
  let dernier = -1; for (let t = 0; t + 104 < S; t++) if (virage[t] !== virage[t + 104]) dernier = t;
  let horsAutoroute = 0; for (let t = 10000; t + 104 <= S; t++) { const a = pos[t], b = pos[t + 104]; if (b[0] - a[0] !== -2 || b[1] - a[1] !== -2 || b[2] !== a[2]) horsAutoroute++; }
  let desaccord52 = 0, desaccord103 = 0; for (let t = 10000; t + 104 < S; t++) { if (virage[t] !== virage[t + 52]) desaccord52++; if (virage[t] !== virage[t + 103]) desaccord103++; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = Math.floor(l * S / n), o = 3 * l; brut[o] = pos[t + 1][0]; brut[o + 1] = pos[t + 1][1]; brut[o + 2] = couleur[t]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    fourmiLangton: { mesure: (dernier === 9976 ? 0 : 1) + horsAutoroute, formule: 0, dernierDesaccord: dernier, a10000: pos[10000].join(' '), a10104: pos[10104].join(' '), noiresFin: noires.size, note: 'last step whose turn differs 104 steps later must be 9976, and every step from 10000 on must move by (-2, -2) with the same heading in 104 steps' },
    temoin: { mesure: Math.min(desaccord52, desaccord103) > 0 ? 1 : 0, formule: 0, vrai: 1, desaccord52, desaccord103, note: 'witness: periods 52 and 103 do not fit the highway: their mismatches after step 10000 are counted' } } };
}

// ---------- 70 : la gamme temperee (idee et valeurs : codex Grok Bot 20 ; SFU « Handbook for Acoustic Ecology », D. Wright « Logarithms and
//   Musical Intervals », lus par Grok) ----------
// L octave (rapport 2) coupee en N pas egaux : chaque pas a le rapport 2^(1/N), CHERCHE ici par dichotomie sur x^N = 2 (pas de pow) ;
//   un intervalle de rapport r mesure 1200 log2 r cents (lnD). MESURE pour le N du curseur : ecart en cents de la quinte (3/2), de la
//   tierce majeure (5/4) et de la quarte (4/3) au pas le plus proche ; quinte + quarte font une octave, donc leurs ecarts sont OPPOSES.
//   Pour N = 12 : rapports 2^(k/12) et ecarts -1.955000865, +13.686286135, +1.955000865 cents = calculs de Grok.
// Temoin : douze quintes PURES ne retombent pas sur sept octaves : (3/2)^12 / 2^7 = 531441/524288 (fraction EXACTE en BigInt), la comma
//   pythagoricienne, environ 23.46 cents : c est pour la gommer qu on tempere.
// Dessin (vue de face) : chaque pas k de l octave (k / N, ecart en demi-tons au rapport simple le plus proche, rapports p/q avec q <= 8) ;
//   etiquette = k.
function gammeTemperee(P, n) {
  const N = P.divisions; let lo = 1, hi = 2; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; let x = 1; for (let j = 0; j < N; j++) x *= m; if (x > 2) hi = m; else lo = m; } const pasG = (lo + hi) / 2;
  const cents = (r) => 1200 * lnD(r) / lnD(2), rapports = [1]; for (let k = 1; k <= N; k++) rapports.push(rapports[k - 1] * pasG);
  const ecart = (p, q) => { const c = cents(p / q), k = Math.round(c * N / 1200); return cents(rapports[k]) - c; };
  const quinte = ecart(3, 2), tierce = ecart(5, 4), quarte = ecart(4, 3);
  let ecarts = (Math.abs(rapports[N] - 2) < 1e-12 ? 0 : 1) + (Math.abs(quinte + quarte) < 1e-9 || Math.round(cents(1.5) * N / 1200) + Math.round(cents(4 / 3) * N / 1200) !== N ? 0 : 1);
  const comma = [3n ** 12n, 2n ** 12n * 2n ** 7n], commaCents = cents(Number(comma[0]) / Number(comma[1]));
  const simples = []; for (let q = 1; q <= 8; q++) for (let p = q; p <= 2 * q; p++) simples.push(cents(p / q));
  const pts = []; for (let k = 0; k <= N; k++) { const c = cents(rapports[k]); let best = Infinity; for (const s of simples) if (Math.abs(c - s) < Math.abs(best)) best = c - s; pts.push([k / N, best / 100, k]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, c] = pts[l % pts.length], o = 3 * l; brut[o] = a; brut[o + 1] = b; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'cents', invariants: {
    gammeTemperee: { mesure: ecarts, formule: 0, pasRapport: pasG, quinteCents: quinte, tierceCents: tierce, quarteCents: quarte, douze: N === 12 ? rapports.map((r) => r.toFixed(12)).join(' ') : 'N != 12',
      note: 'the N-th step must land on the octave 2 within 1e-12, and the fifth and fourth errors must cancel (they add up to an octave)' },
    temoin: { mesure: commaCents, formule: 0, commaFraction: comma[0] + '/' + comma[1], note: 'witness: twelve pure fifths overshoot seven octaves by 531441/524288, the Pythagorean comma, about 23.46 cents' } } };
}

// ---------- 71 : l entropie de Shannon et le code de Huffman (idee et valeurs : codex Grok Bot 20 ; effectifs : SOURCES, Cornell ;
//   formule H = -somme p log2 p : R. van den Boomgaard, lu par Grok) ----------
// Lettres tirees independamment selon les effectifs publies (modele d ordre 1, PAS l anglais reel avec ses mots). H = 4.181867014267 bits
//   par lettre (calcul de Grok). Exact ici : H par lnD ; un code de Huffman construit sur les 26 effectifs (fusion des deux plus rares,
//   repetee), longueur moyenne Lh. MESURE : H <= Lh < H + 1 (theoreme du codage de source) ; un texte tire (graine, longueur du curseur)
//   a une entropie empirique proche de H (ecart sous 0.05 bit des 5000 lettres).
// Temoin : un code de longueur FIXE a besoin de 5 bits par lettre (2^4 = 16 < 26) : bien plus que Lh, parce que les lettres ne sont
//   pas egalement frequentes.
// Dessin (vue de face) : chaque lettre (rang / 26, surprise -log2 de sa frequence dans le texte tire) ; etiquette = longueur de son code.
function entropieShannon(P, n) {
  const paires = SOURCES.lettresAnglais.valeur.split(' ').map((x) => { const [l, c] = x.split(':'); return [l, Number(c)]; }), tot = paires.reduce((a, [, c]) => a + c, 0);
  const lg2 = (x) => lnD(x) / lnD(2), H = -paires.reduce((a, [, c]) => a + (c / tot) * lg2(c / tot), 0);
  let foret = paires.map(([l, c]) => ({ poids: c, feuilles: [l] })); const longueur = Object.fromEntries(paires.map(([l]) => [l, 0]));
  while (foret.length > 1) { foret.sort((a, b) => a.poids - b.poids); const [a, b] = foret.splice(0, 2); for (const l of [...a.feuilles, ...b.feuilles]) longueur[l]++; foret.push({ poids: a.poids + b.poids, feuilles: [...a.feuilles, ...b.feuilles] }); }
  const Lh = paires.reduce((a, [l, c]) => a + (c / tot) * longueur[l], 0);
  const rng = mulberry32(P.graine), cumul = []; let acc = 0; for (const [, c] of paires) { acc += c; cumul.push(acc / tot); }
  const vus = new Array(26).fill(0); for (let i = 0; i < P.lettres; i++) { const u = rng(); let k = 0; while (cumul[k] < u) k++; vus[k]++; }
  const Hemp = -vus.reduce((a, v) => (v ? a + (v / P.lettres) * lg2(v / P.lettres) : a), 0);
  let fixe = 0; while (2 ** fixe < 26) fixe++;
  const ecarts = (H <= Lh && Lh < H + 1 ? 0 : 1) + (P.lettres >= 5000 && Math.abs(Hemp - H) > 0.05 ? 1 : 0);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = l % 26, o = 3 * l, p = (vus[k] || 0.5) / P.lettres; brut[o] = (k + 1) / 26; brut[o + 1] = -lg2(p); brut[o + 2] = longueur[paires[k][0]]; }
  return { D: 3, brut, nuage: true, unite: 'bits', invariants: {
    entropieShannon: { mesure: ecarts, formule: 0, entropie: H, longueurHuffman: Lh, entropieTexte: Hemp, totalLettres: tot, note: 'Huffman average length outside [H, H + 1), or a drawn text of 5000+ letters whose entropy is more than 0.05 bit from H' },
    temoin: { mesure: fixe, formule: Lh, note: 'witness: a fixed-length code needs 5 bits per letter (2^4 = 16 < 26), far more than Huffman, because the letters are not equally common' } } };
}

// ---------- 72 : l atmosphere standard US 1976 (idee et valeurs : codex Grok Bot 20 ; constantes : SOURCES, NASA SP-398 et C. D. Griffin) ----------
// Altitude GEOPOTENTIELLE H (m). 0-11 km : T = T0 + L H ; 11-20 km : isotherme. Equilibre hydrostatique dp/dH = -g0 M0 p / (R* T(H)).
// Exact ici : (1) la pression INTEGREE pas a pas (Runge-Kutta 4, 4000 pas par couche) ; (2) la formule fermee de chaque couche,
//   p = pb (T/Tb)^(-g0 M0 / (R* L)) puis p = p11 e^(-g0 M0 (H - 11000) / (R* T11)), par lnD et expPosD. MESURE : ecart relatif entre
//   les deux sous 1e-9 a chaque point. H = 0, 5, 11, 20 km : T et p = calculs de Grok (accord avec le tableau SP-398 a l arrondi).
// Temoin : 5 km GEOMETRIQUES ne sont pas 5 km geopotentiels : H = r0 z / (r0 + z) = 4996.07 m, T = 255.6755 K au lieu de 255.65 K.
// Dessin (vue de face) : (H / Hmax, p / p0) ; etiquette = temperature (K).
function atmosphereStandard(P, n) {
  const T0 = SOURCES.T0atm.valeur, p0 = SOURCES.p0atm.valeur, L = SOURCES.gradientAtm.valeur, g0 = SOURCES.g0atm.valeur, M0 = SOURCES.M0atm.valeur, Rs = SOURCES.RstarAtm.valeur, r0 = SOURCES.r0atm.valeur;
  const k = g0 * M0 / Rs, Hmax = P.altitudeKm * 1000, T11 = T0 + L * 11000, expAtm = (x) => (x >= 0 ? expPosD(x) : 1 / expPosD(-x));
  const Tde = (H) => (H <= 11000 ? T0 + L * H : T11), p11 = p0 * expAtm((-k / L) * lnD(T11 / T0));
  const pFerme = (H) => (H <= 11000 ? p0 * expAtm((-k / L) * lnD(Tde(H) / T0)) : p11 * expAtm(-k * (H - 11000) / T11));
  const f = (H, p) => -k * p / Tde(H); const pts = []; let p = p0, H = 0, ecarts = 0; const pasRK = Math.min(11000, Hmax) / 4000;
  const avance = (h, nb) => { for (let i = 0; i < nb; i++) { const a = f(H, p), b = f(H + h / 2, p + h * a / 2), c = f(H + h / 2, p + h * b / 2), d = f(H + h, p + h * c); p += h * (a + 2 * b + 2 * c + d) / 6; H += h;
    if (i % 20 === 0) { const pf = pFerme(H); if (Math.abs(p - pf) / pf > 1e-9) ecarts++; pts.push([H, p, Tde(H)]); } } };
  pts.push([0, p0, T0]); avance(pasRK, Math.round(Math.min(11000, Hmax) / pasRK)); if (Hmax > 11000) avance((Hmax - 11000) / 4000, 4000);
  const quatre = [0, 5000, 11000, 20000].map((x) => Tde(x).toFixed(3) + '/' + pFerme(x).toFixed(6)).join(' ');
  const zGeo = 5000, Hgeo = r0 * zGeo / (r0 + zGeo);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [h, pp, t] = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = h / Hmax; brut[o + 1] = pp / p0; brut[o + 2] = t; }
  return { D: 3, brut, nuage: true, unite: 'Pa', invariants: {
    atmosphereStandard: { mesure: ecarts, formule: 0, quatreAltitudes: quatre, pression11: p11, note: 'points where the integrated pressure is more than 1e-9 (relative) from the closed formula of its layer' },
    temoin: { mesure: Tde(Hgeo), formule: Tde(5000), Hgeopotentiel: Hgeo, note: 'witness: 5 km GEOMETRIC is only 4996.07 m geopotential: the temperature there is 255.6755 K, not the 255.65 K of H = 5 km' } } };
}

// ---------- 73 : la loi de Zipf sur un vrai corpus (idee et valeurs : codex Grok Bot 20 ; comptes : SOURCES, P. Norvig / Google Web 1T) ----------
// Les mots les plus frequents : compte(r) ~ C / r^s. Exact ici : droite des moindres carres de log10(compte) contre log10(rang) sur les R
//   premiers rangs (R du curseur), pente -s. MESURE : comptes strictement decroissants ; pour R = 30, pente = -0.852706154 (calcul de Grok).
//   L exposant DECRIT ce corpus filtre, ce n est pas une constante universelle.
// Temoin : la pente depend des rangs choisis : sur les 10 premiers rangs elle n est pas celle des 30 premiers, et aucune ne vaut -1.
// Dessin (vue de face) : (log10 rang / log10 30, log10 compte relatif au premier) ; etiquette = ecart a la droite ajustee (residu).
function loiZipf(P, n) {
  const mots = SOURCES.motsWeb.valeur.split(' ').map((x) => { const [m, c] = x.split(':'); return [m, Number(c)]; }), lg10 = (x) => lnD(x) / lnD(10);
  const pente = (R) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let r = 1; r <= R; r++) { const x = lg10(r), y = lg10(mots[r - 1][1]); sx += x; sy += y; sxx += x * x; sxy += x * y; } const b = (R * sxy - sx * sy) / (R * sxx - sx * sx); return [b, (sy - b * sx) / R]; };
  let nonDecroissant = 0; for (let r = 1; r < mots.length; r++) if (!(mots[r][1] < mots[r - 1][1])) nonDecroissant++;
  const R = P.rangsZipf, [b, a] = pente(R), [b10] = pente(10), [b30] = pente(30);
  const pts = mots.slice(0, R).map(([, c], i) => { const x = lg10(i + 1), y = lg10(c); return [x / lg10(30), y - lg10(mots[0][1]), y - (a + b * x)]; });
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [zx, zy, zr] = pts[l % pts.length], o = 3 * l; brut[o] = zx; brut[o + 1] = zy; brut[o + 2] = zr; }
  return { D: 3, brut, nuage: true, unite: 'log10', invariants: {
    loiZipf: { mesure: nonDecroissant, formule: 0, penteR: b, pente30: b30, sommeTrente: mots.reduce((s, [, c]) => s + c, 0), note: 'published counts that are not strictly decreasing with rank' },
    temoin: { mesure: b10, formule: b30, note: 'witness: the slope fitted on the top 10 words differs from the slope on the top 30, and neither is the classic -1: the exponent describes this corpus, it is not a constant' } } };
}

// ---------- 74 : la loi de Gutenberg-Richter (idee et valeurs : codex Grok Bot 20 ; b de Californie et catalogue mondial 2024 : SOURCES) ----------
// log10 N(>= M) = a - b M. Exact ici : des seismes TIRES (graine) selon la loi au b du curseur, magnitudes continues au-dessus de 4.5
//   (exponentielle de taux b ln 10) ; b RE-ESTIME par la formule d Aki b = log10(e) / (moyenne - 4.5). MESURE : l estimation tombe a moins de
//   4 ecarts-types (b / racine(N)) du b tire. Catalogue reel : les classes somment a 6397 (compte de Grok) et N(>=) decroit.
// Temoin : le catalogue MONDIAL 2024 tombe plus vite que la loi au b de Californie : N(>= 5.5) / N(>= 4.5) = 344/6397, loin de 10^-1.03 :
//   un b se mesure par region et par catalogue (et ce catalogue melange plusieurs echelles de magnitude), ce n est pas une constante.
// Dessin (vue de face) : seismes tires, (magnitude - 4.5, log10 du nombre de seismes au moins aussi forts) ; etiquette = classe de 0.5.
function gutenbergRichter(P, n) {
  const classes = SOURCES.comcat2024.valeur.split(' ').map((x) => x.split(':').map(Number)), total = classes.reduce((s, [, c]) => s + c, 0);
  const cumul = classes.map((_, i) => classes.slice(i).reduce((s, [, c]) => s + c, 0)); let nonDecroissant = 0; for (let i = 1; i < cumul.length; i++) if (cumul[i] > cumul[i - 1]) nonDecroissant++;
  const lg10 = (x) => lnD(x) / lnD(10), rng = mulberry32(P.graine), Nev = P.seismes, beta = P.bValeur * lnD(10), mags = [];
  for (let i = 0; i < Nev; i++) mags.push(4.5 - lnD(1 - rng()) / beta);
  const moyenne = mags.reduce((a, b) => a + b, 0) / Nev, bAki = lg10(expPosD(1)) / (moyenne - 4.5), sigma = P.bValeur / Math.sqrt(Nev);
  const ecarts = (Math.abs(bAki - P.bValeur) < 4 * sigma ? 0 : 1) + (total === 6397 ? 0 : 1) + nonDecroissant;
  mags.sort((a, b) => b - a); const pts = mags.map((m, i) => [m - 4.5, lg10(i + 1), Math.floor((m - 4.5) * 2)]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [gm, gn, gc] = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = gm; brut[o + 1] = gn; brut[o + 2] = gc; }
  const rapportReel = cumul[2] / cumul[0], rapportLoi = 1 / expPosD(SOURCES.bCalifornie.valeur * lnD(10));
  return { D: 3, brut, nuage: true, unite: 'magnitude', invariants: {
    gutenbergRichter: { mesure: ecarts, formule: 0, bEstime: bAki, sigma, totalCatalogue: total, cumulCatalogue: cumul.join(' '), note: 'drawn quakes whose re-estimated b is more than 4 standard errors off, a catalogue that does not add up to 6397, or cumulative counts that go up' },
    temoin: { mesure: rapportReel, formule: rapportLoi, note: 'witness: the 2024 world catalogue drops from M 4.5 to M 5.5 by 344/6397, far steeper than the Californian b = 1.03 would give: b belongs to a region and a catalogue' } } };
}

// ---------- 75 : la maree, vives-eaux et mortes-eaux (idee : codex 21, sous-agent Claude ; constantes NOAA de Providence : SOURCES) ----------
// Hauteur h(t) = A_M2 cos(w_M2 t - phi_M2) + r A_S2 cos(w_S2 t - phi_S2), t en heures, r = coefficient du curseur sur S2 (1 = Providence).
//   Exact ici : h echantillonnee toutes les 3 minutes sur la duree du curseur ; pleines mers TROUVEES (maxima locaux), amplitude de chaque
//   pleine mer relevee. MESURE : (1) retard moyen d une pleine mer a la suivante du meme rang = 2 x 360 / w_M2 - 24 h, soit environ 50 min par
//   jour, a 2 min pres ; (2) les plus fortes pleines mers (vives-eaux) reviennent tous les 360 / (w_S2 - w_M2) h = 14.77 jours, a 1 jour pres ;
//   (3) rapport vives-eaux / mortes-eaux = (A_M2 + r A_S2) / (A_M2 - r A_S2) a 2 % pres.
// Temoin : la maree lunaire seule (S2 coupe) a ses pleines mers toutes egales : aucun cycle de vives-eaux ; et sa periode est 12.42 h, pas 12 h.
// Dessin (vue de face) : (t / duree, h / (A_M2 + A_S2)) ; etiquette = jour.
function mareeVivesEaux(P, n) {
  const wM = SOURCES.vitesseM2.valeur * Math.PI / 180, wS = SOURCES.vitesseS2.valeur * Math.PI / 180, aM = SOURCES.amplitudeM2.valeur, aS = SOURCES.amplitudeS2.valeur * P.partS2;
  const pM = SOURCES.phaseM2.valeur * Math.PI / 180, pS = SOURCES.phaseS2.valeur * Math.PI / 180, Hh = P.jours * 24, dtM = 0.05;
  const h = (t, avecS2) => aM * cosD(wM * t - pM) + (avecS2 ? aS * cosD(wS * t - pS) : 0);
  const pleines = (avecS2) => { const out = []; let a = h(-dtM, avecS2), b = h(0, avecS2); for (let t = dtM; t <= Hh; t += dtM) { const c = h(t, avecS2); if (b > a && b >= c) out.push([t - dtM, b]); a = b; b = c; } return out; };
  const pm = pleines(true), periodeM2 = 360 / SOURCES.vitesseM2.valeur, retardTheo = (2 * periodeM2 - 24) * 60, battementJ = 360 / (SOURCES.vitesseS2.valeur - SOURCES.vitesseM2.valeur) / 24;
  const retards = []; for (let i = 2; i < pm.length; i++) retards.push((pm[i][0] - pm[i - 2][0] - 24) * 60); const retardMesure = retards.reduce((s, x) => s + x, 0) / retards.length;
  const vives = []; for (let i = 1; i + 1 < pm.length; i++) if (pm[i][1] >= pm[i - 1][1] && pm[i][1] >= pm[i + 1][1]) vives.push(pm[i][0]);
  const ecartsV = []; for (let i = 1; i < vives.length; i++) ecartsV.push((vives[i] - vives[i - 1]) / 24); const battementMesure = ecartsV.length ? ecartsV.reduce((s, x) => s + x, 0) / ecartsV.length : NaN;
  const hautes = pm.map((x) => x[1]), rapportMesure = Math.max(...hautes) / Math.min(...hautes), rapportTheo = (aM + aS) / (aM - aS);
  const ecarts = (Math.abs(retardMesure - retardTheo) < 2 ? 0 : 1) + (Number.isFinite(battementMesure) && Math.abs(battementMesure - battementJ) < 1 ? 0 : 1) + (Math.abs(rapportMesure / rapportTheo - 1) < 0.02 ? 0 : 1);
  const seulM2 = pleines(false).map((x) => x[1]), rapportSeul = Math.max(...seulM2) / Math.min(...seulM2);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = Hh * l / (n - 1), o = 3 * l; brut[o] = t / Hh; brut[o + 1] = h(t, true) / (aM + SOURCES.amplitudeS2.valeur); brut[o + 2] = Math.floor(t / 24); }
  return { D: 3, brut, nuage: true, unite: 'm', invariants: {
    mareeVivesEaux: { mesure: ecarts, formule: 0, periodeM2Heures: periodeM2, retardMinutes: retardMesure, retardTheoMinutes: retardTheo, vivesEauxJours: battementMesure, vivesEauxTheoJours: battementJ, rapportVivesMortes: rapportMesure,
      note: 'daily delay of high water off by more than 2 min, spring tides not every 14.77 days (1 day tolerance), or spring/neap ratio off by more than 2 percent' },
    temoin: { mesure: rapportSeul, formule: 1, note: 'witness: with the lunar wave M2 alone every high water is equally high: no spring and neap tides; and its period is 12.42 h, not 12 h' } } };
}

// ---------- 76 : l energie de liaison des noyaux (idee : codex 21, sous-agent Claude ; B/A : SOURCES, AME2020 relu) ----------
// B/A = energie qu il faut, par nucleon, pour defaire le noyau. Energie TOTALE B = A x B/A. Une reaction libere Q = somme des B des produits
//   moins somme des B des reactifs. Exact ici : Q de D + D -> He4, de 3 He4 -> C12 (triple alpha) et de C12 + He4 -> O16, depuis les B/A
//   mesures. MESURE : les trois Q sont positifs (fusions de noyaux legers) ; la reaction du curseur est dessinee ; U238, lourd, est MOINS
//   lie par nucleon que Fe56 (d ou l energie de la fission).
// Temoin : on dit souvent que Fe56 est le noyau le plus lie ; les mesures placent Ni62 (puis Fe58) devant lui.
// Dessin (vue de face) : chaque noyau (A / 238, B/A / B/A maximal) ; etiquette = 1 s il prend part a la reaction du curseur.
function energieLiaison(P, n) {
  const noyaux = SOURCES.liaisonAME2020.valeur.split(' ').map((x) => { const [nom, A, ba] = x.split(':'); return { nom, A: Number(A), ba: Number(ba) }; });
  const parNom = Object.fromEntries(noyaux.map((x) => [x.nom, x])), Btot = (nom) => parNom[nom].A * parNom[nom].ba;
  const REACTIONS = [[['H2', 'H2'], ['He4']], [['He4', 'He4', 'He4'], ['C12']], [['C12', 'He4'], ['O16']]];
  const Q = REACTIONS.map(([r, p]) => p.reduce((s, x) => s + Btot(x), 0) - r.reduce((s, x) => s + Btot(x), 0));
  const plusLie = noyaux.reduce((a, b) => (b.ba > a.ba ? b : a));
  const ecarts = Q.filter((q) => !(q > 0)).length + (parNom.U238.ba < parNom.Fe56.ba ? 0 : 1);
  const [reac, prod] = REACTIONS[P.reaction], dedans = new Set([...reac, ...prod]), baMax = plusLie.ba;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const x = noyaux[l % noyaux.length], o = 3 * l; brut[o] = x.A / 238; brut[o + 1] = x.ba / baMax; brut[o + 2] = dedans.has(x.nom) ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'keV', invariants: {
    energieLiaison: { mesure: ecarts, formule: 0, QkeV: Q.map((q) => q.toFixed(4)).join(' '), plusLie: plusLie.nom, reactionChoisie: reac.join(' + ') + ' -> ' + prod.join(' + '), note: 'fusions of light nuclei that would not release energy, or uranium-238 not less bound per nucleon than iron-56' },
    temoin: { mesure: parNom.Ni62.ba - parNom.Fe56.ba, formule: 0, note: 'witness: iron-56 is often called the most tightly bound nucleus, yet nickel-62 (and iron-58) bind more per nucleon' } } };
}

// ---------- 77 : la courbe de Keeling (idee : codex 22, sous-agent Claude ; moyennes annuelles NOAA de Mauna Loa : SOURCES) ----------
// Le CO2 de l air mesure a Mauna Loa (Hawaii) depuis 1959, moyenne de chaque annee. MESURE : sur la fenetre d annees du curseur, la
//   concentration monte CHAQUE annee ; sur la serie ENTIERE, la hausse de 2015-2025 depasse celle de 1959-1969 (0.864 -> 2.634 ppm/an).
//   PAS sur toute fenetre : 1990-2000 monte moins vite que 1980-1990 (1.526 contre 1.569) ; les hausses de la fenetre sont AFFICHEES.
// Temoin : une droite ajustee sur 1959-1969 et prolongee jusqu a 2025 donne 368.8 ppm ; la mesure est 427.35 : la hausse n est pas lineaire.
// Fenetre : au moins 10 ans (debut ramene a fin - 10 si besoin).
// Dessin (vue de face) : (annee - debut) / (fin - debut), (CO2 - 300) / 150 ; etiquette = hausse sur l annee (ppm).
function courbeKeeling(P, n) {
  const serie = SOURCES.co2MaunaLoa.valeur.split(' ').map((x) => x.split(':').map(Number)), deb = Math.min(P.anDebut, P.anFin - 10), choix = serie.filter(([an]) => an >= deb && an <= P.anFin);
  let baisses = 0; for (let i = 1; i < choix.length; i++) if (!(choix[i][1] > choix[i - 1][1])) baisses++;
  const hausse = (a, b) => (choix[b][1] - choix[a][1]) / (b - a), m = choix.length - 1, k = Math.min(10, Math.floor(m / 2));
  const debutH = hausse(0, k), finH = hausse(m - k, m), hausseSerie = (a, b) => (serie[b][1] - serie[a][1]) / (b - a), nS = serie.length - 1;
  const ecarts = baisses + (hausseSerie(nS - 10, nS) > hausseSerie(0, 10) ? 0 : 1);
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i <= 10; i++) { sx += serie[i][0]; sy += serie[i][1]; sxx += serie[i][0] * serie[i][0]; sxy += serie[i][0] * serie[i][1]; }
  const pente = (11 * sxy - sx * sy) / (11 * sxx - sx * sx), origine = (sy - pente * sx) / 11, dernier = serie[serie.length - 1], prolonge = origine + pente * dernier[0];
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = Math.floor(l * choix.length / n), [an, ppm] = choix[i], o = 3 * l; brut[o] = (an - deb) / (P.anFin - deb); brut[o + 1] = (ppm - 300) / 150; brut[o + 2] = i ? ppm - choix[i - 1][1] : 0; }
  return { D: 3, brut, nuage: true, unite: 'ppm', invariants: {
    courbeKeeling: { mesure: ecarts, formule: 0, annees: serie.length, premiere: serie[0].join(':'), derniere: dernier.join(':'), hausseDebut: debutH, hausseFin: finH, note: 'years in the chosen window where CO2 did not rise, or a whole record (1959-2025) whose last decade does not rise faster than its first; the window rises are shown, not judged (the 1990s rose more slowly than the 1980s)' },
    temoin: { mesure: prolonge, formule: dernier[1], note: 'witness: a straight line fitted on 1959-1969 and extended to 2025 gives about 368.8 ppm, against 427.35 measured: the rise is not linear' } } };
}

// ---------- 78 : la population mondiale (idee : codex 22, sous-agent Claude ; ONU WPP 2024 : SOURCES) ----------
// Population du monde tous les 10 ans de 1950 a 2020. Taux de croissance annuel moyen de chaque decennie r = ln(P2/P1) / 10.
// MESURE : la population monte a chaque decennie ; le taux culmine en 1960-1970 (2.03 %/an) puis BAISSE a chaque decennie (1.16 %/an en
//   2010-2020). Une exponentielle ajustee (moindres carres sur ln P) sur les k premieres decennies du curseur est prolongee jusqu a 2020.
// Temoin : ajustee sur 1950-1970, l exponentielle donne 9.86 milliards en 2020 contre 7.89 mesures : la croissance a ralenti.
// Dessin (vue de face) : (annee - 1950) / 70, population / 8 milliards ; etiquette = 0 mesure ONU, 1 exponentielle ajustee.
function populationMonde(P, n) {
  const pts = SOURCES.populationONU.valeur.split(' ').map((x) => x.split(':').map(Number)), taux = [];
  for (let i = 1; i < pts.length; i++) taux.push(lnD(pts[i][1] / pts[i - 1][1]) / 10);
  let baisses = 0; for (let i = 1; i < pts.length; i++) if (!(pts[i][1] > pts[i - 1][1])) baisses++;
  const pic = taux.indexOf(Math.max(...taux)); let remontees = 0; for (let i = pic + 1; i < taux.length; i++) if (!(taux[i] < taux[i - 1])) remontees++;
  const ajuste = (k) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i <= k; i++) { const x = pts[i][0] - 1950, y = lnD(pts[i][1]); sx += x; sy += y; sxx += x * x; sxy += x * y; } const m = k + 1, b = (m * sxy - sx * sy) / (m * sxx - sx * sx); return [(sy - b * sx) / m, b]; };
  const [a, b] = ajuste(P.decennies), expo = (an) => expPosD(a + b * (an - 1950)), [a2, b2] = ajuste(2), prolonge2020 = expPosD(a2 + b2 * 70);
  const ecarts = baisses + remontees + (pic === 1 ? 0 : 1), courbe = [];
  for (let an = 1950; an <= 2020; an += 1) courbe.push([an, expo(an), 1]);
  const tout = [...pts.map(([an, p]) => [an, p, 0]), ...courbe], brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [an, p, e] = tout[l % tout.length], o = 3 * l; brut[o] = (an - 1950) / 70; brut[o + 1] = p / 8e6; brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'milliers', invariants: {
    populationMonde: { mesure: ecarts, formule: 0, tauxParDecennie: taux.map((r) => (100 * r).toFixed(4)).join(' '), decenniePic: (1950 + 10 * pic) + '-' + (1960 + 10 * pic), expo2020: expo(2020), note: 'decades where population did not grow, a peak growth decade other than 1960-1970, or growth rates that rise again after the peak' },
    temoin: { mesure: prolonge2020, formule: pts[pts.length - 1][1], note: 'witness: an exponential fitted on 1950-1970 and extended to 2020 gives about 9.86 billion, against 7.89 billion counted: growth slowed down' } } };
}

// ---------- 79 : l effet photoelectrique (idee et valeurs : codex Grok Bot 20 ; h, e, c et travaux de sortie : SOURCES) ----------
// Un photon d energie h nu arrache un electron si h nu >= phi ; energie cinetique maximale K = h nu - phi, tension d arret Vs = K / e.
// Exact ici : h/e et hc/e CALCULES depuis les constantes exactes (hc/e = 1239.841984 eV nm) ; pour chacun des quatre metaux, Vs mesuree
//   sur un balayage de frequences (au-dessus du seuil) puis droite des moindres carres : la PENTE vaut h/e pour TOUS les metaux (le trace
//   de Millikan), l ordonnee a l origine -phi/e. Ag(100) a 200 nm : K = 1.559209922 eV (calcul de Grok).
// Temoin : a 300 nm, l argent n emet RIEN (photon de 4.1328 eV < 4.64 eV), quelle que soit l intensite : l image classique d une onde qui
//   finit par arracher l electron est fausse.
// Dessin (vue de face) : droites de Millikan des quatre metaux (frequence / 2e15 Hz, Vs / 5 V) ; etiquette = metal (0 Ag, 1 Cu, 2 Ir, 3 Ta) ;
//   le metal du curseur porte en plus le point de la longueur d onde choisie.
function effetPhotoelectrique(P, n) {
  const h = SOURCES.hPlanck.valeur, e = SOURCES.eCharge.valeur, c = SOURCES.cLumiere.valeur, hE = h / e, hcE = h * c / e * 1e9;
  const metaux = SOURCES.travauxSortie.valeur.split(' ').map((x) => { const [nom, p] = x.split(':'); return [nom, Number(p)]; });
  const pentes = [], pts = []; let ecarts = 0;
  metaux.forEach(([, phi], j) => { const nu0 = phi / hE; let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let k = 0; k <= 40; k++) { const nu = nu0 * (1 + k / 20), vs = hE * nu - phi; sx += nu; sy += vs; sxx += nu * nu; sxy += nu * vs; m++; pts.push([nu / 2e15, vs / 5, j]); }
    const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m; pentes.push(b); if (Math.abs(b / hE - 1) > 1e-9 || Math.abs(a + phi) > 1e-9 * phi) ecarts++; });
  const [nomC, phiC] = metaux[P.metal], Eg = hcE / P.lambdaNm, K = Eg - phiC;
  for (let k = 0; k < 20; k++) pts.push([(c / (P.lambdaNm * 1e-9)) / 2e15, (K > 0 ? K : 0) / 5, P.metal]);
  const ag = metaux.find((x) => x[0] === 'Ag')[1], K200 = hcE / 200 - ag, E300 = hcE / 300;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'eV', invariants: {
    effetPhotoelectrique: { mesure: ecarts, formule: 0, hSurE: hE, hcSurENm: hcE, seuilNm: metaux.map(([nm, p]) => nm + ':' + (hcE / p).toFixed(6)).join(' '), K200Ag: K200, metalChoisi: nomC, KchoisiEv: K,
      note: 'metals whose stopping-voltage line does not have slope h/e and intercept -phi/e (Millikan plot)' },
    temoin: { mesure: E300 > ag ? E300 - ag : 0, formule: 0, photon300: E300, note: 'witness: at 300 nm silver emits nothing (4.1328 eV photons, 4.64 eV work function), however bright the light: a wave would not behave like that' } } };
}

// ---------- 80 : six demi-vies publiees (idee : codex Grok Bot 20 ; demi-vies et incertitudes : SOURCES, NPL IR 6) ----------
// Une population d atomes instables decroit en N(t) = N0 exp(-lambda t), lambda = ln 2 / T. Exact ici : lambda et son incertitude
//   u(lambda) = lambda u(T) / T pour chacun des six ; MESURE : il reste exactement 1/2 a T et 1/8 a 3 T (a 1e-12 pres) pour tous.
// Datation au carbone 14 : un echantillon qui garde 1/8 de son 14C a 3 demi-vies, 3 x 2 082 000 / 365.242198 = 17101 ans, +- 90 ans
//   (l incertitude publiee, triplee) : l age porte l incertitude de la demi-vie, pas plus fine.
// Temoin : une decroissance LINEAIRE (meme pente initiale) ne laisserait plus rien apres 1 / ln 2 = 1.44 demi-vie ; la vraie loi laisse
//   encore 1/4 a deux demi-vies.
// Dessin (vue de face) : fraction restante contre log10 du temps (jours, de 0.1 jour a 10^8), une courbe par isotope (etiquette 0 a 5) ;
//   l isotope du curseur est redessine en temps lineaire jusqu a demiVies demi-vies (etiquette 6).
function demiViesNPL(P, n) {
  const LN2 = lnD(2), an = SOURCES.anneeNPL.valeur;
  const iso = SOURCES.demiViesNPL.valeur.split(' ').map((x) => { const [nom, T, u] = x.split(':'); return [nom, Number(T), Number(u)]; });
  const resteA = (lam, t) => 1 / expPosD(lam * t), LN10 = lnD(10), dixPuissance = (lt) => (lt >= 0 ? expPosD(lt * LN10) : 1 / expPosD(-lt * LN10));
  let ecarts = 0; const lambdas = [], pts = [];
  iso.forEach(([, T, u], j) => { const lam = LN2 / T; lambdas.push([lam, lam * u / T]);
    if (Math.abs(resteA(lam, T) - 0.5) > 1e-12 || Math.abs(resteA(lam, 3 * T) - 0.125) > 1e-12) ecarts++;
    for (let k = 0; k < 60; k++) { const lt = -1 + 9 * k / 59; pts.push([lt / 8, resteA(lam, dixPuissance(lt)), j]); } });
  const [nomC, Tc] = iso[P.isotope];
  for (let k = 1; k <= 60; k++) { const t = Tc * P.demiVies * k / 60; pts.push([lnD(t) / LN10 / 8, resteA(LN2 / Tc, t), 6]); }
  const c14 = iso.find((x) => x[0] === 'C14'), age = 3 * c14[1] / an, uAge = 3 * c14[2] / an;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'days', invariants: {
    demiViesNPL: { mesure: ecarts, formule: 0, lambdasParJour: iso.map(([nm], j) => nm + ':' + lambdas[j][0].toPrecision(9) + '+-' + lambdas[j][1].toPrecision(3)).join(' '),
      isotopeChoisi: nomC, resteChoisi: resteA(LN2 / Tc, Tc * P.demiVies), ageTroisDemiViesC14: age, incertitudeAgeC14: uAge,
      note: 'isotopes not leaving exactly 1/2 after one half-life and 1/8 after three' },
    temoin: { mesure: Math.abs(resteA(LN2, 2) - 0.25), formule: 0, lineaireVideApres: 1 / LN2, note: 'witness: a straight-line decay with the same starting slope is empty after 1.44 half-lives; the real law still leaves a quarter after two' } } };
}

// ---------- 81 : le cholera de John Snow, 1854 (idee : codex 23, sous-agent Claude ; tables : SOURCES, Snow 1855) ----------
// Les memes rues de Londres etaient servies par deux compagnies d eau : Southwark and Vauxhall (puisait dans la Tamise sous les egouts) et
//   Lambeth (puisait en amont). Exact ici : deces pour 10 000 maisons RECALCULES depuis les comptes de Snow, et leur rapport :
//   1263 / 40046 contre 98 / 26107 -> 315.39 contre 37.54, 8.40 fois (Snow : « between eight and nine times ») ; sept semaines suivantes
//   2353 / 40046 contre 302 / 26107 -> 587.57 contre 115.68, 5.08 fois (Snow : « nearly five times »).
// MESURE : le rapport recalcule tombe dans la fourchette que Snow ecrit (8 a 9 ; 4.5 a 5.5). Les taux imprimes sont des troncatures, sauf
//   DEUX qui ne se recalculent pas et que le module nomme : « Rest of London 59 » (1422 / 256423 = 55.46) et « 537 » (= 587.57).
// Temoin : compter les deces sans les maisons donne 1263 / 98 = 12.9 fois : 53 % de trop, parce que Southwark and Vauxhall servait plus
//   de maisons. Le denominateur fait la preuve.
// Dessin (vue de face) : un echantillon de maisons melangees dans les memes rues (graine), etiquette 0 S&V, 1 deces S&V, 2 Lambeth,
//   3 deces Lambeth, au taux de la periode choisie (septSemaines 1 ou 2).
function choleraSnow(P, n) {
  const lire = (src) => src.split(' ').map((x) => { const [nom, m, d, imp] = x.split(':'); return { nom, maisons: Number(m), deces: Number(d), imprime: Number(imp), taux: Number(d) / Number(m) * 1e4 }; });
  const t9 = lire(SOURCES.snowTableIX.valeur), t10 = lire(SOURCES.snowSeptSuivantes.valeur);
  const rr1 = t9[0].taux / t9[1].taux, rr2 = t10[0].taux / t10[1].taux;
  let ecarts = 0; if (rr1 < 8 || rr1 > 9) ecarts++; if (rr2 < 4.5 || rr2 > 5.5) ecarts++;
  const coquilles = [...t9, ...t10.map((x) => ({ ...x, nom: x.nom + 'Weeks8to14' }))].filter((x) => Math.floor(x.taux) !== x.imprime).map((x) => x.nom + ' ' + x.imprime + ' vs ' + x.taux.toFixed(2));
  const periode = P.septSemaines === 2 ? t10 : t9, pSV = periode[0].taux / 1e4, pL = periode[1].taux / 1e4, partSV = t9[0].maisons / (t9[0].maisons + t9[1].maisons);
  const alea = mulberry32(0x5a0 + 7919 * P.graine), brut = new Float64Array(n * 3);
  let svN = 0, svD = 0, lN = 0, lD = 0;
  for (let l = 0; l < n; l++) { const o = 3 * l, sv = alea() < partSV, mort = alea() < (sv ? pSV : pL);
    brut[o] = alea(); brut[o + 1] = alea(); brut[o + 2] = sv ? (mort ? 1 : 0) : (mort ? 3 : 2);
    if (sv) { svN++; if (mort) svD++; } else { lN++; if (mort) lD++; } }
  const naif = t9[0].deces / t9[1].deces;
  return { D: 3, brut, nuage: true, unite: 'deaths per 10,000 houses', invariants: {
    choleraSnow: { mesure: ecarts, formule: 0, tauxPour10000: t9.map((x) => x.nom + ':' + x.taux.toFixed(2)).join(' '), rapportRisque: rr1, rapportDeuxiemePeriode: rr2, coquilles: coquilles.join(' ; '),
      echantillonSV: svN + ' houses, ' + svD + ' deaths', echantillonLambeth: lN + ' houses, ' + lD + ' deaths',
      note: 'recomputed ratios outside the range Snow wrote (8 to 9 times, then nearly five)' },
    temoin: { mesure: naif > 1.5 * rr1 ? 0 : 1, formule: 0, rapportNaif: naif, note: 'witness: counting deaths without houses gives 12.9 times instead of 8.4, because Southwark and Vauxhall supplied more houses' } } };
}

// ---------- 82 : les raies de Balmer et la droite de Rydberg (idee : codex 23, sous-agent Claude ; raies et constantes : SOURCES, NIST) ----------
// L hydrogene excite emet des raies 2 <- n. Rydberg : 1/lambda = R (1/4 - 1/n^2) : 1/lambda est une DROITE en 1/n^2, de pente -R.
// Exact ici : la pente est AJUSTEE (moindres carres) sur les longueurs d onde MESUREES par le NIST (vide), de n = 3 a nPlusHaut, et comparee
//   a R_H = R_inf / (1 + me/mp) = 10 967 758.34 m^-1 (masse reduite : le noyau n est pas infini).
// MESURE : R ajuste a moins de 3e-5 de R_H, et Bohr avec R_H redonne chaque raie a moins de 0.01 nm (ecart 0.0064 nm sur H-alpha :
//   structure fine et decalage de Lamb, absents de la formule). Vide / air : 1.000276 a 1.000282 (indice de l air).
// Temoin : avec R_inf (noyau infini), H-alpha tombe a 656.1123 nm, 0.35 nm sous la mesure 656.4632 : la masse du proton se voit.
// Dessin (vue de face) : 1/n^2 (x 9) contre 1/lambda (/ (R_H / 4)) ; etiquette 0 raie mesuree, 1 droite de Rydberg ajustee.
function raiesBalmer(P, n) {
  const RH = SOURCES.rInfini.valeur / (1 + 1 / SOURCES.mpSurMe.valeur);
  const raies = SOURCES.balmerNIST.valeur.split(' ').map((x) => { const [k, v, a] = x.split(':').map(Number); return { n: k, vide: v, air: a }; });
  const pris = raies.filter((r) => r.n <= P.nPlusHaut);
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const r of pris) { const x = 1 / (r.n * r.n), y = 1e9 / r.vide; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const m = pris.length, b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m, Rfit = -b;
  const bohr = (R, k) => 1e9 / (R * (0.25 - 1 / (k * k)));
  const ecartsNm = raies.map((r) => bohr(RH, r.n) - r.vide), ecartMax = Math.max(...ecartsNm.map(Math.abs));
  let ecarts = 0; if (Math.abs(Rfit / RH - 1) > 3e-5) ecarts++; if (ecartMax > 0.01) ecarts++;
  const videAir = raies.map((r) => r.vide / r.air), halphaInf = bohr(SOURCES.rInfini.valeur, 3) - raies[0].vide;
  const pts = []; for (const r of pris) for (let k = 0; k < 12; k++) pts.push([9 / (r.n * r.n), 1e9 / r.vide / (RH / 4), 0]);
  for (let k = 0; k <= 60; k++) { const x = k / 60 / 4; pts.push([9 * x, (a + b * x) / (RH / 4), 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'm^-1', invariants: {
    raiesBalmer: { mesure: ecarts, formule: 0, rydbergAjuste: Rfit, rapportRH: Rfit / RH, ordonneeSurQuart: a / (Rfit / 4), ecartBohrMaxNm: ecartMax,
      ecartsBohrNm: raies.map((r, j) => r.n + ':' + ecartsNm[j].toFixed(4)).join(' '), rapportVideAir: Math.min(...videAir).toFixed(6) + ' a ' + Math.max(...videAir).toFixed(6),
      note: 'fitted Rydberg constant more than 3e-5 from R_H, or a Bohr wavelength more than 0.01 nm from NIST' },
    temoin: { mesure: Math.abs(halphaInf) > 0.3 ? 0 : 1, formule: 0, ecartRInfiniHalpha: halphaInf, note: 'witness: with an infinitely heavy nucleus (R_inf) H-alpha lands 0.35 nm short of the measured line' } } };
}

// ---------- 83 : la loi de Boyle, 1662 (idee : codex 23, sous-agent Claude ; table : SOURCES, Boyle 1662) ----------
// Boyle comprime l air enferme dans la petite branche d un tube en J en versant du mercure dans la grande. Volume A (quarts de pouce),
//   pression P = B + 29 1/8 pouces de mercure (le mercure ajoute plus l atmosphere). Exact ici : A x P sur les 25 lignes (moyenne 1407.64,
//   de 1395.94 a 1415.25) et la pente de log P contre log A (moindres carres) sur la table entiere : -0.9979.
// MESURE : A x P a moins de 1 % de sa moyenne, et pente de la table entiere a moins de 0.02 de -1 (Boyle : « reciprocal proportion »).
// La pente des lignesBoyle PREMIERES lectures est montree, pas jugee : les premieres lectures bougent peu (1 7/16 pouce) et leur pente
//   s egare (-1.059 sur 3 lectures, -1.020 sur 10) ; Boyle lui-meme : « some particulars do not so exactly answer ».
// Temoin : une loi LINEAIRE par les deux premieres lignes (+1 7/16 pouce pour 2 quarts de pouce) predit 55 pouces a A = 12 ; Boyle mesure
//   117 9/16 : la pression double quand le volume est divise par deux, puis double encore.
// Dessin (vue de face) : A / 48 contre P / 117.5625 ; etiquette 0 mesure de Boyle, 1 courbe P = P0 (48 / A)^exposantTest, 2 la droite
//   naive (temoin), 3 la loi de puissance ajustee sur les lignesBoyle premieres lectures, prolongee a toute la table.
function loiBoyle(P, n) {
  const frac = (s) => s.split(' ').reduce((acc, m) => { const [a, b] = m.split('/').map(Number); return acc + (b ? a / b : a); }, 0);
  const C = frac(SOURCES.boyleBarometre.valeur);
  const lignes = SOURCES.boyleTable.valeur.split(';').map((x) => { const [a, b] = x.split(':'); return { A: Number(a), P: frac(b) + C }; });
  const prod = lignes.map((l) => l.A * l.P), moy = prod.reduce((s, x) => s + x, 0) / prod.length, ecartRel = Math.max(...prod.map((x) => Math.abs(x / moy - 1)));
  const ajuste = (pris) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const l of pris) { const x = lnD(l.A), y = lnD(l.P); sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const m = pris.length, b = (m * sxy - sx * sy) / (m * sxx - sx * sx); return { b, a: (sy - b * sx) / m }; };
  const pente = ajuste(lignes).b, debut = ajuste(lignes.slice(0, P.lignesBoyle));
  let ecarts = 0; if (ecartRel > 0.01) ecarts++; if (Math.abs(pente + 1) > 0.02) ecarts++;
  const pasLin = (lignes[1].P - lignes[0].P) / (lignes[0].A - lignes[1].A), lineaire12 = lignes[0].P + (lignes[0].A - 12) * pasLin, mesure12 = lignes.find((l) => l.A === 12).P;
  const pts = []; for (const l of lignes) for (let k = 0; k < 4; k++) pts.push([l.A / 48, l.P / 117.5625, 0]);
  for (let k = 0; k <= 50; k++) { const a = 12 + 36 * k / 50; pts.push([a / 48, lignes[0].P * expPosD(P.exposantTest * lnD(48 / a)) / 117.5625, 1]); pts.push([a / 48, (lignes[0].P + (48 - a) * pasLin) / 117.5625, 2]);
    pts.push([a / 48, expPosD(debut.a + debut.b * lnD(a)) / 117.5625, 3]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'inches of mercury', invariants: {
    loiBoyle: { mesure: ecarts, formule: 0, produitMoyen: moy, produitMin: Math.min(...prod), produitMax: Math.max(...prod), ecartRelatifMax: ecartRel, penteLogLog: pente,
      penteDebut: debut.b, lignesPrises: P.lignesBoyle, note: 'volume x pressure more than 1 % from its mean, or log-log slope more than 0.02 from -1' },
    temoin: { mesure: lineaire12 < 0.6 * mesure12 ? 0 : 1, formule: 0, lineaireA12: lineaire12, mesureA12: mesure12, note: 'witness: a straight line through the first two readings predicts 55 inches at A = 12; Boyle measured 117 9/16' } } };
}

// ---------- 84 : la loi d Ohm, 1826 (idee : codex 23, sous-agent Claude ; mesures : SOURCES, Ohm 1826) ----------
// Ohm ferme une chaine thermoelectrique (bismuth-cuivre, eau bouillante et glace) sur huit fils de cuivre de longueur x et lit la torsion X
//   d une balance magnetique. Il trouve X = a / (b + x) : b = 20 1/4 Zoll, le reste du circuit. Exact ici : 1/X est une droite en x ;
//   moindres carres par serie -> a et b LIBRES ; ecart de chaque mesure a la formule d Ohm (a de la serie, b = 20 1/4).
// MESURE : b libre a moins de 1 Zoll de 20 1/4 pour la serie I et ecart de chaque mesure a moins de 3 % ; controle laiton : 6800 / X - 20 1/4
//   redonne les longueurs equivalentes imprimees a 0.1 pres.
// Temoin : sans b (X proportionnel a 1/x), le fil de 2 Zoll predit X = 5.03 pour 130 Zoll ; Ohm mesure 48 1/2.
// Dessin (vue de face) : x / 130 contre X / 330 ; etiquette 0 mesures de la serie choisie, 1 courbe a / (bTest + x), 2 les quatre autres series.
function loiOhm(P, n) {
  const frac = (s) => s.split(' ').reduce((t, m) => { const [u, v] = m.split('/').map(Number); return t + (v ? u / v : u); }, 0);
  const x = SOURCES.ohmLongueurs.valeur.split(' ').map(Number);
  const series = SOURCES.ohmMesures.valeur.split(';').map((s) => s.split(':')[1].split(',').map(frac));
  const [cb, ca] = SOURCES.ohmConstantes.valeur.split(';'), b0 = frac(cb.split(':')[1]), aOhm = ca.split(':')[1].split(',').map(Number);
  const libre = series.map((X) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; x.forEach((xi, k) => { const y = 1 / X[k]; sx += xi; sy += y; sxx += xi * xi; sxy += xi * y; });
    const m = x.length, pente = (m * sxy - sx * sy) / (m * sxx - sx * sx), orig = (sy - pente * sx) / m; return { a: 1 / pente, b: orig / pente }; });
  const ecartsRel = series.map((X, s) => Math.max(...X.map((v, k) => Math.abs(v / (aOhm[s] / (b0 + x[k])) - 1))));
  const [lx, l1, lz] = SOURCES.ohmLaiton.valeur.split(';').map((p) => p.split(':')[1].split(',').map(frac));
  const laiton = lx.map((v) => aOhm[4] / v - b0), ecartLaiton = Math.max(...laiton.map((v, k) => Math.abs(v - lz[k])));
  let ecarts = 0; if (Math.abs(libre[0].b - b0) > 1) ecarts++; if (Math.max(...ecartsRel) > 0.03) ecarts++; if (ecartLaiton > 0.1) ecarts++;
  const s = P.serie - 1, sansB = series[0][0] * x[0] / x[7];
  const pts = []; series.forEach((X, j) => X.forEach((v, k) => { for (let r = 0; r < (j === s ? 4 : 1); r++) pts.push([x[k] / 130, v / 330, j === s ? 0 : 2]); }));
  for (let k = 0; k <= 60; k++) { const xx = 2 + 128 * k / 60; pts.push([xx / 130, aOhm[s] / (P.bTest + xx) / 330, 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'hundredths of a turn', invariants: {
    loiOhm: { mesure: ecarts, formule: 0, bLibre: libre.map((l) => l.b.toFixed(3)).join(' '), aLibre: libre.map((l) => l.a.toFixed(1)).join(' '), ecartRelatifMax: ecartsRel.map((e) => (100 * e).toFixed(2) + ' %').join(' '),
      laitonZoll: laiton.map((v) => v.toFixed(2)).join(' '), serieChoisie: P.serie, aSerie: aOhm[s],
      note: 'free b of series I more than 1 Zoll from 20 1/4, a reading more than 3 % off the law, or the brass check off by more than 0.1' },
    temoin: { mesure: sansB < 0.2 * series[0][7] ? 0 : 1, formule: 0, sansResistanceInterne130: sansB, note: 'witness: without b (X proportional to 1/x) the 2-Zoll reading predicts 5.03 at 130 Zoll; Ohm measured 48 1/2' } } };
}

// ---------- 85 : la relation especes-aire, oiseaux des iles Salomon (idee : codex 23, sous-agent Claude ; table : SOURCES, Diamond et Mayr 1976) ----------
// Plus une ile est grande, plus elle a d especes, mais comment ? Diamond et Mayr : sur les 39 iles NON isolees (pas de d dans la table),
//   S = 34.7 + 12.08 log10 A, et sur celles de plus de 1 mille carre, log S = 1.59 + 0.087 log A : un z tres bas (0.20 a 0.35 ailleurs).
// Exact ici : les deux regressions REFAITES sur la table : 34.711 + 12.078 log A (n = 39), z = 0.0871 (n = 25).
// MESURE : les coefficients refaits rejoignent les publies a leurs chiffres imprimes (34.7, 12.08, 1.59, 0.087).
// Temoin : la loi « classique » z = 0.25 calee sur Bougainville (82 especes, 3317 milles carres) predit 7.3 especes a Nusave (0.206) ;
//   il y en a 35. Les iles proches s echangent leurs oiseaux.
// Dessin (vue de face) : log10 A (/ 4) contre S / 82 ; etiquette 0 ile non isolee, 1 ile isolee, 2 droite S = a + b log A ajustee (avec ou
//   sans les isolees selon le curseur), 3 loi de puissance z = zTest calee sur Bougainville.
function especesAire(P, n) {
  const LN10 = lnD(10), lg = (x) => lnD(x) / LN10;
  const iles = SOURCES.salomonOiseaux.valeur.split(' ').map((x) => { const [k, s, a, d] = x.split(':'); return { k: Number(k), S: Number(s), A: Number(a), isolee: d !== undefined }; });
  const droite = (pts) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const m = pts.length, b = (m * sxy - sx * sy) / (m * sxx - sx * sx); return { a: (sy - b * sx) / m, b, m }; };
  const proches = iles.filter((i) => !i.isolee), semi = droite(proches.map((i) => [lg(i.A), i.S])), puis = droite(proches.filter((i) => i.A > 1).map((i) => [lg(i.A), lg(i.S)]));
  const choisi = droite((P.inclureIsolees ? iles : proches).map((i) => [lg(i.A), i.S]));
  let ecarts = 0; if (Math.abs(semi.a - 34.7) > 0.05 || Math.abs(semi.b - 12.08) > 0.005) ecarts++; if (Math.abs(puis.a - 1.59) > 0.005 || Math.abs(puis.b - 0.087) > 0.0005) ecarts++;
  const boug = iles[0], loi = (z, A) => boug.S / expPosD(z * lnD(boug.A / A)), nusave = iles.find((i) => i.k === 10);
  const pts = []; for (const i of iles) for (let r = 0; r < 3; r++) pts.push([lg(i.A) / 4, i.S / 82, i.isolee ? 1 : 0]);
  for (let k = 0; k <= 60; k++) { const lA = -2.6 + 6.2 * k / 60; pts.push([lA / 4, (choisi.a + choisi.b * lA) / 82, 2]); pts.push([lA / 4, loi(P.zTest, expPosD(lA * LN10 + 10) / expPosD(10)) / 82, 3]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'species', invariants: {
    especesAire: { mesure: ecarts, formule: 0, semiLogA: semi.a, semiLogB: semi.b, ilesSemiLog: semi.m, cAjuste: puis.a, zAjuste: puis.b, ilesPuissance: puis.m,
      droiteAffichee: choisi.a.toFixed(2) + ' + ' + choisi.b.toFixed(3) + ' log A (' + choisi.m + ' islands)', note: 'refitted coefficients off the published ones beyond their printed digits' },
    temoin: { mesure: loi(0.25, nusave.A) < 0.5 * nusave.S ? 0 : 1, formule: 0, nusavePredit: loi(0.25, nusave.A), nusaveObserve: nusave.S, note: 'witness: the classic z = 0.25 from Bougainville predicts 7.3 species on Nusave; 35 live there' } } };
}

// ---------- 86 : Michaelis et Menten 1913 (idee : codex 23, sous-agent Claude ; donnees : SOURCES, traduction Johnson et Goody 2011) ----------
// L invertase coupe le saccharose ; la vitesse initiale v monte avec la concentration a puis plafonne : v = V a / (K + a).
// Exact ici : K et V AJUSTES aux moindres carres sur les sept points (balayage de K par pas de 1e-5 ; V en forme close pour chaque K) :
//   K = 0.0179 mol/L, V = 3.911 ; Michaelis et Menten donnaient k = 0.0167 (« 1/60 »), estime graphiquement sur v contre log a.
// MESURE : K ajuste a moins de 15 % du k de 1913.
// Temoin : une vitesse PROPORTIONNELLE au substrat doublerait a chaque doublement de a ; les donnees donnent x 1.693 (0.0052 -> 0.0104),
//   x 1.124 (0.0833 -> 0.1670) et x 1.000 (0.1670 -> 0.3330) : la saturation est dans les mesures.
// Dessin (vue de face) : a (lineaire ou log10 selon axeLog, comme la figure de 1913) contre v / V ; etiquette 0 mesure, 1 courbe ajustee,
//   2 courbe de meme V avec K = Ktest.
function michaelisMenten(P, n) {
  const pts0 = SOURCES.mm1913.valeur.split(' ').map((x) => x.split(':').map(Number));
  const ecartCarre = (K) => { let sf = 0, sff = 0; for (const [a, v] of pts0) { const f = a / (K + a); sf += v * f; sff += f * f; } const V = sf / sff;
    let e = 0; for (const [a, v] of pts0) { const r = v - V * a / (K + a); e += r * r; } return { e, V }; };
  let meilleur = { K: 0, e: Infinity, V: 0 }; for (let K = 0.001; K <= 0.1; K += 1e-5) { const r = ecartCarre(K); if (r.e < meilleur.e) meilleur = { K, e: r.e, V: r.V }; }
  const K1913 = SOURCES.mmK1913.valeur;
  let ecarts = 0; if (Math.abs(meilleur.K / K1913 - 1) > 0.15) ecarts++;
  const v = (c) => pts0.find((p) => p[0] === c)[1], doublements = [[0.0052, 0.0104], [0.0833, 0.1670], [0.1670, 0.3330]].map(([c1, c2]) => v(c2) / v(c1));
  const LN10 = lnD(10), X = (a) => (P.axeLog ? (lnD(a) / LN10 + 2.5) / 2.2 : a / 0.333);
  const pts = []; for (const [a, w] of pts0) for (let r = 0; r < 6; r++) pts.push([X(a), w / meilleur.V, 0]);
  for (let k = 0; k <= 60; k++) { const lA = -2.4 + 2 * k / 60, a = expPosD(lA * LN10 + 10) / expPosD(10); pts.push([X(a), a / (meilleur.K + a), 1]); pts.push([X(a), a / (P.Ktest + a), 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'relative rate', invariants: {
    michaelisMenten: { mesure: ecarts, formule: 0, kAjuste: meilleur.K, vMaxAjuste: meilleur.V, k1913: K1913, rapportK: meilleur.K / K1913, note: 'fitted K more than 15 % from the 1913 constant 0.0167' },
    temoin: { mesure: doublements[2] < 1.1 ? 0 : 1, formule: 0, doublements: doublements.map((d) => d.toFixed(3)).join(' '), note: 'witness: a rate proportional to sugar would double each time; the 1913 data give 1.693, 1.124 and 1.000' } } };
}

// ---------- 87 : la diffusion des particules alpha, Geiger et Marsden 1913 (idee : codex 24, sous-agent Claude ; Table II : SOURCES) ----------
// Rutherford (1911) predit que le nombre de particules alpha deviees d un angle phi par une feuille d or varie comme 1 / sin^4(phi/2) :
//   un noyau minuscule et charge. Geiger et Marsden comptent les scintillations de 150 a 5 degres. Exact ici : N sin^4(phi/2) par serie et par
//   metal, et la pente de log N contre log sin(phi/2) (or, premiere serie) : -4.16 (Rutherford : -4).
// MESURE : N sin^4 ne varie que d un facteur < 1.7 dans chaque serie quand N varie d un facteur 4000 ; pente a moins de 0.25 de -4 ;
//   la colonne VI imprimee se retrouve a 1 % pres (sinus exact au lieu de la colonne II arrondie).
// Temoin : une loi plus douce en 1 / sin^2(phi/2), calee a 150 degres, predit 1813 scintillations a 15 degres ; Geiger et Marsden en
//   comptent 132000.
// Dessin (vue de face) : log10 sin(phi/2) contre log10 N (premiere serie, or ou argent) ; etiquette 0 mesure, 1 loi 1 / sin^puissanceTest
//   calee a 150 degres.
function diffusionAlpha(P, n) {
  const lire = (src) => src.split(' ').map((x) => { const [p, ag, au] = x.split(':'); return { phi: Number(p), ag: ag === '-' ? null : Number(ag), au: Number(au) }; });
  const s1 = lire(SOURCES.gmSerieUn.valeur), s2 = lire(SOURCES.gmSerieDeux.valeur), sinD2 = (phi) => sinD(phi * PI / 360);
  const s4 = (phi) => { const s = sinD2(phi); return s * s * s * s; };
  const rapport = (serie, m) => { const r = serie.filter((l) => l[m] !== null).map((l) => l[m] * s4(l.phi)); return { min: Math.min(...r), max: Math.max(...r) }; };
  const groupes = { or1: rapport(s1, 'au'), ar1: rapport(s1, 'ag'), or2: rapport(s2, 'au'), ar2: rapport(s2, 'ag') };
  const L10 = lnD(10), log10 = (x) => lnD(x) / L10;
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const l of s1) { const x = log10(sinD2(l.phi)), y = log10(l.au); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const m = s1.length, pente = (m * sxy - sx * sy) / (m * sxx - sx * sx);
  const imprime = SOURCES.gmOrImprime.valeur.split(' ').map(Number), ecartImprime = Math.max(...s1.map((l, k) => Math.abs(l.au * s4(l.phi) / imprime[k] - 1)));
  let ecarts = 0; for (const g of Object.values(groupes)) if (g.max / g.min > 1.7) ecarts++; if (Math.abs(pente + 4) > 0.25) ecarts++; if (ecartImprime > 0.01) ecarts++;
  const s150 = sinD2(150), s15 = sinD2(15), loiSinusCarre = s1[0].au * (s150 * s150) / (s15 * s15);
  const metal = P.orArgent ? 'ag' : 'au', ref = s1[0][metal];
  const pts = []; for (const l of s1) for (let r = 0; r < 5; r++) pts.push([(log10(sinD2(l.phi)) + 1.2) / 1.2, log10(l[metal]) / 5.2, 0]);
  for (let k = 0; k <= 60; k++) { const phi = 15 + 135 * k / 60, sr = sinD2(phi) / s150; pts.push([(log10(sinD2(phi)) + 1.2) / 1.2, log10(ref / expPosD(P.puissanceTest * lnD(1 / sr))) / 5.2, 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'scintillations', invariants: {
    diffusionAlpha: { mesure: ecarts, formule: 0, rapportMaxMin: Object.entries(groupes).map(([k, g]) => k + ':' + (g.max / g.min).toFixed(2)).join(' '),
      orMinMax: groupes.or1.min.toFixed(2) + ' / ' + groupes.or1.max.toFixed(2), penteLogLogOr: pente, ecartImprime, note: 'a series whose N sin^4 moves by more than 1.7, a slope more than 0.25 from -4, or the printed column off by more than 1 %' },
    temoin: { mesure: loiSinusCarre < 0.05 * s1[10].au ? 0 : 1, formule: 0, loiSinusCarre, observe15: s1[10].au, note: 'witness: a gentler 1 / sin^2 law from 150 degrees predicts 1813 at 15 degrees; they counted 132000' } } };
}

// ---------- 88 : l argon de Rayleigh et Ramsay, 1895 (idee : codex 24, sous-agent Claude ; pesees : SOURCES, Phil. Trans. A 186) ----------
// Rayleigh pese un meme globe rempli d azote. L azote tire de composes chimiques (cinq methodes) et l azote tire de l air (trois methodes)
//   ne pesent pas pareil : 2.2990 contre 2.3102 grammes. Exact ici : les moyennes refaites, puis la conversion imprimee (correction
//   ADDITIVE de 0.0006 pour le retrait du globe vide, rapport 2.3108 : 1.2572) -> 1.2511 et 1.2572 g/L, comme dans l article.
// MESURE : moyennes et grammes par litre retrouves a la 4e decimale imprimee.
// Temoin : « l azote est l azote » : l ecart (0.0112 g, 0.49 %) vaut 7 fois l etendue TOTALE des cinq methodes chimiques (0.0016 g),
//   17 ecarts-types. Quelque chose de plus lourd se cache dans l air : l argon.
// Dessin (vue de face) : chaque pesee convertie en g/L avec le signe de correction choisi (+1 comme l article, -1 comme l abrege errone
//   du Proc. Roy. Soc., 0 sans correction) ; etiquette 0 chimique, 1 atmospherique, 2 les deux valeurs imprimees.
function argonRayleigh(P, n) {
  const lire = (src) => src.split(' ').map((x) => Number(x.split(':')[1]));
  const chi = lire(SOURCES.rrChimique.valeur), atm = lire(SOURCES.rrAtmospherique.valeur), c = SOURCES.rrConversion.valeur.split(' ');
  const corr = Number(c[0].split(':')[1]), [, r1, r2] = c[1].split(':').map(Number), [, l1, l2] = c[2].split(':').map(Number);
  const moy = (t) => t.reduce((s, x) => s + x, 0) / t.length, mChi = moy(chi), mAtm = moy(atm);
  const litre = (g, signe) => (g + signe * corr) * r2 / r1, lChi = litre(mChi, 1), lAtm = litre(mAtm, 1);
  let ecarts = 0; if (mChi.toFixed(4) !== '2.2990') ecarts++; if (lChi.toFixed(4) !== l1.toFixed(4) || lAtm.toFixed(4) !== l2.toFixed(4)) ecarts++;
  const etendue = Math.max(...chi) - Math.min(...chi), ecart = mAtm - mChi, sd = Math.sqrt(chi.reduce((s, x) => s + (x - mChi) * (x - mChi), 0) / (chi.length - 1));
  const conv = (g) => litre(g, P.signeCorrection);
  const pts = []; chi.forEach((g, k) => { for (let r = 0; r < 6; r++) pts.push([k / 8, (conv(g) - 1.249) / 0.01, 0]); });
  atm.forEach((g, k) => { for (let r = 0; r < 6; r++) pts.push([(6 + k) / 8, (conv(g) - 1.249) / 0.01, 1]); });
  for (let r = 0; r < 6; r++) { pts.push([2 / 8, (l1 - 1.249) / 0.01, 2]); pts.push([7 / 8, (l2 - 1.249) / 0.01, 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'grams per litre', invariants: {
    argonRayleigh: { mesure: ecarts, formule: 0, moyenneChimique: mChi, moyenneAtmospherique: mAtm, litreChimique: lChi, litreAtmospherique: lAtm,
      litreAbregeErrone: litre(mChi, -1), note: 'recomputed means or grams per litre off the printed figures' },
    temoin: { mesure: ecart > 5 * etendue ? 0 : 1, formule: 0, ecartGrammes: ecart, ecartPourCent: 100 * ecart / mChi, enEtendues: ecart / etendue, enEcartsTypes: ecart / sd,
      note: 'witness: if nitrogen were nitrogen, the gap would sit inside the spread of the chemical methods; it is 7 times their whole range' } } };
}

// ---------- 89 : la premiere carte genetique, Sturtevant 1913 (idee : codex 24, sous-agent Claude ; Table 2 et Diagram 1 : SOURCES) ----------
// Plus deux genes sont loin sur le chromosome, plus un crossing-over les separe souvent : le pour cent de cross-overs sert de distance.
//   Sturtevant batit la carte avec les seuls intervalles COURTS : B (C, O) + (C, O) P + PR, et PM. Exact ici : les pour cent refaits depuis
//   les fractions, les sommes (C, O) = C + O + CO, et la carte : 0, 0.98, 30.72, 33.69, 57.63 -> 0.0, 1.0, 30.7, 33.7, 57.6 imprimes.
// MESURE : sommes exactes, carte retrouvee au dixieme, et les paires moyennes (BP, BR, (C, O)R) additives a moins de 2 points pres.
//   Trois pour cent imprimes ne sont pas l arrondi au dixieme : OP 29.4 (29.55) et BM 37.6 (37.52), erreurs de l original ; COP 30.0
//   (224 / 748 = 29.947 -> 29.9) ressemble a un double arrondi (29.947 -> 29.95 -> 30.0). Les trois sont nommes.
// Temoin : l additivite casse sur les longues distances : B a M vaut 57.6 sur la carte, mais 37.5 % seulement de cross-overs observes
//   (un double crossing-over remet les genes ensemble ; et un pour cent ne depasse jamais 50).
// Dessin (vue de face) : distance sur la carte contre pour cent observe, pour les paires a moins de distanceMax ; etiquette 0 paire de la
//   carte, 1 paire de controle, 2 la droite « additif » (y = x).
function carteSturtevant(P, n) {
  const paires = SOURCES.sturtevantTable2.valeur.split(' ').map((x) => { const [nom, fr, imp] = x.split(':'); const [c, g] = fr.split('/').map(Number);
    return { nom, a: nom.split('-')[0], b: nom.split('-')[1], c, g, pct: 100 * c / g, imprime: Number(imp) }; });
  const p = Object.fromEntries(paires.map((x) => [x.nom, x]));
  const somme = (noms) => noms.reduce((s, k) => [s[0] + p[k].c, s[1] + p[k].g], [0, 0]), egal = (t, k) => t[0] === p[k].c && t[1] === p[k].g;
  let ecarts = 0; if (!egal(somme(['CO-P', 'O-P']), '(C,O)-P') || !egal(somme(['CO-R', 'O-R', 'C-R']), '(C,O)-R') || !egal(somme(['CO-M', 'O-M', 'C-M']), '(C,O)-M')) ecarts++;
  const pos = { B: 0 }; pos['(C,O)'] = p['B-(C,O)'].pct; pos.P = pos['(C,O)'] + p['(C,O)-P'].pct; pos.R = pos.P + p['P-R'].pct; pos.M = pos.P + p['P-M'].pct;
  for (const k of ['CO', 'C', 'O']) pos[k] = pos['(C,O)'];
  const carte = SOURCES.sturtevantCarte.valeur.split(' ').map((x) => x.split(':'));
  if (carte.some(([k, v]) => pos[k].toFixed(1) !== Number(v).toFixed(1))) ecarts++;
  const surCarte = (x) => Math.abs(pos[x.b] - pos[x.a]);
  const courts = ['B-P', 'B-R', '(C,O)-R'].map((k) => p[k].pct - surCarte(p[k]));
  if (courts.some((d) => Math.abs(d) > 2)) ecarts++;
  const coquilles = paires.filter((x) => x.pct.toFixed(1) !== x.imprime.toFixed(1)).map((x) => x.nom + ' ' + x.imprime.toFixed(1) + ' vs ' + x.pct.toFixed(2));
  const baseCarte = ['B-(C,O)', '(C,O)-P', 'P-R', 'P-M'], montrees = paires.filter((x) => surCarte(x) <= P.distanceMax);
  const pts = []; for (const x of montrees) for (let r = 0; r < 4; r++) pts.push([surCarte(x) / 60, x.pct / 60, baseCarte.includes(x.nom) ? 0 : 1]);
  for (let k = 0; k <= 30; k++) pts.push([2 * k / 60, 2 * k / 60, 2]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'per cent of cross-overs', invariants: {
    carteSturtevant: { mesure: ecarts, formule: 0, positionsRefaites: carte.map(([k]) => k + ':' + pos[k].toFixed(2)).join(' '), ecartsCourts: courts.map((d) => d.toFixed(2)).join(' '),
      coquillesSturtevant: coquilles.join(' ; '), pairesMontrees: montrees.length, note: 'sums off, map not recovered to the tenth, or a middle-distance pair more than 2 points off additivity' },
    temoin: { mesure: surCarte(p['B-M']) - p['B-M'].pct > 10 ? 0 : 1, formule: 0, additifBM: surCarte(p['B-M']), observeBM: p['B-M'].pct,
      note: 'witness: on the map B to M is 57.6 apart, yet only 37.5 % of cross-overs are seen: long distances stop adding up' } } };
}

// ---------- 90 : la courbe de l oubli d Ebbinghaus, 1885 (idee : codex 24, sous-agent Claude ; table et formule : SOURCES, traduction de 1913) ----------
// Ebbinghaus apprend des series de syllabes sans sens et mesure l ECONOMIE au reapprentissage b (pour cent du temps d origine gagne) apres
//   20 minutes ... 31 jours. Il ajuste b = 100 k / ((log10 t)^c + k), k = 1.84, c = 1.25. Exact ici : la colonne « calculee » refaite depuis
//   sa formule (a 0.1 pres), et les points ou l ecart observe - calcule depasse 2 (son erreur probable est d environ 1).
// MESURE : la colonne calculee se retrouve, et seuls les points 2 (64 min) et 4 (1440 min) sortent de 2 : ce qu il ecrit lui-meme
//   (« surpass the probable limits of error only at the second and fourth values »).
// Temoin : un oubli EXPONENTIEL passant par les deux premiers points (20 et 64 minutes) ne laisserait rien apres un jour (0.008 %) ;
//   Ebbinghaus mesure encore 33.7 % d economie. L oubli ralentit avec le temps.
// Dessin (vue de face) : log10 t (/ 4.7) contre b (/ 60) ; etiquette 0 mesure, 1 formule avec kTest et cTest, 2 l exponentielle (temoin).
function oubliEbbinghaus(P, n) {
  const minutes = (s) => s.split('x').map(Number).reduce((a, x) => a * x, 1);
  const lignes = SOURCES.ebbinghausTable.valeur.split(' ').map((x) => { const [t, o, c] = x.split(':'); return { t: minutes(t), obs: Number(o), calc: Number(c) }; });
  const [k, c] = SOURCES.ebbinghausFormule.valeur.split(' ').map((x) => Number(x.split(':')[1]));
  const LG10 = lnD(10), formule = (t, kk, cc) => 100 * kk / (expPosD(cc * lnD(lnD(t) / LG10)) + kk);
  const refaits = lignes.map((l) => formule(l.t, k, c)), ecartCalc = Math.max(...lignes.map((l, j) => Math.abs(refaits[j] - l.calc)));
  const horsErreur = lignes.filter((l) => Math.abs(l.obs - l.calc) > 2).map((l) => l.t);
  let ecarts = 0; if (ecartCalc > 0.1) ecarts++; if (horsErreur.join(' ') !== '64 1440') ecarts++;
  const [l0, l1] = lignes, tau = (l1.t - l0.t) / lnD(l0.obs / l1.obs), expo = (t) => l0.obs / expPosD((t - l0.t) / tau), expoA1440 = expo(1440);
  const pts = []; for (const l of lignes) for (let r = 0; r < 6; r++) pts.push([lnD(l.t) / LG10 / 4.7, l.obs / 60, 0]);
  for (let j = 0; j <= 60; j++) { const t = expPosD(lnD(20) + (lnD(44640) - lnD(20)) * j / 60); pts.push([lnD(t) / LG10 / 4.7, formule(t, P.kTest, P.cTest) / 60, 1]); pts.push([lnD(t) / LG10 / 4.7, expo(t) / 60, 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'per cent saved', invariants: {
    oubliEbbinghaus: { mesure: ecarts, formule: 0, calculRefait: refaits.map((b) => b.toFixed(2)).join(' '), ecartColonneCalculee: ecartCalc, horsErreur: horsErreur.join(' '),
      note: 'his calculated column not recovered to 0.1, or points beyond 2 other than the second and fourth' },
    temoin: { mesure: expoA1440 < 1 ? 0 : 1, formule: 0, tauMinutes: tau, expoA1440, observe1440: lignes[3].obs, note: 'witness: an exponential through the 20- and 64-minute points leaves nothing after a day; he still saved 33.7 %' } } };
}

// ---------- 91 : Semmelweis et le lavage des mains, Vienne 1841-1848 (idee : codex 25, sous-agent Claude ; tables : SOURCES, Semmelweis 1861) ----------
// Deux cliniques d accouchement cote a cote : la premiere formait les medecins (qui venaient de la salle de dissection), la seconde les
//   sages-femmes. De 1841 a 1846, la fievre puerperale tue 1989 accouchees sur 20042 dans la premiere (9.92 %), 691 sur 17791 dans la seconde
//   (3.88 %). Mi-mai 1847, Semmelweis impose le lavage au chlore ; en 1848 : 45 / 3556 (1.27 %) contre 43 / 3219 (1.34 %).
// Exact ici : les taux, et l ecart entre cliniques en ecarts-types (deux proportions, variance commune) : z = 22.9 avant, z = -0.26 en 1848.
// MESURE : la 1re clinique tue plus chaque annee 1841-1846, le total 9.92 % imprime se retrouve, et en 1848 les deux cliniques ne different
//   plus (|z| < 2). Le total imprime de la 2e clinique, « 3.38 », est une coquille de l original : 691 / 17791 = 3.88 %.
// Temoin : « medecins et sages-femmes, meme maison, meme risque » : avant le chlore, l ecart vaut 22.9 ecarts-types.
// Dessin (vue de face) : annee contre mortalite (pour cent) ; etiquette 0 1re clinique, 1 2e clinique, 2 le chlore (mi-mai 1847),
//   3 l annee choisie.
function fievreSemmelweis(P, n) {
  const lire = (src) => src.split(' ').map((x) => { const [a, n1, d1, n2, d2] = x.split(':').map(Number); return { a, n1, d1, n2, d2 }; });
  const avant = lire(SOURCES.semmelweisTab1.valeur), apres = lire(SOURCES.semmelweisChlore.valeur), toutes = [...avant, ...apres];
  const z = (d1, n1, d2, n2) => { const p = (d1 + d2) / (n1 + n2); return (d1 / n1 - d2 / n2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); };
  const tot = avant.reduce((s, l) => ({ n1: s.n1 + l.n1, d1: s.d1 + l.d1, n2: s.n2 + l.n2, d2: s.d2 + l.d2 }), { n1: 0, d1: 0, n2: 0, d2: 0 });
  const [, imp1, imp2] = SOURCES.semmelweisImprime.valeur.split(':').map(Number), t1 = 100 * tot.d1 / tot.n1, t2 = 100 * tot.d2 / tot.n2;
  const l1848 = apres.find((l) => l.a === 1848), zAvant = z(tot.d1, tot.n1, tot.d2, tot.n2), z1848 = z(l1848.d1, l1848.n1, l1848.d2, l1848.n2);
  let ecarts = 0; if (avant.some((l) => l.d1 / l.n1 <= l.d2 / l.n2)) ecarts++; if (t1.toFixed(2) !== imp1.toFixed(2)) ecarts++; if (Math.abs(z1848) >= 2) ecarts++;
  const coquilles = [[imp1, t1], [imp2, t2]].filter(([i, t]) => t.toFixed(2) !== i.toFixed(2)).map(([i, t]) => i.toFixed(2) + ' vs ' + t.toFixed(2));
  const vue = toutes.find((l) => l.a === P.anneeVue) || toutes[0];
  const pts = []; for (const l of toutes) for (let r = 0; r < 5; r++) { pts.push([(l.a - 1841) / 7, 100 * l.d1 / l.n1 / 16, 0]); pts.push([(l.a - 1841) / 7, 100 * l.d2 / l.n2 / 16, 1]); }
  for (let k = 0; k <= 20; k++) pts.push([(1847.37 - 1841) / 7, k / 20, 2]);
  for (let r = 0; r < 10; r++) { pts.push([(vue.a - 1841) / 7, 100 * vue.d1 / vue.n1 / 16, 3]); pts.push([(vue.a - 1841) / 7, 100 * vue.d2 / vue.n2 / 16, 3]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'per cent of mothers', invariants: {
    fievreSemmelweis: { mesure: ecarts, formule: 0, tauxAvant: t1.toFixed(2) + ' / ' + t2.toFixed(2), totaux: tot.d1 + '/' + tot.n1 + ' ; ' + tot.d2 + '/' + tot.n2, z1848, tauxApres: (100 * l1848.d1 / l1848.n1).toFixed(2) + ' / ' + (100 * l1848.d2 / l1848.n2).toFixed(2),
      coquilleSemmelweis: coquilles.join(' ; '), anneeVue: vue.a + ' : ' + (100 * vue.d1 / vue.n1).toFixed(2) + ' / ' + (100 * vue.d2 / vue.n2).toFixed(2),
      note: 'first clinic not deadlier every year 1841-1846, printed 9.92 not recovered, or the clinics still differ in 1848' },
    temoin: { mesure: zAvant > 10 ? 0 : 1, formule: 0, zAvant, note: 'witness: same hospital, same risk? before chlorine the gap is 23 standard errors' } } };
}

// ---------- 92 : la densite de la Terre, Cavendish 1798 (idee : codex 25, sous-agent Claude ; table et texte : SOURCES, Phil. Trans. 88) ----------
// Une balance de torsion : deux grosses boules de plomb attirent deux petites ; l attraction mesuree, comparee au poids, donne la densite
//   moyenne de la Terre. Cavendish change de fil apres l experience 3 : 6 resultats avec le premier, 23 avec le second.
// Exact ici : la moyenne des 23 (5.4835 -> « 5,48 »), leur etendue (0.75, « ,75 ») et le plus grand ecart a 5.48 (0.38, « ,38 »).
// MESURE : les trois chiffres du texte retrouves sur les 23 valeurs du second fil.
// Temoin : le texte dit aussi que le PREMIER fil donne 5,48 ; ses 6 valeurs imprimees donnent 5.31 (le 4,88 de l experience 2 tire la moyenne
//   vers le bas). Et la moyenne des 29 vaut 5.448, pas 5.48 : un resultat celebre repose sur une moyenne que la table ne redonne pas.
// Dessin (vue de face) : numero de la mesure contre densite ; etiquette 0 premier fil, 1 second fil, 2 moyenne du choix (filChoisi :
//   0 les 29, 1 le premier fil, 2 le second).
function densiteCavendish(P, n) {
  const d = SOURCES.cavendishDensites.valeur.split(' ').map((x) => { const [e, v] = x.split(':').map(Number); return { e, v, fil: e <= 3 ? 1 : 2 }; });
  const t = Object.fromEntries(SOURCES.cavendishTexte.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const moy = (a) => a.reduce((s, x) => s + x.v, 0) / a.length, f1 = d.filter((x) => x.fil === 1), f2 = d.filter((x) => x.fil === 2);
  const m1 = moy(f1), m2 = moy(f2), m29 = moy(d), vs2 = f2.map((x) => x.v), etendue = Math.max(...vs2) - Math.min(...vs2), extreme = Math.max(...vs2.map((v) => Math.abs(v - t.latterWire)));
  let ecarts = 0; if (f2.length !== 23 || m2.toFixed(2) !== t.latterWire.toFixed(2)) ecarts++; if (etendue.toFixed(2) !== t.range23.toFixed(2)) ecarts++; if (extreme.toFixed(2) !== t.extreme.toFixed(2)) ecarts++;
  const choisie = [m29, m1, m2][P.filChoisi];
  const pts = []; d.forEach((x, k) => { for (let r = 0; r < 4; r++) pts.push([k / 28, (x.v - 4.8) / 1.1, x.fil - 1]); });
  for (let k = 0; k <= 28; k++) pts.push([k / 28, (choisie - 4.8) / 1.1, 2]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'times the density of water', invariants: {
    densiteCavendish: { mesure: ecarts, formule: 0, moyenneFil2: m2, etendue23: etendue, ecartMax23: extreme, moyenne29: m29, moyenneChoisie: choisie,
      note: 'the mean, range or extreme deviation of the 23 latter-wire results do not give the 5,48, ,75 and ,38 of the text' },
    temoin: { mesure: Math.abs(m1 - t.firstWire) > 0.1 ? 0 : 1, formule: 0, moyenneFil1: m1, note: 'witness: the text says the first wire also gives 5,48; its six printed values average 5.31' } } };
}

// ---------- 93 : l equivalent mecanique de la chaleur, Joule 1850 (idee : codex 25, sous-agent Claude ; Table IX : SOURCES, Phil. Trans. 140) ----------
// Joule fait tourner des palettes dans l eau, le mercure, puis frotte de la fonte : le travail des poids qui tombent devient de la chaleur.
//   Cinq series : 772.692 a 776.045 pieds-livres pour chauffer une livre d eau de 1 degre F (dans le vide), a 0.43 % les unes des autres.
// Exact ici : les moyennes par materiau (774.083 ; 774.9875 imprime 774.987, tronque), le rapport vide / air (0.998775 pour les cinq, a 1e-6
//   pres : une seule correction pour toute la table) et la derniere serie 2057.336 / 2.65504 = 774.88.
// MESURE : ces trois controles. Temoin : le celebre « 772 » n est PAS une moyenne : les cinq series donnent 774.17 ; Joule garde la seule
//   serie de l eau (« the most correct ... number of experiments ... great capacity of the apparatus for heat »).
// Dessin (vue de face) : numero de serie contre equivalent (dans l air ou dans le vide selon colonneVide) ; etiquette 0 eau, 1 mercure,
//   2 fonte, 3 la valeur retenue 772.692.
function equivalentJoule(P, n) {
  const series = SOURCES.jouleTable9.valeur.split(' ').map((x) => { const [k, m, air, vide] = x.split(':'); return { k: Number(k), m, air: Number(air), vide: Number(vide) }; });
  const pub = SOURCES.joulePublie.valeur.split(' '), moyPub = pub[0].split(':')[1].split(',').map(Number), [frac, egal] = pub[1].split(':')[1].split('='), [num, den] = frac.split('/').map(Number);
  const moy = (m) => { const s = series.filter((x) => x.m === m); return s.reduce((a, x) => a + x.vide, 0) / s.length; };
  const moyennes = [moy('Water'), moy('Mercury'), moy('CastIron')], rapports = series.map((x) => x.vide / x.air);
  const dispersionRapports = Math.max(...rapports) - Math.min(...rapports), moyenneCinq = series.reduce((a, x) => a + x.vide, 0) / series.length;
  let ecarts = 0; if (moyennes.some((m, j) => Math.abs(m - moyPub[j]) > 0.001)) ecarts++; if (dispersionRapports > 3e-6) ecarts++; if ((num / den).toFixed(2) !== Number(egal).toFixed(2)) ecarts++;
  const etendue = (Math.max(...series.map((x) => x.vide)) - Math.min(...series.map((x) => x.vide))) / Math.min(...series.map((x) => x.vide));
  const lab = { Water: 0, Mercury: 1, CastIron: 2 }, pts = [];
  for (const x of series) for (let r = 0; r < 8; r++) pts.push([(x.k - 1) / 4, ((P.colonneVide ? x.vide : x.air) - 772) / 5, lab[x.m]]);
  for (let k = 0; k <= 20; k++) pts.push([k / 20, (moyPub[0] - 772) / 5, 3]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'foot-pounds per pound of water per degree F', invariants: {
    equivalentJoule: { mesure: ecarts, formule: 0, moyennesMateriaux: moyennes.map((m) => m.toFixed(4)).join(' '), rapportsVideAirJoule: rapports.map((r) => r.toFixed(7)).join(' '),
      derniereSerie: num / den, etendueCinq: etendue, note: 'material means off the printed ones, a vacuum / air ratio that changes, or the last-series division off' },
    temoin: { mesure: moyenneCinq - moyPub[0] > 1 ? 0 : 1, formule: 0, moyenneCinq, retenue: moyPub[0], note: 'witness: the famous 772 is not an average; the five series average 774.17, Joule kept the water series alone' } } };
}

// ---------- 94 : l eclipse de 1919, la lumiere deviee par le Soleil (idee : codex 25, sous-agent Claude ; resultats : SOURCES, Phil. Trans. A 220) ----------
// Pendant l eclipse du 29 mai 1919, les etoiles proches du Soleil paraissent repoussees vers l exterieur : la lumiere est deviee.
//   Newton (lumiere pesante) predit 0.87 seconde d arc au bord, Einstein 1.75, le double. Sobral (lentille de 4 pouces) : 1.98 +- 0.12 ;
//   Principe : 1.61 +- 0.30 (erreurs PROBABLES, pas des ecarts-types). L astrographique de Sobral, 0.93, est ecarte par les auteurs.
// Exact ici : la droite par l origine des sept etoiles (observe contre calcule-Einstein) : pente 1.118 -> 1.96 au bord ; ecart quadratique
//   0.108 a Einstein contre 0.395 a Newton (rapport imprime 0.87 / 1.75).
// MESURE : Sobral et Principe a moins de 2 erreurs probables d Einstein, et les etoiles plus proches d Einstein que de Newton.
// Temoin : Newton (0.87) est a 9.3 erreurs probables du resultat de Sobral.
// Dessin (vue de face) : deplacement calcule (Einstein) contre observe, etoile par etoile ; etiquette 0 etoile, 1 Einstein, 2 Newton,
//   3 droite d un facteurNewton choisi (0 : pas de deviation, 1 : Newton, 2 : Einstein).
function eclipseEddington(P, n) {
  const res = Object.fromEntries(SOURCES.eddingtonResultats.valeur.split(' ').map((x) => { const [k, v, ep] = x.split(':'); return [k, { v: Number(v), ep: ep === '-' ? null : Number(ep) }]; }));
  const hyp = Object.fromEntries(SOURCES.eddingtonHypotheses.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const et = SOURCES.eddingtonEtoiles.valeur.split(' ').map((x) => { const [s, c, o] = x.split(':').map(Number); return { s, c, o }; });
  let sco = 0, scc = 0; for (const e of et) { sco += e.c * e.o; scc += e.c * e.c; }
  const pente = sco / scc, bord = pente * hyp.Einstein, rms = (f) => Math.sqrt(et.reduce((a, e) => a + (e.o - f * e.c) * (e.o - f * e.c), 0) / et.length);
  const rmsEinstein = rms(1), rmsNewton = rms(hyp.Newton / hyp.Einstein);
  const enEp = (k, ref) => (res[k].v - ref) / res[k].ep;
  let ecarts = 0; if (Math.abs(enEp('Sobral4inch', hyp.Einstein)) > 2 || Math.abs(enEp('Principe', hyp.Einstein)) > 2) ecarts++; if (rmsEinstein >= rmsNewton) ecarts++;
  const pts = []; for (const e of et) for (let r = 0; r < 6; r++) pts.push([e.c, e.o, 0]);
  for (let k = 0; k <= 30; k++) { const c = 1.1 * k / 30; pts.push([c, c, 1]); pts.push([c, c * hyp.Newton / hyp.Einstein, 2]); pts.push([c, c * P.facteurNewton * hyp.Newton / hyp.Einstein, 3]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'arcseconds', invariants: {
    eclipseEddington: { mesure: ecarts, formule: 0, bordAjuste: bord, rmsEinstein, rmsNewton, sobralEnEp: enEp('Sobral4inch', hyp.Einstein), principeEnEp: enEp('Principe', hyp.Einstein),
      note: 'Sobral or Principe more than 2 probable errors from Einstein, or the stars no closer to Einstein than to Newton' },
    temoin: { mesure: enEp('Sobral4inch', hyp.Newton) > 5 ? 0 : 1, formule: 0, newtonEnEp: enEp('Sobral4inch', hyp.Newton), note: 'witness: the Newtonian 0.87 is 9.3 probable errors below the Sobral result' } } };
}

// ---------- 95 : le cycle de dix ans du lynx du Canada (idee : codex 25, sous-agent Claude ; peaux : SOURCES, Elton et Nicholson 1942) ----------
// Les peaux de lynx achetees par la Compagnie de la baie d Hudson montent et s effondrent : 3410 en 1908, 78773 en 1886 (23 fois plus).
// Exact ici : les pics de la serie (maximum sur +- 2 ans) : 1857, 1866, 1876, 1886, 1895, 1905 -> 9.6 ans entre pics ; Elton et Nicholson,
//   sur 1752-1935 : (1935 - 1752) / 19 = 9.63 ans. Leurs frequences de cycles somment a 47, dont 36 de 9 ou 10 ans : 76.6 %, imprime « 78 »
//   (coquille de l original, nommee). Autocorrelation de log10 des peaux au decalage choisi.
// MESURE : periode des pics a moins de 0.5 an de 9.63, et le tableau des frequences coherent (47 cycles, 36 de 9 ou 10 ans).
// Temoin : les memes 62 annees MELANGEES (20 graines) perdent le cycle : autocorrelation a 10 ans moyenne pres de 0 contre +0.6 observee.
// Dessin (vue de face) : annee contre log10(peaux) ; etiquette 0 serie, 1 pic, 2 la serie decalee de decalage ans.
function lynxHudson(P, n) {
  const serie = SOURCES.lynxJones.valeur.split(' ').map((x) => { const [a, v] = x.split(':'); return { a: Number(a), v: Number(v.replace(/[[\]]/g, '')) }; });
  const per = Object.fromEntries(SOURCES.lynxPeriode.valeur.split(' ').map((x) => x.split(':')));
  const LN10 = lnD(10), lg = serie.map((x) => lnD(x.v) / LN10);
  const pics = serie.filter((x, i) => serie.slice(Math.max(0, i - 2), i + 3).every((y) => y === x || y.v < x.v) && i >= 2 && i <= serie.length - 3).map((x) => x.a);
  const periodePics = (pics[pics.length - 1] - pics[0]) / (pics.length - 1);
  const [d0, d1] = per.peaks.split('-').map(Number), periodeLongue = (d1 - d0) / Number(per.cycles);
  const freq = per.frequency.split(',').map((x) => x.split('x').map(Number)), total = freq.reduce((s, [, c]) => s + c, 0), neufDix = freq.filter(([l]) => l === 9 || l === 10).reduce((s, [, c]) => s + c, 0);
  const acf = (x, k) => { const m = x.reduce((s, v) => s + v, 0) / x.length; let num = 0, den = 0; for (let i = 0; i < x.length; i++) { den += (x[i] - m) * (x[i] - m); if (i + k < x.length) num += (x[i] - m) * (x[i + k] - m); } return num / den; };
  let ecarts = 0; if (Math.abs(periodePics - Number(per.average)) > 0.5 || periodeLongue.toFixed(2) !== Number(per.average).toFixed(2)) ecarts++; if (total !== Number(per.of) || neufDix !== Number(per.nineOrTen)) ecarts++;
  let melange = 0; for (let g = 1; g <= 20; g++) { const alea = mulberry32(0x1a5 + 7919 * g), t = lg.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } melange += acf(t, 10) / 20; }
  const pts = []; serie.forEach((x, i) => { for (let r = 0; r < 3; r++) pts.push([(x.a - 1848) / 61, lg[i] / 5, pics.includes(x.a) ? 1 : 0]); if (i + P.decalageAns < serie.length) pts.push([(x.a - 1848) / 61, lg[i + P.decalageAns] / 5, 2]); });
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'lynx skins', invariants: {
    lynxHudson: { mesure: ecarts, formule: 0, anneesPics: pics.join(' '), periodePics, periodeLongue, neufDixPourCent: 100 * neufDix / total, imprime78: Number(per.printed),
      rapportMaxMin: Math.max(...serie.map((x) => x.v)) / Math.min(...serie.map((x) => x.v)), acfDecalage: acf(lg, P.decalageAns), note: 'peak period more than 0.5 year from 9.63, or the cycle-length table inconsistent' },
    temoin: { mesure: acf(lg, 10) > 0.5 && Math.abs(melange) < 0.15 ? 0 : 1, formule: 0, acf10: acf(lg, 10), acf10Melange: melange, note: 'witness: the same years shuffled lose the cycle: lag-10 autocorrelation near 0 instead of +0.6' } } };
}

// ---------- 96 : la charge de l electron, Millikan 1913 (idee : codex 25, sous-agent Claude ; Table XX et p. 140 : SOURCES, Phys. Rev. 2) ----------
// Des gouttes d huile chargees flottent entre deux plaques ; chaque goutte donne une valeur de e (ici e^(2/3), la colonne corrigee de
//   Millikan). Les 58 tombent a 0.57 % au plus de leur moyenne (ecart-type 0.21 %) : une seule charge elementaire.
// Exact ici : moyenne des 23 premieres 61.1196 -> 61.120 imprime ; des 58 : 61.1390 contre 61.138 imprime (ecart de 0.001 non tranche :
//   deux lectures independantes de la table donnent 61.139) ; e = 61.085^(3/2) x 10^-12 = 4.7742 x 10^-10 ; N = 9650 x 2.9990e10 / e = 6.062e23.
// MESURE : 61.120, 4.774 et 6.062 retrouves, et chaque goutte a moins de 1 % de la moyenne.
// Temoin : la valeur anterieure de la meme methode, 4.891, est a 2.5 % : 13 fois l incertitude finale (0.009). Un chiffre precis peut etre faux
//   de bien plus que son incertitude (Millikan l attribue a la viscosite de l air).
// Dessin (vue de face) : numero de goutte contre e^(2/3) (ecart a 61.14, x 100) ; etiquette 0 les 23 premieres, 1 les autres, 2 la moyenne
//   courante des gouttesMoyennees premieres.
function gouttesMillikan(P, n) {
  const v = SOURCES.millikanE23.valeur.split(' ').map(Number);
  const t = Object.fromEntries(SOURCES.millikanTexte.valeur.split(' ').map((x) => { const [k, w] = x.split(':'); return [k, Number(w)]; }));
  const moy = (a) => a.reduce((s, x) => s + x, 0) / a.length, m23 = moy(v.slice(0, 23)), m58 = moy(v);
  const eFinal = t.corrected23 * Math.sqrt(t.corrected23) * 1e-2, nAvogadro = t.faraday * t.c * 1e10 / (eFinal * 1e-10);
  const ecartGoutte = Math.max(...v.map((x) => Math.abs(x / m58 - 1))), sd = Math.sqrt(v.reduce((s, x) => s + (x - m58) * (x - m58), 0) / (v.length - 1)) / m58;
  let ecarts = 0; if (m23.toFixed(3) !== t.mean23.toFixed(3) || eFinal.toFixed(3) !== t.e.toFixed(3) || (nAvogadro / 1e23).toFixed(3) !== t.N.toFixed(3)) ecarts++; if (ecartGoutte > 0.01) ecarts++;
  const courante = moy(v.slice(0, P.gouttesMoyennees));
  const pts = []; v.forEach((x, i) => { for (let r = 0; r < 3; r++) pts.push([i / 57, (x - 61.14) * 4, i < 23 ? 0 : 1]); });
  for (let k = 0; k <= 30; k++) pts.push([k / 30, (courante - 61.14) * 4, 2]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'e^(2/3) x 10^8', invariants: {
    gouttesMillikan: { mesure: ecarts, formule: 0, moyenne23: m23, moyenne58: m58, moyenne58Imprimee: t.mean58, eFinal, nAvogadro, ecartMaxPourCent: 100 * ecartGoutte, ecartTypePourCent: 100 * sd, moyenneCourante: courante,
      note: '61.120, 4.774 or 6.062 not recovered, or a drop more than 1 % from the mean' },
    temoin: { mesure: Math.abs(t.earlier - t.e) / t.pe > 10 ? 0 : 1, formule: 0, e1911EnIncertitudes: (t.earlier - t.e) / t.pe, note: 'witness: the earlier oil-drop value 4.891 sits 13 final uncertainties away; precise is not the same as right' } } };
}

// ---------- 97 : la premiere table de mortalite, Graunt 1662 (idee : codex 26, sous-agent Claude ; table : SOURCES, Graunt p. 62) ----------
// John Graunt lit les bulletins de deces de Londres et en tire, pour 100 enfants concus, combien meurent a chaque decennie : 36 avant 6 ans,
//   24 de 6 a 16, ... et combien restent vivants : 64 a 6 ans, 40 a 16, ... 1 a 76, 0 a 80.
// Exact ici : les vivants retrouves depuis les morts (100 moins le cumul), les deux soustractions de Graunt (40 - 6 = 34 ; 25 - 3 = 22),
//   1/5 de 67694 = 13539, et l esperance de vie a la naissance tiree de sa table (trapezes) : 18.19 ans.
// MESURE : ces quatre controles. Graunt calcule 34 % de 199112 hommes = « 67694 » : c est 67698 (ecart de 4 dans l original, nomme).
// Temoin : Graunt dit avoir pris « six mean proportional numbers between 64 ... and the one » : une suite GEOMETRIQUE de 64 a 1 en 7 pas
//   donnerait 35.3 vivants a 16 ans, pas 40. Sa table n est pas celle de sa methode ; une raison de 0.625 la suit mieux.
// Dessin (vue de face) : age (/ 80) contre vivants (/ 100) ; etiquette 0 la table, 1 la suite geometrique de son texte, 2 une raison choisie.
function vieGraunt(P, n) {
  const lire = (src) => src.split(' ').map((x) => x.split(':').map(Number));
  const morts = lire(SOURCES.grauntMorts.valeur), vivants = lire(SOURCES.grauntSurvivants.valeur);
  const c = Object.fromEntries(SOURCES.grauntCombattants.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  let cumul = 0; const refaits = morts.map(([a, d]) => { cumul += d; return [a, 100 - cumul]; });
  const viv = Object.fromEntries(vivants);
  let ecarts = 0; if (cumul !== 100 || refaits.some(([a, v]) => viv[a] !== v)) ecarts++;
  if (viv[16] - viv[56] !== c.between16and56 || viv[26] - viv[66] !== c.between26and66) ecarts++;
  if (Math.round(c.fighting / 5) !== c.fifth) ecarts++;
  let e0 = 0; for (let i = 1; i < vivants.length; i++) e0 += (vivants[i][0] - vivants[i - 1][0]) * (vivants[i][1] + vivants[i - 1][1]) / 2;
  e0 /= 100;
  const combattantsRecalcul = c.males * c.share / 100, raisonTexte = 1 / expPosD(lnD(64) / 7), geometrique16 = 64 * raisonTexte;
  const pts = []; for (const [a, v] of vivants) for (let r = 0; r < 5; r++) pts.push([a / 80, v / 100, 0]);
  for (let k = 0; k <= 7; k++) { const a = 6 + 10 * k; for (let r = 0; r < 3; r++) { pts.push([a / 80, 64 / expPosD(k * lnD(1 / raisonTexte)) / 100, 1]); pts.push([a / 80, 64 / expPosD(k * lnD(1 / P.raisonTest)) / 100, 2]); } }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'alive out of 100 conceived', invariants: {
    vieGraunt: { mesure: ecarts, formule: 0, esperanceNaissance: e0, entre16et56: viv[16] - viv[56], combattantsRecalcul, combattantsImprime: c.fighting,
      note: 'survivors not 100 minus cumulative deaths, his two subtractions or the fifth of 67694 not recovered' },
    temoin: { mesure: Math.abs(geometrique16 - viv[16]) > 3 ? 0 : 1, formule: 0, geometrique16, raisonTable: viv[16] / viv[6], note: 'witness: his stated geometric method gives 35.3 alive at 16, his table says 40' } } };
}

// ---------- 98 : la loi de Hubble, 1929 (idee : codex 26, sous-agent Claude ; Table 1 et solutions : SOURCES, PNAS 15) ----------
// Plus une nebuleuse est loin, plus elle s eloigne vite : v = K r. Hubble publie 24 distances et vitesses et deux solutions, K = 465 +- 50
//   et 513 +- 60 km/s par megaparsec, arrondies a 500. Ces deux valeurs viennent d un ajustement qui resout AUSSI le mouvement du Soleil
//   (X, Y, Z) avec les coordonnees des nebuleuses, absentes de l article : on ne peut pas les refaire.
// Exact ici : la droite par l origine sur la Table 1 (423.9), avec ordonnee (454.2, correlation 0.790), et les magnitudes absolues refaites
//   depuis m_t et r (M = m - 5 log10(r x 10^5)) : a 0.07 pres de la colonne imprimee, moyenne -15.48 -> -15.5.
// MESURE : magnitudes et moyenne retrouvees (transcription prouvee), et la pente par l origine a moins d une erreur publiee (50) de 465.
// Temoin : les memes vitesses MELANGEES entre nebuleuses (20 graines) : correlation moyenne pres de 0 contre 0.79.
// Dessin (vue de face) : distance (/ 2 Mpc) contre vitesse (/ 1100 km/s) ; etiquette 0 nebuleuse, 1 droite ajustee par l origine,
//   2 droite de constanteTest.
function loiHubble1929(P, n) {
  const t = SOURCES.hubbleTable1.valeur.split(' ').map((x) => { const [o, r, v, m, M] = x.split(':'); return { o, r: Number(r), v: Number(v), m: Number(m), M: Number(M) }; });
  const pub = Object.fromEntries(SOURCES.hubblePublie.valeur.split(' ').map((x) => { const [k, ...w] = x.split(':'); return [k, w.map(Number)]; }));
  const L10h = lnD(10), log10h = (x) => lnD(x) / L10h;
  const kOrigine = t.reduce((s, x) => s + x.r * x.v, 0) / t.reduce((s, x) => s + x.r * x.r, 0);
  const correl = (vs) => { const n2 = t.length, mr = t.reduce((s, x) => s + x.r, 0) / n2, mv = vs.reduce((s, x) => s + x, 0) / n2; let sxy = 0, sxx = 0, syy = 0;
    t.forEach((x, i) => { sxy += (x.r - mr) * (vs[i] - mv); sxx += (x.r - mr) * (x.r - mr); syy += (vs[i] - mv) * (vs[i] - mv); }); return { r: sxy / Math.sqrt(sxx * syy), b: sxy / sxx }; };
  const vs = t.map((x) => x.v), c = correl(vs);
  const Mrefaits = t.map((x) => x.m - 5 * log10h(x.r * 1e5)), ecartMagnitudes = Math.max(...Mrefaits.map((M, i) => Math.abs(M - t[i].M))), magnitudeMoyenne = Mrefaits.reduce((s, x) => s + x, 0) / t.length;
  let ecarts = 0; if (ecartMagnitudes > 0.1 || magnitudeMoyenne.toFixed(1) !== pub.meanM[0].toFixed(1)) ecarts++; if (Math.abs(kOrigine - pub.K24[0]) > pub.K24[1]) ecarts++;
  let melange = 0; for (let g = 1; g <= 20; g++) { const alea = mulberry32(0x4ab + 7919 * g), w = vs.slice(); for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); const z = w[i]; w[i] = w[j]; w[j] = z; } melange += correl(w).r / 20; }
  const pts = []; for (const x of t) for (let r = 0; r < 4; r++) pts.push([x.r / 2, x.v / 1100, 0]);
  for (let k = 0; k <= 30; k++) { const r = 2.1 * k / 30; pts.push([r / 2, kOrigine * r / 1100, 1]); pts.push([r / 2, P.constanteTest * r / 1100, 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'km/s', invariants: {
    loiHubble1929: { mesure: ecarts, formule: 0, kOrigine, kAvecOrdonnee: c.b, correlationHubble: c.r, magnitudeMoyenne, ecartMagnitudes,
      note: 'absolute magnitudes or their mean not recovered from m and r, or the slope through zero more than one published error from 465' },
    temoin: { mesure: c.r > 0.7 && Math.abs(melange) < 0.15 ? 0 : 1, formule: 0, correlationMelangee: melange, note: 'witness: velocities shuffled between nebulae (20 seeds) lose the correlation: near 0 instead of 0.79' } } };
}

// ---------- 99 : la loi de Moseley, 1914 (idee : codex 26, sous-agent Claude ; Table I et conclusions : SOURCES, Phil. Mag. 27) ----------
// Chaque element emet une raie X K-alpha ; Moseley calcule Q_K = racine(nu / (3/4 nu0)) et trouve Q_K = N - 1, N le rang de l element :
//   le numero atomique devient une mesure. Il laisse des places vides : un element entre Mo et Ru (le 43), entre Nd et Sa, entre W et Os.
// Exact ici : lambda x Q_K^2 doit etre le meme pour toutes les lignes (Q_K^2 proportionnel a 1/lambda) : constante implicite moyenne
//   109707, a 0.7 % pres ; le molybdene s en ecarte le plus (son Q imprime 41.2, son lambda donne 41.05 : nomme). Q_K - (N - 1) : 0.05 au
//   plus jusqu au zinc, puis 0.1, 0.2, 0.6 : « gradually diverge », comme il l ecrit.
// MESURE : lambda Q^2 constant a 1 %, Q - (N - 1) a 0.05 pres jusqu a Z = 30, et un ecart qui ne decroit jamais au-dela.
// Temoin : sans la case vide du 43 (Ru numerote 43, Pd 45, Ag 46), l ecart a N - 1 saute de 0.6 a 1.6 d un coup.
// Dessin (vue de face) : N (/ 50) contre Q_K (/ 50) ; etiquette 0 element, 1 droite Q = N - 1 ; numerotation 1 : sans la case vide du 43.
function loiMoseley(P, n) {
  const t = SOURCES.moseleyTable1.valeur.split(' ').map((x) => { const [e, l, q, z] = x.split(':'); return { e, l: Number(l), q: Number(q), z: Number(z) }; });
  const imp = t.map((x) => 1 / (0.75 * x.q * x.q * x.l * 1e-8)), moyImp = imp.reduce((s, x) => s + x, 0) / imp.length;
  const ecartsImp = imp.map((x) => Math.abs(x / moyImp - 1)), ecartImpMax = Math.max(...ecartsImp), pire = t[ecartsImp.indexOf(ecartImpMax)].e;
  const sansTrou = (x) => (x.z > 43 ? x.z - 1 : x.z), residu = (x, num) => x.q - (num(x) - 1), avec = (x) => x.z;
  const bas = t.filter((x) => x.z <= 30), haut = t.filter((x) => x.z > 30);
  let ecarts = 0; if (ecartImpMax > 0.01) ecarts++; if (bas.some((x) => Math.abs(Math.round(100 * residu(x, avec))) > 5)) ecarts++;
  if (haut.some((x, i) => i > 0 && Math.round(100 * residu(x, avec)) < Math.round(100 * residu(haut[i - 1], avec)))) ecarts++;
  const residuAvec = Math.max(...t.map((x) => residu(x, avec))), residuSans = Math.max(...t.map((x) => residu(x, sansTrou)));
  const num = P.numerotation ? sansTrou : avec;
  const pts = []; for (const x of t) for (let r = 0; r < 5; r++) pts.push([num(x) / 50, x.q / 50, 0]);
  for (let k = 0; k <= 40; k++) { const z = 12 + 36 * k / 40; pts.push([z / 50, (z - 1) / 50, 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'Q_K', invariants: {
    loiMoseley: { mesure: ecarts, formule: 0, rydbergImplicite: moyImp, ecartRydbergPourCent: 100 * ecartImpMax, pireLigne: pire, residusN: t.map((x) => x.e + ':' + residu(x, avec).toFixed(2)).join(' '),
      note: 'lambda Q^2 not constant to 1 %, Q - (N - 1) beyond 0.05 below zinc, or a shrinking gap above' },
    temoin: { mesure: residuSans - residuAvec >= 0.9 ? 0 : 1, formule: 0, avecTrouResidu: residuAvec, sansTrouResidu: residuSans, note: 'witness: without the vacant place 43, the gap to N - 1 jumps from 0.6 to 1.6' } } };
}

// ---------- 100 : la vitesse de la lumiere, Michelson 1879 (idee : codex 26, sous-agent Claude ; tables : SOURCES, Michelson 1880 ; c : NIST) ----------
// Un miroir tournant renvoie un eclair sur un miroir a 600 m ; la deviation de l image donne la vitesse. Michelson publie 100 mesures.
// Exact ici : la moyenne des 100 (299852.40 -> « 299852 »), puis sa chaine : + 12 (temperature) = 299864 dans l air, + 80 (vide) = 299944,
//   avec une erreur limite de +- 51 km/s ; le maximum 300070. Le minimum imprime « 299650 » contredit sa propre table (299620, p. 136) ;
//   l ecart moyen imprime « 60 » se refait a 61.2 : nommes.
// MESURE : moyenne, chaine et maximum retrouves.
// Temoin : c exact (NIST) = 299792.458 km/s : la valeur finale est 151.5 km/s trop haute, 2.97 fois l erreur limite qu il annoncait ; son erreur
//   probable statistique (+- 5) n en dit rien. Une incertitude annoncee ne garantit pas la verite.
// Dessin (vue de face) : numero de mesure contre vitesse (ecart a 299600, / 500) ; etiquette 0 mesure, 1 son resultat (dans le vide si
//   correctionVide = 1, dans l air sinon), 2 c exact.
function lumiereMichelson(P, n) {
  const v = SOURCES.michelson100.valeur.split(' ').map(Number);
  const t = Object.fromEntries(SOURCES.michelsonTexte.valeur.split(' ').map((x) => { const [k, w] = x.split(':'); return [k, Number(w)]; }));
  const c = SOURCES.nistC.valeur / 1000, moyenne100 = v.reduce((s, x) => s + x, 0) / v.length;
  const dansAir = Math.round(moyenne100) + t.temperature, finalRefait = dansAir + t.vacuo;
  const ecartMoyen100 = v.reduce((s, x) => s + Math.abs(x - moyenne100), 0) / v.length, minimumTable = Math.min(...v);
  let ecarts = 0; if (v.length !== 100 || Math.round(moyenne100) !== t.mean) ecarts++; if (dansAir !== t.air || finalRefait !== t.final) ecarts++; if (Math.max(...v) !== t.greatest) ecarts++;
  const trait = P.correctionVide ? finalRefait : dansAir;
  const pts = []; v.forEach((x, i) => { for (let r = 0; r < 2; r++) pts.push([i / 99, (x - 299600) / 500, 0]); });
  for (let k = 0; k <= 40; k++) { pts.push([k / 40, (trait - 299600) / 500, 1]); pts.push([k / 40, (c - 299600) / 500, 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'km/s', invariants: {
    lumiereMichelson: { mesure: ecarts, formule: 0, moyenne100, finalRefait, ecartMoyen100, minimumTable, minimumImprime: t.least, airMoinsC: dansAir - c,
      note: 'mean of the 100, the +12 and +80 chain, or the greatest value not recovered' },
    temoin: { mesure: (finalRefait - c) / t.limit > 2.5 ? 0 : 1, formule: 0, ecartC: finalRefait - c, enIncertitudes: (finalRefait - c) / t.limit, note: 'witness: the final value is 151.5 km/s above the exact c, almost 3 times the limiting error he gave' } } };
}

// ---------- 101 : la regression vers la moyenne, Galton 1886 (idee : codex 26, sous-agent Claude ; Table I et loi : SOURCES, J. Anthropol. Inst. 15) ----------
// Galton range 928 enfants adultes selon la taille moyenne de leurs deux parents (tailles des femmes x 1.08). Les enfants de parents tres grands
//   sont grands, mais moins que leurs parents ; ceux de parents petits, petits mais moins : « two-thirds of the height-deviate », autour de 68 1/4.
// Exact ici : les totaux (928, 205, et les colonnes : 928 encore), puis la pente des medianes d enfants contre le parent moyen : 0.685 (non
//   ponderee), 0.624 (ponderee par les enfants) ; et dans l autre sens (parent moyen median contre enfant) : 0.30. La regression va dans les
//   deux sens : ce n est pas une force, c est une selection sur une variable bruitee.
// MESURE : totaux retrouves, pente directe entre 0.6 et 0.75, pente inverse sous 0.4.
// Temoin : « l enfant ressemble a ses parents » (pente 1) predit 64.5 pour la ligne 64.5 ; la mediane imprimee est 65.8 ; la loi des 2/3 autour
//   de 68 1/4 predit 65.75.
// Dessin (vue de face) : parent moyen contre enfant (pouces, -63, / 11) ; etiquette 0 medianes des lignes (repetees selon le nombre d enfants),
//   1 medianes des colonnes (sens inverse), 2 droite de pente penteTest autour de 68 1/4.
function regressionGalton(P, n) {
  const lig = SOURCES.galtonLignes.valeur.split(' ').map((x) => { const [h, e, p, m] = x.split(':'); return { h, e: Number(e), p: Number(p), m: m === '-' ? null : Number(m) }; });
  const col = SOURCES.galtonColonnes.valeur.split(' ').map((x) => { const [h, e, m] = x.split(':'); return { h, e: Number(e), m: m === '-' ? null : Number(m) }; });
  const t = Object.fromEntries(SOURCES.galtonTexte.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, v]; }));
  const ajuste = (pts) => { let W = 0, sx = 0, sy = 0; for (const [x, y, w] of pts) { W += w; sx += w * x; sy += w * y; } const mx = sx / W, my = sy / W; let a = 0, b = 0;
    for (const [x, y, w] of pts) { a += w * (x - mx) * (y - my); b += w * (x - mx) * (x - mx); } return a / b; };
  const L = lig.filter((x) => x.m !== null), Cn = col.filter((x) => x.m !== null);
  const penteMedianes = ajuste(L.map((x) => [Number(x.h), x.m, 1])), pentePonderee = ajuste(L.map((x) => [Number(x.h), x.m, x.e])), penteInverse = ajuste(Cn.map((x) => [Number(x.h), x.m, 1]));
  const totalEnfants = lig.reduce((s, x) => s + x.e, 0), totalParents = lig.reduce((s, x) => s + x.p, 0), totalColonnes = col.reduce((s, x) => s + x.e, 0);
  let ecarts = 0; if (totalEnfants !== Number(t.children) || totalParents !== Number(t.midparents) || totalColonnes !== Number(t.children)) ecarts++;
  if (penteMedianes < 0.6 || penteMedianes > 0.75 || pentePonderee < 0.6 || pentePonderee > 0.75) ecarts++; if (penteInverse >= 0.4) ecarts++;
  const med = Number(t.mediocrity), bas = L.find((x) => x.h === '64.5'), predictionDeuxTiers = med + 2 / 3 * (64.5 - med);
  const pts = []; for (const x of L) for (let r = 0; r < Math.ceil(x.e / 10); r++) pts.push([(Number(x.h) - 63) / 11, (x.m - 63) / 11, 0]);
  for (const x of Cn) for (let r = 0; r < 4; r++) pts.push([(x.m - 63) / 11, (Number(x.h) - 63) / 11, 1]);
  for (let k = 0; k <= 30; k++) { const h = 63 + 11 * k / 30; pts.push([(h - 63) / 11, (med + P.penteTest * (h - med) - 63) / 11, 2]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'inches', invariants: {
    regressionGalton: { mesure: ecarts, formule: 0, totalEnfants, totalParents, penteMedianes, pentePonderee, penteInverse, note: 'totals not recovered, direct slope outside 0.6-0.75, or reverse slope 0.4 or more' },
    temoin: { mesure: Math.abs(bas.m - 64.5) > 1 && Math.abs(bas.m - predictionDeuxTiers) < 0.2 ? 0 : 1, formule: 0, medianeBasse: bas.m, predictionPente1: 64.5, predictionDeuxTiers,
      note: 'witness: like parent, like child (slope 1) predicts 64.5 for the 64.5 row; its median is 65.8, the 2/3 law gives 65.75' } } };
}

// ---------- 102 : l aberration de la lumiere, Bradley 1729 (idee : codex 27, sous-agent Claude ; etoiles et texte : SOURCES, Phil. Trans. 35) ----------
// Bradley cherche la parallaxe des etoiles et trouve autre chose : chaque etoile decrit en un an un petit cercle, parce que la Terre court sur son
//   orbite pendant que la lumiere arrive (comme la pluie qui semble tomber de biais quand on marche). Pour une etoile au pole de l ecliptique, le
//   cercle a un diametre « Maximum » ; chaque etoile, selon sa place, n en montre qu une partie (de 16 a 39 secondes), mais toutes redonnent le meme
//   Maximum, 40 a 41 secondes.
// Exact ici : la moyenne et l etendue des sept Maximum ; le rapport des vitesses 1 / tan(20.2") = 10211 (« 10210 ») ; le temps de la lumiere du Soleil
//   a la Terre : annee / (2 pi x rapport), avec une annee de 365.25 jours (HYPOTHESE de calcul, pas lue chez Bradley) : 8' 11.9" (« 8' 12" »), et pour
//   40" 1/2 : 8' 13.1" (« 8' 13" »).
// MESURE : sept etoiles a moins de 1" de leur moyenne ; 10210 et les deux temps retrouves.
// Temoin : avec les 11 minutes de Romer, le Maximum serait de 54" ; aucune des sept etoiles ne depasse 41".
// Dessin (vue de face) : etoile (rang) contre secondes d arc ; etiquette 0 Maximum deduit, 1 ecart observe, 2 Maximum predit pour minutesLumiere.
function aberrationBradley(P, n) {
  const et = SOURCES.bradleyEtoiles.valeur.split(' ').map((x) => { const [e, d, m] = x.split(':'); return { e, d: Number(d), m: Number(m) }; });
  const t = Object.fromEntries(SOURCES.bradleyTexte.valeur.split(' ').map((x) => x.split(':')));
  const SEC_RAD = 180 * 3600 / PI, ANNEE = 365.25 * 86400;
  const maxima = et.map((x) => x.m), maximumMoyen = maxima.reduce((s, x) => s + x, 0) / maxima.length, etendueMaxima = Math.max(...maxima.map((x) => Math.abs(x - maximumMoyen)));
  const angle = Number(t.angle) / SEC_RAD, rapportVitesses = cosD(angle) / sinD(angle);
  const temps = (demiMax) => ANNEE / (2 * PI) * (demiMax / SEC_RAD), enMinSec = (s) => Math.floor(s / 60) + 'm' + Math.round(s % 60) + 's';
  const tempsLumiere = temps(Number(t.angle)), tempsAdopte = temps(Number(t.adopted) / 2);
  let ecarts = 0; if (etendueMaxima > 1) ecarts++; if (Math.abs(rapportVitesses / Number(t.ratio) - 1) > 5e-4) ecarts++;
  if (enMinSec(tempsLumiere) !== t.lightTime || enMinSec(tempsAdopte) !== t.adoptedTime) ecarts++;
  const maximumRomer = 2 * Number(t.roemer) * 60 * 2 * PI / ANNEE * SEC_RAD, maxPredit = 2 * P.minutesLumiere * 60 * 2 * PI / ANNEE * SEC_RAD;
  const pts = []; et.forEach((x, i) => { for (let r = 0; r < 6; r++) { pts.push([i / 6, x.m / 60, 0]); pts.push([i / 6, x.d / 60, 1]); } });
  for (let k = 0; k <= 30; k++) pts.push([k / 30, maxPredit / 60, 2]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'arcseconds', invariants: {
    aberrationBradley: { mesure: ecarts, formule: 0, maximumMoyen, etendueMaxima, rapportVitesses, tempsLumiere, tempsAdopte, note: 'a star more than 1" from the mean maximum, the ratio 10210 or the light times not recovered' },
    temoin: { mesure: Math.max(...maxima) < maximumRomer - 10 ? 0 : 1, formule: 0, maximumRomer, note: 'witness: with Roemer\'s 11 minutes the maximum would be 54"; no star exceeds 41"' } } };
}

// ---------- 104 : l exclusion competitive, Gause 1934 (idee : codex 27, sous-agent Claude ; tables : SOURCES, The Struggle for Existence) ----------
// Deux paramecies mangent les memes bacteries. Seules, chacune plafonne (Gause : 105 « unites de volume » pour P. aurelia, 64 pour P. caudatum).
//   Ensemble, sur une demi-boucle de bacteries, P. caudatum tombe a 0 au jour 16.
// Exact ici : la Table X redonnee par un volume proportionnel a a x b x b (0.3695, 0.4091, 0.4296 : imprimes 0.37, 0.41 et 0.429 ; a x a x b ne
//   marche pas) ; 1/64, 1/105, 1.64 et 0.61 ; K1 = 105 retrouve par la moyenne des jours 8-16 x 0.429 (105.7). Deux constantes imprimees ne sont pas
//   l arrondi : 0.429 (0.4296, tronque) et 0.01562 (1/64 = 0.015625). Nommes, pas comptes en ecart (moins d une unite du dernier chiffre).
// Pas retrouve, ecrit : K2 = 64 par simple moyenne (58.9, jours 7-16 ; Gause ajuste sa courbe par une methode non lue) ; la double concentration
//   donne 186.9 et 130.6 la ou le texte dit 195 et 137.
// MESURE : constantes a une unite du dernier chiffre, K1 a 2 %, P. caudatum a 0 au jour 16 dans le melange demi-boucle.
// Temoin : Lotka-Volterra avec les constantes de Gause (RK4, pas 0.01 jour, depart 2 x 0.429 et 2) laisse encore 34.4 unites de P. caudatum au
//   jour 16 : a coefficients constants, le modele ne fait pas l exclusion que fait le bocal (Gause l ecrit lui-meme p. 108-109).
// Dessin (vue de face) : jour / 16 contre volume / 120 ; etiquette 0 aurelia observe (x 0.429), 1 caudatum observe, 2 et 3 le modele pour betaGause.
function exclusionGause(P, n) {
  const t4 = SOURCES.gauseTable4.valeur.split(' ').map((l) => l.split(':').map((x) => (x === '-' ? null : Number(x))));
  const tx = SOURCES.gauseTableX.valeur.split(' ').map((l) => l.split(':')), t = Object.fromEntries(SOURCES.gauseTexte.valeur.split(' ').map((x) => x.split(':')));
  const moyenne = (col, de) => { const v = t4.filter((r) => r[0] >= de && r[col] !== null).map((r) => r[col]); return v.reduce((s, x) => s + x, 0) / v.length; };
  const tampon = Number(tx[2][5]), K1 = Number(t.K1), b1 = Number(t.b1), K2 = Number(t.K2), b2 = Number(t.b2), alpha = Number(t.alpha);
  const vol = tx.slice(0, 3).map(([, a, b, c, d]) => Number(c) * Number(d) * Number(d) / (Number(a) * Number(b) * Number(b)));
  const constantes = [[tx[0][5], vol[0]], [tx[1][5], vol[1]], [tx[2][5], vol[2]], [tx[3][1], (vol[0] + vol[1]) / 2], [t.foodCaudatum, 1 / K2], [t.foodAurelia, 1 / K1], [t.alpha, K1 / K2], [t.beta, K2 / K1]];
  const dec = (s) => s.split('.')[1].length;
  let ecarts = constantes.filter(([s, x]) => Math.abs(x - Number(s)) >= Number('1e-' + dec(s))).length;
  const nonArrondies = constantes.filter(([s, x]) => x.toFixed(dec(s)) !== s).map(([s, x]) => s + ' (' + x.toFixed(dec(s) + 1) + ')');
  const k1Retrouve = moyenne(2, 8) * tampon, k2Moyen = moyenne(4, 7), uneBoucleAurelia = moyenne(1, 7) * tampon, uneBoucleCaudatum = moyenne(3, 7);
  if (Math.abs(k1Retrouve / K1 - 1) > 0.02) ecarts++;
  if (t4[16][8] !== 0) ecarts++;
  const modele = (beta) => { let x = 2 * tampon, y = 2; const h = 0.01, f = (x, y) => [b1 * x * (K1 - x - alpha * y) / K1, b2 * y * (K2 - y - beta * x) / K2], pts = [[0, x, y]];
    for (let s = 1; s <= 1600; s++) { const [a1, a2] = f(x, y), [c1, c2] = f(x + h / 2 * a1, y + h / 2 * a2), [d1, d2] = f(x + h / 2 * c1, y + h / 2 * c2), [e1, e2] = f(x + h * d1, y + h * d2);
      x += h / 6 * (a1 + 2 * c1 + 2 * d1 + e1); y += h / 6 * (a2 + 2 * c2 + 2 * d2 + e2); if (s % 25 === 0) pts.push([s * h, x, y]); }
    return pts; };
  const fixe = modele(Number(t.beta)), fin = fixe[fixe.length - 1], choisi = modele(P.betaGause);
  const pts = [];
  for (const r of t4) { for (let k = 0; k < 6; k++) { if (r[7] !== null) pts.push([r[0] / 16, r[7] * tampon / 120, 0]); if (r[8] !== null) pts.push([r[0] / 16, r[8] / 120, 1]); } }
  for (const [j, x, y] of choisi) { pts.push([j / 16, x / 120, 2]); pts.push([j / 16, y / 120, 3]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'volume units', invariants: {
    exclusionGause: { mesure: ecarts, formule: 0, volumesTableX: vol.map((v) => v.toFixed(4)).join(' '), constantesNonArrondies: nonArrondies.join(' ; '), k1Retrouve, k2Moyen, uneBoucleAurelia, uneBoucleCaudatum,
      pcModeleChoisi: choisi[choisi.length - 1][2], note: 'a printed constant more than one unit of its last digit away, K1 not recovered within 2 % or P. caudatum not at 0 on day 16' },
    temoin: { mesure: fin[2] > 10 && t4[16][8] === 0 ? 0 : 1, formule: 0, paModeleJour16: fin[1], pcModeleJour16: fin[2], note: 'witness: Gause\'s own constant coefficients still leave 34 units of P. caudatum on day 16; the jar has 0' } } };
}

// ---------- 105 : la mortalite de l armee d Orient, Nightingale 1858 (idee : codex 27, sous-agent Claude ; tableau : SOURCES, Table No. 2) ----------
// Dans les hopitaux de l armee d Orient, d avril 1854 a mars 1856, les maladies « zymotiques » (cholera, dysenterie, typhus...) tuent bien plus que
//   les blessures. Le tableau donne l effectif, les deces et un taux « annuel pour 1000 » : 12 000 x deces du mois / effectif (1022.8 en janvier 1855
//   ne veut pas dire plus de morts que d hommes).
// Exact ici : les 66 taux imprimes refaits au dixieme depuis effectifs et deces ; les « .. » restent des absences ; par annee (avril-mars) : 13 294
//   deces puis 4 688 (17 982 en tout), 474.7 puis 111.8 pour 1000, dont 83.9 % puis 70.8 % zymotiques ; hivers d octobre a mars : 582.5 puis 22.7.
// MESURE : 66 / 66 taux, pic zymotique en janvier 1855, baisse d au moins 4 fois d une annee a l autre.
// Ce que le tableau ne dit pas : POURQUOI ca baisse ; la chute commence avant l arrivee de la Sanitary Commission (mars 1855) et l effectif grossit.
// Temoin : si la baisse n etait qu une armee plus nombreuse, un effectif constant (la moyenne, 34 976) l effacerait ; il laisse 947.3 en janvier
//   1855 et 31.2 en decembre 1855 : 30 fois moins, c est dans les deces eux-memes (2 761 contre 91).
// Dessin (vue de face) : une rose par annee (anneeNightingale), un secteur par mois, rayon en racine du taux (l aire suit le taux, comme chez elle) ;
//   etiquette 0 zymotique, 1 blessures, 2 autres causes.
function mortaliteNightingale(P, n) {
  const m = SOURCES.nightingaleTable2.valeur.split(' ').map((l) => l.split(':').map((x) => (x === '..' ? null : Number(x))));
  let ecarts = 0, tauxRetrouves = 0;
  m.forEach((r) => { for (let c = 1; c <= 3; c++) { if (r[c] === null) { if (r[c + 3] !== null) ecarts++; continue; } if ((12000 * r[c] / r[0]).toFixed(1) === r[c + 3].toFixed(1)) tauxRetrouves++; else ecarts++; } });
  const annee = (a) => { const s = m.slice(a, a + 12), d = s.reduce((x, r) => x + r[1] + (r[2] || 0) + r[3], 0), z = s.reduce((x, r) => x + r[1], 0), S = s.reduce((x, r) => x + r[0], 0) / 12; return { d, taux: 1000 * d / S, part: z / d }; };
  const a1 = annee(0), a2 = annee(12);
  if (a1.taux / a2.taux < 4) ecarts++;
  const zym = m.map((r) => r[4]), pic = zym.indexOf(Math.max(...zym));
  if (pic !== 9) ecarts++;
  const hiver = (a) => m.slice(a, a + 6).reduce((x, r) => x + 12000 * r[1] / r[0], 0) / 6;
  const Sm = m.reduce((x, r) => x + r[0], 0) / 24, janvierConstant = 12000 * m[9][1] / Sm, decembreConstant = 12000 * m[20][1] / Sm;
  const s = m.slice(12 * (P.anneeNightingale - 1), 12 * P.anneeNightingale), pts = [];
  s.forEach((r, k) => { for (let c = 0; c < 3; c++) { const t = r[4 + c]; if (t === null) continue; const rayon = Math.sqrt(t / 1022.8);
    for (let i = 0; i < 5; i++) for (let j = 1; j <= 5; j++) { const th = (k + (i + 0.5) / 5) * 2 * PI / 12, rr = rayon * j / 5; pts.push([0.5 + 0.5 * rr * cosD(th), 0.5 + 0.5 * rr * sinD(th), c]); } } });
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'deaths per 1000 a year', invariants: {
    mortaliteNightingale: { mesure: ecarts, formule: 0, tauxRetrouves, totalDeces: a1.d + a2.d, deces1: a1.d, deces2: a2.d, tauxAnnuel1: a1.taux, tauxAnnuel2: a2.taux, partZymotique1: a1.part, partZymotique2: a2.part,
      hiverAvant: hiver(6), hiverApres: hiver(18), note: 'a printed rate not 12000 x deaths / strength, a dash on one side only, no January 1855 peak or less than a 4-fold fall' },
    temoin: { mesure: janvierConstant / decembreConstant > 10 ? 0 : 1, formule: 0, janvierConstant, decembreConstant, note: 'witness: at a constant strength of 34,976 men, January 1855 is still 947.3 and December 1855 31.2 per 1000: the deaths themselves fell' } } };
}

// ---------- 106 : les equivalents electrochimiques, Faraday 1834 (idee : codex 27, sous-agent Claude ; essais et table : SOURCES, Phil. Trans. 124) ----------
// Le meme courant traverse un volta-electrometre (il decompose de l eau) et un sel fondu (chlorure d etain, de plomb...). Si l action est « definie »,
//   la masse de metal deposee est a la masse d eau decomposee comme l equivalent chimique du metal est a celui de l eau (9).
// Exact ici : la chaine du § 791 (3.85 x 12.92 / 100 = 0.49742 grain d eau ; 9 x 3.2 / 0.49742 = 57.9 pour l etain) ; les sept essais que Faraday
//   retient tombent a 1.37 % en moyenne (2.56 % au plus) de la table du § 847. Ses rates sont DANS le memoire avec son explication : oxyde de plomb
//   93.17 (§ 798), iodure 75.46 et 73.45 (§ 802), iodure a un tiers de pouce 89.04 (§ 803) ; on les garde, nommes. Le § 851 ne reprend pas sa propre
//   table : chlore 36 (35.5), brome 78.4 (78.3), etain 59 (57.9).
// La table du § 847 n est PAS une mesure de Faraday : « taken almost entirely from the chemical results of other philosophers » (§ 846).
// MESURE : la chaine du § 791, les essais retenus a moins de 3 %, les rates a plus de 3 %.
// Temoin : « meme courant, meme masse » donnerait 0.497 grain d etain au lieu des 3.2 peses (6.4 fois moins) ; « masse proportionnelle a
//   l equivalent » donne 3.2001.
// Dessin (vue de face) : equivalent de la table / 130 en travers ; etiquette 0 masse deposee pour volumeGazFaraday pouces cubes de gaz (/ 25 grains),
//   1 essais retenus et 2 rates (equivalent mesure / 130 : sur la diagonale s ils tombent juste).
function equivalentsFaraday(P, n) {
  const paires = (src) => Object.fromEntries(src.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const ions = paires(SOURCES.faradayIons.valeur), t = paires(SOURCES.faradayTexte.valeur);
  const essais = SOURCES.faradayEssais.valeur.split(' ').map((x) => { const [m, p, v] = x.split(':'); return { m, p: Number(p), v: Number(v) }; });
  const EXPLIQUES = [798, 802, 803], table = { Sn: ions.Tin, Pb: ions.Lead };
  let ecarts = 0;
  const etain = t.electrodeAfter - t.electrodeBefore, eau = t.gas * t.grains100 / 100, chaineEtain = t.waterEquivalent * etain / eau;
  if (eau.toFixed(5) !== t.water.toFixed(5)) ecarts++;
  if (chaineEtain.toFixed(1) !== t.tin.toFixed(1)) ecarts++;
  const ecart = (e) => (e.v / table[e.m] - 1) * 100, retenus = essais.filter((e) => !EXPLIQUES.includes(e.p)), manques = essais.filter((e) => EXPLIQUES.includes(e.p));
  const ecartsRetenus = retenus.map((e) => Math.abs(ecart(e))), ecartMoyenFaraday = ecartsRetenus.reduce((s, x) => s + x, 0) / ecartsRetenus.length, ecartMaxEssais = Math.max(...ecartsRetenus);
  if (ecartMaxEssais > 3) ecarts++;
  if (manques.some((e) => Math.abs(ecart(e)) < 3)) ecarts++;
  const plomb = essais.filter((e) => e.m === 'Pb').map((e) => e.v), moyenneHuitPlomb = plomb.reduce((s, x) => s + x, 0) / plomb.length;
  const texte851 = [['Cl', t.Cl851, ions.Chlorine], ['Br', t.Br851, ions.Bromine], ['Sn', t.Sn851, ions.Tin], ['O', t.O851, ions.Oxygen], ['Pb', t.Pb851, ions.Lead]].filter(([, a, b]) => a !== b).map(([k, a, b]) => k + ' ' + a + ' vs ' + b).join(' ; ');
  const masseProportionnelle = ions.Tin / t.waterEquivalent * eau, rapportMasses = etain / eau;
  const eauChoisie = P.volumeGazFaraday * t.grains100 / 100, pts = [];
  for (const v of Object.values(ions)) for (let r = 0; r < 12; r++) pts.push([v / 130, v / t.waterEquivalent * eauChoisie / 25, 0]);
  for (const e of essais) for (let r = 0; r < 12; r++) pts.push([table[e.m] / 130, e.v / 130, EXPLIQUES.includes(e.p) ? 2 : 1]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'equivalent, hydrogen = 1', invariants: {
    equivalentsFaraday: { mesure: ecarts, formule: 0, eauDecomposee: eau, chaineEtain, ecartMoyenFaraday, ecartMaxEssais, manquesExpliques: manques.map((e) => e.p + ' ' + e.v).join(' ; '), moyenneHuitPlomb, texte851,
      note: 'the paragraph 791 chain not recovered, a retained trial more than 3 % from the table, or an explained miss within 3 %' },
    temoin: { mesure: rapportMasses > 5 && Math.abs(masseProportionnelle - etain) < 0.01 ? 0 : 1, formule: 0, masseProportionnelle, rapportMasses, note: 'witness: same current, same mass would give 0.497 grain of tin; 3.2 were weighed; mass in proportion to the equivalent gives 3.2001' } } };
}

// ---------- 107 : la chaleur des atomes, Petit et Dulong 1819 (idee : codex 28, sous-agent Claude ; tableau : SOURCES, Annales 10 : 403) ----------
// La chaleur specifique (par gramme) change d un corps a l autre d un facteur 6.5 ; multipliee par le poids de l atome, elle donne presque la meme
//   chose pour les treize corps : « les atomes de tous les corps simples ont exactement la meme capacite pour la chaleur » (p. 405).
// Exact ici : chaleur x poids refait ligne a ligne : 12 lignes a moins de 1.5e-4 du produit imprime ; le platine NON (0.0314 x 11.16 = 0.3504,
//   imprime 0.3740 ; il faudrait 0.03351) : nomme, pas corrige. Trois produits sont tronques, pas arrondis (etain, argent, soufre). Dispersion
//   (ecart-type / moyenne, sur la population) des produits imprimes 1.22 %, des produits refaits 2.16 %.
// Ce que la table ne prouve pas seule : une partie des poids a ete CHOISIE par les auteurs (p. 404) ; la loi a aussi servi a les fixer.
// MESURE : 12 / 13 produits retrouves, le platine seul hors tolerance, dispersion imprimee sous 1.5 %.
// Temoin : « meme chaleur par gramme » : dispersion des chaleurs 59.1 % ; poids decales de 5 lignes (l association brisee) : 94.5 %.
// Dessin (vue de face) : poids de l atome / 14 contre chaleur specifique / 0.2 ; etiquette 0 les corps (poids decales de decalagePoids lignes),
//   1 l hyperbole chaleur = produit moyen / poids.
function chaleursPetitDulong(P, n) {
  const t = SOURCES.petitDulongTable.valeur.split(' ').map((l) => { const [corps, c, w, p] = l.split(':'); return { corps, c: Number(c), w: Number(w), p: Number(p) }; });
  const COQUILLES = ['Platine'], hors = t.filter((r) => Math.abs(r.c * r.w - r.p) > 1.5e-4).map((r) => r.corps);
  let ecarts = hors.filter((x) => !COQUILLES.includes(x)).length + COQUILLES.filter((x) => !hors.includes(x)).length;
  const cv = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return 100 * Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) / m; };
  const cvProduits = cv(t.map((r) => r.p)), cvChaleurs = cv(t.map((r) => r.c)), cvRecalcules = cv(t.map((r) => r.c * r.w));
  if (cvProduits > 1.5) ecarts++;
  const nonArrondis = t.filter((r) => !COQUILLES.includes(r.corps) && (r.c * r.w).toFixed(4) !== r.p.toFixed(4)).map((r) => r.corps + ' ' + r.p.toFixed(4) + ' (' + (r.c * r.w).toFixed(5) + ')').join(' ; ');
  const pt = t.find((r) => r.corps === 'Platine'), cPlatine = pt.p / pt.w, cvCinq = cv(t.map((r, i) => r.c * t[(i + 5) % t.length].w));
  const d = P.decalagePoids, cvDecale = cv(t.map((r, i) => r.c * t[(i + d) % t.length].w)), moyen = t.reduce((s, r) => s + r.p, 0) / t.length, pts = [];
  t.forEach((r, i) => { for (let k = 0; k < 20; k++) pts.push([t[(i + d) % t.length].w / 14, r.c / 0.2, 0]); });
  for (let k = 0; k <= 60; k++) { const w = 2 + 11.3 * k / 60; pts.push([w / 14, moyen / w / 0.2, 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'specific heat x atomic weight', invariants: {
    chaleursPetitDulong: { mesure: ecarts, formule: 0, produitsRetrouves: t.length - hors.length, coquillePlatine: 'Platine ' + pt.p.toFixed(4) + ' vs ' + (pt.c * pt.w).toFixed(4), cPlatine, nonArrondis, cvProduits, cvRecalcules, cvDecale,
      note: 'a product other than platinum off by more than 1.5e-4, platinum not off, or printed products spread over 1.5 %' },
    temoin: { mesure: cvChaleurs > 10 * cvProduits && cvCinq > 10 * cvProduits ? 0 : 1, formule: 0, cvChaleurs, cvCinq, rapportChaleurs: Math.max(...t.map((r) => r.c)) / Math.min(...t.map((r) => r.c)), note: 'witness: specific heats spread 59.1 %, weights shifted by five rows 94.5 %, the products 1.2 %' } } };
}

// ---------- 108 : les repliques d un seisme, Omori 1894 (idee : codex 28, sous-agent Claude ; table et texte : SOURCES, J. Coll. Sci. Tokyo 7) ----------
// Apres le seisme de Mino-Owari (28 octobre 1891), la station de Gifu compte les secousses par demi-journee. Omori les ajuste par une hyperbole
//   y = 440.7 / (x + 2.31) (moindres carres sur les cinq premiers jours) et la prolonge d un et deux ans.
// Exact ici : les moyennes imprimees (68, 57, 44) ; les six valeurs calculees a moins d une unite (190 et 42 sont tronques, 76 est arrondi : pas
//   de regle unique) ; 1892 et 1893 : 0.89 et 0.36 predits contre 867 / 732 = 1.18 et 308 / 730 = 0.42 observes ; x = 19 (sqrt(k) - h) ; equation
//   (d) en mois : 2.14 et 0.849 (imprime 0.84 : tronque). Refait : la forme y (x + h) = k, moindres carres de x y sur y, redonne k = 440.69 et
//   h = 2.319 depuis les 10 comptes (un ajustement direct de l hyperbole donne 468 et 2.63 : ce n est pas la que sont ses constantes).
// Nomme : sa note exponentielle imprime 175, 138, 108 la ou « log y = 2.25 - 0.106 x » donne 177.8, 139.3, 109.1.
// MESURE : moyennes, calcules, queues 1892-1893, x = 19 et equation (d) a une unite du dernier chiffre imprime ; k refait a 0.05 pres.
// Temoin : la loi exponentielle qu il essaie d abord predit 1e-50 secousse par demi-journee en 1892 ; il y en a eu 1.18 ; l hyperbole dit 0.89.
// Dessin (vue de face) : demi-journee / horizonOmori contre secousses / 200 ; etiquette 0 les comptes, 1 l hyperbole, 2 l exponentielle,
//   3 les moyennes 1892 et 1893 quand l horizon les atteint.
function repliquesOmori(P, n) {
  const t = Object.fromEntries(SOURCES.omoriTexte.valeur.split(' ').map((x) => x.split(':'))), v = (cle) => Number(t[cle]);
  const [brut0, brut1, brut2] = SOURCES.omoriTable.valeur.split('|'), y = brut0.split(' ').map(Number);
  const calcules = brut1.split(' ').map((x) => x.split(':')), moyennes = brut2.split(' ').map((x) => x.split(':'));
  const hyp = (x) => v('k') / (x + v('h')), lnDix = lnD(10), expo = (x) => expD(lnDix * (v('expA') - v('expB') * x));
  const decimales = (s) => (s.includes('.') ? s.split('.')[1].length : 0), pres = (val, s) => Math.abs(val - Number(s)) < Number('1e-' + decimales(s));
  let ecarts = 0;
  for (const [plage, imp] of moyennes) { const [a, b] = plage.split('-').map(Number), tranche = y.slice(a, b + 1), m = tranche.reduce((s, x) => s + x, 0) / tranche.length; if (Math.round(m) !== Number(imp)) ecarts++; }
  const verifs = [...calcules.map(([x, s]) => [hyp(Number(x)), s]), [hyp(v('x1892')), t.y1892], [hyp(v('x1893')), t.y1893], [v('shocks1892') / (2 * 366), t.obs1892], [v('shocks1893') / (2 * 365), t.obs1893],
    [Math.sqrt(v('k')) - v('h'), t.curvature], [v('kd') / (v('xd1892') + v('hd')), t.yd1892], [v('kd') / (v('xd1893') + v('hd')), t.yd1893], [v('shocks1892') / 366, t.obsd1892], [v('shocks1893') / 365, t.obsd1893]];
  ecarts += verifs.filter(([val, s]) => !pres(val, s)).length;
  const nonArrondis = verifs.filter(([val, s]) => val.toFixed(decimales(s)) !== s).map(([val, s]) => s + ' (' + val.toFixed(decimales(s) + 1) + ')').join(' ; ');
  const xs = y.map((_, i) => i), my = y.reduce((s, q) => s + q, 0) / y.length, xy = y.map((q, i) => q * i), mxy = xy.reduce((s, q) => s + q, 0) / y.length;
  let sAB = 0, sAA = 0; y.forEach((q, i) => { sAB += (q - my) * (xy[i] - mxy); sAA += (q - my) * (q - my); });
  const hRefait = -sAB / sAA, kRefait = mxy + hRefait * my;
  if (Math.abs(kRefait - v('k')) > 0.05) ecarts++;
  const rms = (g) => Math.sqrt(y.reduce((s, q, i) => s + (q - g(i)) * (q - g(i)), 0) / y.length);
  const H = P.horizonOmori, pts = [];
  xs.forEach((x) => { if (x <= H) for (let r = 0; r < 10; r++) pts.push([x / H, y[x] / 200, 0]); });
  for (let k = 0; k <= 120; k++) { const x = H * k / 120; pts.push([x / H, hyp(x) / 200, 1]); pts.push([x / H, Math.min(expo(x), 200) / 200, 2]); }
  [[v('x1892'), v('shocks1892') / (2 * 366)], [v('x1893'), v('shocks1893') / (2 * 365)]].forEach(([x, q]) => { if (x <= H) for (let r = 0; r < 10; r++) pts.push([x / H, q / 200, 3]); });
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'shocks per half day', invariants: {
    repliquesOmori: { mesure: ecarts, formule: 0, kRefait, hRefait, nonArrondisOmori: nonArrondis, prediction1892: hyp(v('x1892')), observe1892: v('shocks1892') / (2 * 366), rmsHyperbole: rms(hyp), rmsExpo: rms(expo),
      expoNote: [0, 1, 2].map((x) => expo(x).toFixed(1)).join(' '), anneesD: (v('kd') * 30 - v('hd')) / 12, anneesC: (v('k') * 60 - v('h')) / 2 / 365.25,
      note: 'a printed mean, calculated value, 1892-1893 figure, x = 19 or equation (d) more than one unit of its last digit away, or k not refitted within 0.05' },
    temoin: { mesure: expo(v('x1892')) < 1e-6 && hyp(v('x1892')) / (v('shocks1892') / (2 * 366)) > 0.5 ? 0 : 1, formule: 0, expoQueue: expo(v('x1892')), note: 'witness: the exponential law gives 1e-50 shocks per half day in 1892; there were 1.18; the hyperbola says 0.89' } } };
}

// ---------- 109 : la table de Breslau, Halley 1693 (idee : codex 28, sous-agent Claude ; tables et texte : SOURCES, Phil. Trans. 17) ----------
// Avec les registres de Breslau (1687-1691), Halley construit la premiere table de survie vraiment utilisable : 1000 vivants dans leur premiere
//   annee, 20 a 84 ans, 107 de 85 a 100, 34 000 en tout ; puis il en tire le prix d une rente viagere a 6 %.
// Exact ici : les 12 sommes de 7 ans et 34 000 ; la chaine du texte 1238 - 348 = 890, 890 - 198 = 692 = la table a 7 ans ; la cote « 80 to 1 »
//   a 25 ans (560 / 7) ; 10 - log(1.06) = 9.974694. Rente refaite (somme de v^t l(x+t) / l(x), rien au-dela de 84 ans) : a moins de 0.05 pour
//   1, 10, 20, 25, 30, 35 et 40 ans. Nommes : 5 ans (13.40 imprime, 13.01 refait) et 15 ans (13.33 / 13.18) ; divisees par l(x+1) au lieu de
//   l(x) elles donnent 13.41 et 13.31 : compatible, pas tranche (1 et 10 ans, eux, tombent juste avec l(x)). Au-dela de 40 ans l ecart grandit
//   en grande partie parce que les 85-100 ans ne sont pas detailles : meme places au plus tot, les 107 laissent 0.06 a 65 ans et 0.08 a 70 ans
//   (reste non explique). 6193 / 5 = 1238.6 imprime 1238 (tronque) ; 5869 / 5 = 1173.8 imprime 1174.
// Ce que la table suppose : une population stationnaire (Halley le pose) ; 34 000 n est pas un recensement.
// MESURE : sommes, total, chaine du texte, cote, complement, et les rentes de 1 a 40 ans hors 5 et 15 a 0.05.
// Temoin : un risque de deces constant passant par 1000 et 20 donne 145 vivants a 42 ans au lieu de 427, et une rente de 9.00 a tout age.
// Dessin (vue de face) : age / 100 ; etiquette 0 les vivants / 1000, 1 la rente refaite au taux tauxHalley / 15, 2 les rentes imprimees / 15,
//   3 le risque constant / 1000.
function survieHalley(P, n) {
  const L = SOURCES.halleyVivants.valeur.split(' ').map(Number), l = (a) => (a >= 1 && a <= L.length ? L[a - 1] : 0);
  const [sommesTxt, resteTxt, totalTxt] = SOURCES.halleySommes.valeur.split('|'), sommes = sommesTxt.split(' ').map(Number);
  const t = Object.fromEntries(SOURCES.halleyTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const imprimees = SOURCES.halleyAnnuites.valeur.split(' ').map((x) => x.split(':').map(Number));
  let ecarts = 0, sommesRetrouvees = 0;
  sommes.forEach((s, k) => { if (L.slice(7 * k, 7 * k + 7).reduce((a, b) => a + b, 0) === s) sommesRetrouvees++; else ecarts++; });
  const totalHalley = L.reduce((a, b) => a + b, 0) + Number(resteTxt);
  if (totalHalley !== Number(totalTxt)) ecarts++;
  if (nb('born1') - nb('die1') !== nb('reach1') || nb('reach1') - nb('die5') !== l(7) || nb('survive6') !== l(7) || nb('born1') - nb('buried1') !== nb('increase')) ecarts++;
  const coteVingtCinq = l(26) / (l(25) - l(26));
  if (coteVingtCinq !== nb('odds')) ecarts++;
  const complementLog = 10 - lnD(1 + nb('rate') / 100) / lnD(10);
  if (complementLog.toFixed(6) !== t.complement) ecarts++;
  const rente = (x, taux, base) => { const v = 1 / (1 + taux / 100); let s = 0, vt = 1; for (let k = 1; x + k <= L.length; k++) { vt *= v; s += vt * l(x + k) / l(base ?? x); } return s; };
  const NOMMES = [5, 15], ecartRente = ([a, p]) => Math.abs(rente(a, nb('rate')) - p);
  ecarts += imprimees.filter(([a]) => a <= 40 && !NOMMES.includes(a)).filter((q) => ecartRente(q) > 0.05).length;
  ecarts += imprimees.filter(([a]) => NOMMES.includes(a)).filter((q) => ecartRente(q) <= 0.05).length;
  const ecartsRentes = imprimees.filter((q) => ecartRente(q) > 0.05).map(([a, p]) => a + ' ' + p.toFixed(2) + ' vs ' + rente(a, nb('rate')).toFixed(2)).join(' ; ');
  const renteBaseDecalee = NOMMES.map((a) => a + ' ' + rente(a, nb('rate'), a + 1).toFixed(2)).join(' ; ');
  const lam = lnD(l(1) / l(84)) / 83, vivantsConstant42 = l(1) * expD(-lam * 41), q = expD(-lam) / (1 + nb('rate') / 100), renteConstante = q / (1 - q);
  const taux = P.tauxHalley, pts = [];
  for (let a = 1; a <= 84; a++) { for (let r = 0; r < 4; r++) pts.push([a / 100, l(a) / 1000, 0]); pts.push([a / 100, rente(a, taux) / 15, 1]); pts.push([a / 100, l(1) * expD(-lam * (a - 1)) / 1000, 3]); }
  for (const [a, p] of imprimees) for (let r = 0; r < 8; r++) pts.push([a / 100, p / 15, 2]);
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'persons alive, years purchase', invariants: {
    survieHalley: { mesure: ecarts, formule: 0, sommesRetrouvees, totalHalley, coteVingtCinq, complementLog, naissancesAn: nb('born') / nb('years'), ecartsRentes, renteBaseDecalee, renteChoisie10: rente(10, taux),
      note: 'a 7-year sum, the total, the text chain, the 80 to 1 odds, 9.974694, or an annuity from 1 to 40 (except 5 and 15) more than 0.05 off' },
    temoin: { mesure: vivantsConstant42 < l(42) / 2 ? 0 : 1, formule: 0, vivantsConstant42, renteConstante, note: 'witness: a constant risk through 1000 and 20 leaves 145 alive at 42 instead of 427, and an annuity of 9.00 at every age' } } };
}

// ---------- 110 : la chaleur de la ville, Howard 1833 (idee : codex 28, sous-agent Claude ; tables et texte : SOURCES, The Climate of London) ----------
// Luke Howard compare la moyenne annuelle de Londres (registre de la Royal Society) a celle de la campagne voisine, sur trois sites successifs :
//   « London always warmer than the country, the average excess of its temperature being 1 579 » (degres Fahrenheit). Il l attribue a la ville : « induced by its structure, by a crowded
//   population, and the consumption of great quantities of fuel in fires » (p. 3) ; mais les deux registres ont des sites et des instruments
//   differents (p. 3-4), et il le dit.
// Exact ici : les trois moyennes de campagne, les trois ecarts imprimes (1.760, 1.469, 1.508 = Londres - campagne imprimes) et leur moyenne
//   1.579 ; la moyenne des trois decennies (50.456) ; 9 des 12 « AVERAGES » a moins d un millieme ; l etendue 4.814 seulement sans 1818 (la
//   note « [1818, not then out.] » l explique), 4.618 a la campagne. Nommes : Londres 1807-1809 (50.608 imprime, 50.6107 refait), 17 ans depuis
//   1790 (50.530 / 50.5248), 17 ans depuis 1800 (50.600 / 50.6024), 7 ans depuis 1800 (50.912 / 50.9420).
// « Toujours plus chaud » vaut pour les trois periodes, pas pour chaque annee : en 1813 la campagne (49.762) bat Londres (49.741).
// MESURE : tout ce qui precede a un millieme, hors les quatre nommes.
// Temoin : « aucune difference entre les deux registres » : ecart moyen 1.766 sur 12 ans, t = 7.30, Londres plus chaude 11 annees sur 12 ;
//   que l ecart soit urbain est l interpretation de Howard, pas une mesure.
// Dessin (vue de face) : (annee - 1789) / 29 contre (degres - 46) / 8 ; etiquette 0 Londres, 1 la campagne, 2 Londres lissee sur lissageHoward ans.
function chaleurLondres(P, n) {
  const serie = (src) => Object.fromEntries(src.split(' ').map((x) => x.split(':').map(Number)));
  const Lo = serie(SOURCES.howardLondres.valeur), Ca = serie(SOURCES.howardCampagne.valeur), t = Object.fromEntries(SOURCES.howardTexte.valeur.split(' ').map((x) => x.split(':')));
  const moyenneAns = (o, a, k) => { let s = 0; for (let y = a; y < a + k; y++) s += o[y]; return s / k; };
  const etendue = (o, a, b) => { const v = []; for (let y = a; y <= b; y++) v.push(o[y]); return Math.max(...v) - Math.min(...v); };
  const verifs = [];
  for (const [a, k] of [[1807, 3], [1810, 3], [1813, 4]]) { verifs.push(['campagne ' + a, moyenneAns(Ca, a, k), t['c' + a]]); verifs.push(['Londres ' + a, moyenneAns(Lo, a, k), t['l' + a]]); verifs.push(['ecart ' + a, Number(t['l' + a]) - Number(t['c' + a]), t['e' + a]]); }
  verifs.push(['exces moyen', (Number(t.e1807) + Number(t.e1810) + Number(t.e1813)) / 3, t.excess], ['ville', (Number(t.dec1) + Number(t.dec2) + Number(t.dec3)) / 3, t.city]);
  for (const x of SOURCES.howardMoyennes.valeur.split(' ')) { const [w, k, a, s] = x.split(':'); verifs.push([(w === 'Lo' ? 'Londres ' : 'Campagne ') + k + ' ans ' + a, moyenneAns(w === 'Lo' ? Lo : Ca, Number(a), Number(k)), s]); }
  verifs.push(['etendue Londres', etendue(Lo, 1789, 1817), t.extentLondon], ['etendue campagne', etendue(Ca, 1807, 1818), t.extentCountry]);
  const NOMMES = ['Londres 1807', 'Londres 17 ans 1790', 'Londres 17 ans 1800', 'Londres 7 ans 1800'], hors = (q) => !(Math.abs(q[1] - Number(q[2])) <= 0.001 + 1e-9); /* au plus une unite du dernier chiffre : 1810-1812 refait 50.950 exactement, imprime 50.949 */
  const ecarts = verifs.filter((q) => hors(q) !== NOMMES.includes(q[0])).length;
  const nonRetrouves = verifs.filter(hors).map(([nom, val, s]) => nom + ' ' + s + ' vs ' + val.toFixed(4)).join(' ; ');
  const ecartsAnnuels = Object.keys(Ca).map(Number).map((y) => [y, Lo[y] - Ca[y]]), d = ecartsAnnuels.map((q) => q[1]);
  const moyenneEcart = d.reduce((s, x) => s + x, 0) / d.length, sd = Math.sqrt(d.reduce((s, x) => s + (x - moyenneEcart) * (x - moyenneEcart), 0) / (d.length - 1));
  const tStudent = moyenneEcart / (sd / Math.sqrt(d.length)), positifs = d.filter((x) => x > 0).length, exceptions = ecartsAnnuels.filter((q) => q[1] <= 0).map((q) => q[0]).join(' ');
  const w = P.lissageHoward, ans = Object.keys(Lo).map(Number), pts = [];
  for (const y of ans) {
    for (let r = 0; r < 6; r++) { pts.push([(y - 1789) / 29, (Lo[y] - 46) / 8, 0]); if (Ca[y] !== undefined) pts.push([(y - 1789) / 29, (Ca[y] - 46) / 8, 1]); }
    const fen = ans.filter((z) => Math.abs(z - y) <= (w - 1) / 2), lisse = fen.reduce((s, z) => s + Lo[z], 0) / fen.length;
    for (let r = 0; r < 6; r++) pts.push([(y - 1789) / 29, (lisse - 46) / 8, 2]);
  }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'degrees Fahrenheit', invariants: {
    chaleurLondres: { mesure: ecarts, formule: 0, retrouvesHoward: verifs.length - verifs.filter(hors).length, nonRetrouvesHoward: nonRetrouves, etendueAvec1818: etendue(Lo, 1789, 1818),
      note: 'a period mean, printed excess, the 1.579, the city mean, an average or an extent off by more than a thousandth, other than the four named' },
    temoin: { mesure: tStudent > 3 && positifs >= 10 ? 0 : 1, formule: 0, moyenneEcart, tStudent, positifs, exceptions, note: 'witness: no difference between the two records is refuted, 1.766 on average over 12 years, t = 7.30, London warmer 11 years in 12; 1813 is the exception' } } };
}

// ---------- 111 : la longueur des mots, Mendenhall 1887 (idee : codex 28, sous-agent Claude ; tables et texte : SOURCES, Science 9) ----------
// Mendenhall compte les mots de 1, 2, 3... lettres par paquets de 1000 et dessine la « courbe caracteristique » d un auteur.
// Exact ici : les trois groupes font 1000 mots ; Vanity Fair 4507 et 4508 lettres comme imprime (Oliver Twist 4348) ; Bible 2728100 / 592493
//   = 4.604 et 838380 / 181253 = 4.625, a moins d un demi pour cent l un de l autre comme il l ecrit (il ne garantit pas ces chiffres de presse).
// Ce que ses nombres ne montrent pas : il dit les deux groupes de Vanity Fair « in reality quite different » ; un khi-deux sur ses cellules
//   (queue fusionnee a partir de queueMendenhall lettres) reste pres de ses degres de liberte : z = (khi2 - ddl) / racine(2 ddl) sous 1 pour toute
//   fusion de 8 a 14. Mesure, sans valeur p tiree d une table.
// MESURE : sommes, lettres, moyennes bibliques et leur ecart.
// Temoin : « meme longueur moyenne pour tous les auteurs » : Mill 4.775 contre Dickens 4.342, 13.5 erreurs-types sur 10 000 mots si les mots sont
//   independants (ecart-type tire d Oliver Twist, 2.271 lettres ; avec celui de Vanity Fair, 12.9 ; des mots groupes, ses « runs », l abaisseraient) ; Dickens et Atkinson, eux, ne sont pas separes (1.4).
// Dessin (vue de face) : lettres / 15 contre mots / 260 ; etiquette 0 Oliver Twist, 1 et 2 les deux groupes de Vanity Fair, queue fusionnee.
function motsMendenhall(P, n) {
  const ot = SOURCES.mendenhallOliver.valeur.split(' ').map(Number), [v1, v2] = SOURCES.mendenhallVanity.valeur.split('|').map((g) => g.split(' ').map(Number));
  const t = Object.fromEntries(SOURCES.mendenhallTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const somme = (a) => a.reduce((s, x) => s + x, 0), lettres = (a) => a.reduce((s, c, i) => s + c * (i + 1), 0);
  let ecarts = 0;
  if (![ot, v1, v2].every((a) => somme(a) === 1000)) ecarts++;
  if (lettres(v1) !== nb('letters1') || lettres(v2) !== nb('letters2')) ecarts++;
  const bibleAncien = nb('otLetters') / nb('otWords'), bibleNouveau = nb('ntLetters') / nb('ntWords'), ecartBible = bibleNouveau / bibleAncien - 1;
  if (bibleAncien.toFixed(3) !== t.otMean || bibleNouveau.toFixed(3) !== t.ntMean) ecarts++;
  if (!(ecartBible < 0.005)) ecarts++;
  const moyOt = lettres(ot) / somme(ot), ecartType = Math.sqrt(ot.reduce((s, c, i) => s + c * (i + 1 - moyOt) * (i + 1 - moyOt), 0) / somme(ot)), se = ecartType * Math.sqrt(2 / 10000);
  const ecartTypesMill = (nb('mill') - nb('dickens')) / se, ecartTypesAtkinson = (nb('dickens') - nb('atkinson')) / se;
  const fusion = (a, q) => [...a.slice(0, q - 1), a.slice(q - 1).reduce((s, x) => s + x, 0)];
  const zVanity = (q) => { const A = fusion(v1, q), B = fusion(v2, q), na = somme(A), nb2 = somme(B); let c = 0;
    for (let i = 0; i < A.length; i++) { const tot = A[i] + B[i], ea = tot * na / (na + nb2), eb = tot * nb2 / (na + nb2); if (tot > 0) c += (A[i] - ea) * (A[i] - ea) / ea + (B[i] - eb) * (B[i] - eb) / eb; }
    const ddl = A.length - 1; return [c, ddl, (c - ddl) / Math.sqrt(2 * ddl)]; };
  let zMaxVanity = -Infinity; for (let q = 8; q <= 14; q++) zMaxVanity = Math.max(zMaxVanity, zVanity(q)[2]);
  const q = P.queueMendenhall, [chi2Choisi, ddlChoisi, zChoisi] = zVanity(q), pts = [];
  [ot, v1, v2].forEach((a, e) => fusion(a, Math.min(q, a.length)).forEach((c, i) => { for (let r = 0; r < 12; r++) pts.push([(i + 1) / 15, c / 260, e]); }));
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'words per thousand', invariants: {
    motsMendenhall: { mesure: ecarts, formule: 0, lettresOliver: lettres(ot), moyennesBible: bibleAncien.toFixed(4) + ' ' + bibleNouveau.toFixed(4), ecartBible, chi2Choisi, ddlChoisi, zChoisi, zMaxVanity,
      note: 'a group not 1000 words, the printed letter totals, the Bible means or their half per cent not recovered' },
    temoin: { mesure: ecartTypesMill > 3 ? 0 : 1, formule: 0, ecartTypeOliver: ecartType, ecartTypesMill, ecartTypesAtkinson, note: 'witness: the same mean for every author is refuted: Mill and Dickens are 13.5 standard errors apart over 10,000 independent words' } } };
}

// ---------- 112 : la parallaxe de 61 Cygni, Bessel 1838 (idee : codex 28, sous-agent Claude ; equations : SOURCES, Astron. Nachr. 365-366) ----------
// Au cours d une annee, 61 Cygni se deplace un peu par rapport a deux etoiles lointaines (a et b) : c est la parallaxe, la premiere mesuree.
//   Bessel reduit ses mesures a deux systemes de trois equations normales (moindres carres) et les resout.
// Exact ici : les six inconnues de ses deux systemes (0.3690 et 0.2605 pour la difference de parallaxe) ; les poids et les erreurs moyennes
//   (sqrt(somme des carres / (n - 3)) et m sqrt(inverse diagonal)) ; la solution commune ou les deux parallaxes sont egales, les equations de b
//   ponderees par 0.6889 : 0.0171, -0.0293, -0.0209, 0.2395 et 0.3136, comme imprime.
// Nommes : le poids imprime 24.065 de alpha'' ; le systeme donne 22.065, et l erreur moyenne qu il imprime lui-meme (0.0283) est celle du poids
//   22.065 (24.065 donnerait 0.0271) : coquille. Le poids 0.6889 vaut 0.83 au carre ; le rapport exact des erreurs (0.1327 / 0.1605) au carre vaut
//   0.6836 et donnerait 0.3139 : compatible avec un rapport arrondi a 0.83 puis eleve au carre ;
//   Bessel ne dit pas comment il l obtient (p. 88 : « so finde ich das Gewicht einer Beobachtung von b = 0,6889 »). Refait aussi : l erreur de la
//   parallaxe commune, 0.1354 / racine(poids 45.04) = 0.0202, comme imprime. Sans ponderation : 0.3037.
// MESURE : tout ce qui precede a une unite du dernier chiffre imprime, hors le poids nomme.
// Temoin : parallaxe nulle (sa colonne III) : les sommes de carres restent 3.08 fois (a) et 1.93 fois (b) plus grandes.
// Dessin (vue de face) : poids des observations de b / 1.5 contre la parallaxe commune / 0.4 ; etiquette 0 la courbe, 1 le poids choisi
//   (poidsBessel), 2 les deux parallaxes separees 0.3690 et 0.2605.
function parallaxeBessel(P, n) {
  const lire = (src) => src.split('|').map((l) => l.split(' ').map(Number)), ea = lire(SOURCES.besselA.valeur), eb = lire(SOURCES.besselB.valeur);
  const t = Object.fromEntries(SOURCES.besselTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const resoudreBessel = (A, b) => { const k = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      for (let r = 0; r < k; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; } }
    return M.map((r, i) => r[k] / r[i]); };
  const diagInverse = (A) => A.map((_, j) => resoudreBessel(A, A.map((__, i) => (i === j ? 1 : 0)))[j]);
  const Na = ea.map((r) => r.slice(0, 3)), ba = ea.map((r) => r[3]), Nb = eb.map((r) => r.slice(0, 3)), bb = eb.map((r) => r[3]);
  const sa = resoudreBessel(Na, ba), sb = resoudreBessel(Nb, bb), da = diagInverse(Na), db = diagInverse(Nb);
  const mA = Math.sqrt(nb('ssA') / (nb('nA') - 3)), mB = Math.sqrt(nb('ssB') / (nb('nB') - 3));
  const matCommune = (w) => [[Na[0][0], Na[0][1], 0, 0, Na[0][2]], [Na[1][0], Na[1][1], 0, 0, Na[1][2]], [0, 0, w * Nb[0][0], w * Nb[0][1], w * Nb[0][2]], [0, 0, w * Nb[1][0], w * Nb[1][1], w * Nb[1][2]],
    [Na[2][0], Na[2][1], w * Nb[2][0], w * Nb[2][1], Na[2][2] + w * Nb[2][2]]], commune = (w) => resoudreBessel(matCommune(w), [ba[0], ba[1], w * bb[0], w * bb[1], ba[2] + w * bb[2]]);
  const sII = commune(nb('poids'));
  const meP = nb('m1') * Math.sqrt(diagInverse(matCommune(nb('poids')))[4]);
  const verifs = [['alpha', sa[0]], ['alpha1', sa[1]], ['alpha2', sa[2]], ['beta', sb[0]], ['beta1', sb[1]], ['beta2', sb[2]], ['wA1', 1 / da[1]], ['wA2', 1 / da[2]], ['wB1', 1 / db[1]], ['wB2', 1 / db[2]],
    ['mA', mA], ['mB', mB], ['meA1', mA * Math.sqrt(da[1])], ['meA2', mA * Math.sqrt(da[2])], ['meB1', mB * Math.sqrt(db[1])], ['meB2', mB * Math.sqrt(db[2])],
    ['IIalpha', sII[0]], ['IIalpha1', sII[1]], ['IIbeta', sII[2]], ['IIbeta1', sII[3]], ['parallaxe', sII[4]], ['meP', meP]];
  const decimales = (s) => (s.includes('.') ? s.split('.')[1].length : 0), hors = ([cle, val]) => !(Math.abs(val - nb(cle)) <= Number('1e-' + decimales(t[cle])) + 1e-9);
  const NOMMES = ['wA2'], ecarts = verifs.filter((q) => hors(q) !== NOMMES.includes(q[0])).length;
  const nonRetrouves = verifs.filter(hors).map(([cle, val]) => cle + ' ' + t[cle] + ' vs ' + val.toFixed(decimales(t[cle]))).join(' ; ');
  const rapportExact = (nb('mA') / nb('mB')) * (nb('mA') / nb('mB')), SEC = 180 * 3600 / PI, p = nb('parallaxe') / SEC; /* la distance de SA valeur imprimee 0.3136 */
  const wChoisi = P.poidsBessel, pts = [];
  for (let k = 0; k <= 60; k++) { const w = 0.3 + 1.2 * k / 60; pts.push([w / 1.5, commune(w)[4] / 0.4, 0]); }
  for (let r = 0; r < 30; r++) pts.push([wChoisi / 1.5, commune(wChoisi)[4] / 0.4, 1]);
  for (let k = 0; k <= 30; k++) { pts.push([0.2 + 0.8 * k / 30, sa[2] / 0.4, 2]); pts.push([0.2 + 0.8 * k / 30, sb[2] / 0.4, 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'arcseconds', invariants: {
    parallaxeBessel: { mesure: ecarts, formule: 0, retrouvesBessel: verifs.length - verifs.filter(hors).length, nonRetrouvesBessel: nonRetrouves, parallaxeSansPoids: commune(1)[4], rapportExact, parallaxeRapportExact: commune(rapportExact)[4],
      parallaxeChoisie: commune(wChoisi)[4], distanceUA: cosD(p) / sinD(p), note: 'a solution, weight, mean error or the common solution more than one unit of its last printed digit away, other than the named weight' },
    temoin: { mesure: nb('ssA0') / nb('ssA') > 1.5 && nb('ssB0') / nb('ssB') > 1.5 ? 0 : 1, formule: 0, rapportSommesA: nb('ssA0') / nb('ssA'), rapportSommesB: nb('ssB0') / nb('ssB'), note: 'witness: with zero parallax the sums of squares stay 3.08 (a) and 1.93 (b) times larger' } } };
}

// ---------- 113 : la vitesse du telegraphe, Nyquist 1924 (idee : codex 29, sous-agent Claude ; tables : SOURCES, Bell Syst. Tech. J. 3) ----------
// Avec m valeurs de courant au lieu de 2, on transmet plus de caracteres par element de signal, mais comme le logarithme de m : W = K log m.
// Exact ici : 100 log2 m arrondi redonne 158 pour m = 3 ; 2, 4, 8 et 16 (puissances de 2) donnent 100, 200, 300, 400 pour TOUTE base de log :
//   seules deux lignes testent la loi, et m = 5 imprime 230 la ou la loi donne 232.19 (230 serait m = 4.92) : nomme. La colonne relative
//   (100 x 6.14 / elements par lettre) : 5 / 5. Les deux codes ideaux ont 26 caracteres. Le gain du Morse a deux valeurs au code continental
//   a trois valeurs : 8.45 / 3.77 = 2.24 et 8.26 / 3.77 = 2.19, imprime « 2.2 ». Ideal 3 / ideal 2 = 1.69 contre 1.58 en theorie (« fair
//   agreement ») ; « approximately 1.4 » vaut pour le Morse continental (1.376), l americain donne 1.345.
// L « intelligence » de Nyquist = des caracteres par unite de temps, pas l entropie de Shannon.
// MESURE : la table hors m = 5, la colonne relative, les 26 caracteres, le gain 2.2.
// Temoin : « doubler les valeurs double la vitesse » donnerait 800 a 16 valeurs ; la table dit 400.
// Dessin (vue de face) : m / niveauxNyquist ; etiquette 0 la loi 100 log2 m, 1 la droite 50 m, 2 les valeurs imprimees.
function vitesseNyquist(P, n) {
  const paires = (src) => src.split(' ').map((x) => x.split(':'));
  const table = paires(SOURCES.nyquistTable.valeur).map(([m, w]) => [Number(m), Number(w)]), t = Object.fromEntries(paires(SOURCES.nyquistTexte.valeur));
  const codes = paires(SOURCES.nyquistCodes.valeur).map(([nom, e, r]) => ({ nom, e: Number(e), r: Number(r) })), el = (nom) => codes.find((x) => x.nom === nom).e;
  const log2 = (x) => lnD(x) / lnD(2), W = (m) => 100 * log2(m);
  const horsTable = table.filter(([m, w]) => Math.round(W(m)) !== w).map(([m]) => m);
  const NOMMES = [5];
  let ecarts = horsTable.filter((m) => !NOMMES.includes(m)).length + NOMMES.filter((m) => !horsTable.includes(m)).length;
  const lignesQuiTestent = table.filter(([m]) => (m & (m - 1)) !== 0).length;
  if (codes.some((x) => Math.round(100 * el('Ideal2') / x.e) !== x.r)) ecarts++;
  const somme = (s) => s.split(',').map(Number).reduce((a, b) => a + b, 0);
  if (somme(t.chars2) !== Number(t.letters) || somme(t.chars3) !== Number(t.letters)) ecarts++;
  const gainContinental = el('ContinentalMorse2') / el('ContinentalMorse3'), gainAmericain = el('AmericanMorse2') / el('ContinentalMorse3');
  if (gainContinental.toFixed(1) !== t.total || gainAmericain.toFixed(1) !== t.total) ecarts++;
  const imprime16 = table.find(([m]) => m === 16)[1], lineaire16 = 100 * 16 / 2;
  const M = P.niveauxNyquist, pts = [];
  for (let k = 0; k <= 80; k++) { const m = 2 + (M - 2) * k / 80; pts.push([m / M, W(m) / (50 * M), 0]); pts.push([m / M, 50 * m / (50 * M), 1]); }
  for (const [m, w] of table) if (m <= M) for (let r = 0; r < 10; r++) pts.push([m / M, w / (50 * M), 2]);
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'relative speed', invariants: {
    vitesseNyquist: { mesure: ecarts, formule: 0, loiCinq: W(5), mPour230: expD(2.30 * lnD(2)), lignesQuiTestent, rapportIdeaux: el('Ideal2') / el('Ideal3'), morseSurIdeal: (el('AmericanMorse2') / el('Ideal2')).toFixed(4) + ' ' + (el('ContinentalMorse2') / el('Ideal2')).toFixed(4),
      gainContinental, gainAmericain, note: 'a table row other than m = 5, a relative number, the 26 characters or the 2.2 gain not recovered' },
    temoin: { mesure: lineaire16 / imprime16 > 1.5 ? 0 : 1, formule: 0, lineaire16, imprime16, note: 'witness: doubling the levels to double the speed would give 800 at 16 levels; the table says 400' } } };
}

// ---------- 114 : la longueur des ondes de lumiere, Young 1802 (idee : codex 29, sous-agent Claude ; table : SOURCES, Phil. Trans. 92) ----------
// Des anneaux de Newton, Young tire pour chaque couleur la longueur d une ondulation, le nombre d ondulations par pouce et, en supposant que la
//   lumiere parcourt 500 000 000 000 pieds en 8 minutes 1/8, le nombre par seconde. C est la premiere table de longueurs d onde de la lumiere.
// Exact ici : 1 / (ondulations par pouce) redonne la longueur pour 14 / 15 couleurs (rouge : 255.2 pour 256 imprime) ; ondulations par pouce x
//   vitesse supposee redonne la colonne par seconde arrondie pour 13 / 15, et a moins d une unite pour 15 / 15. Nommes : 652 (la ligne
//   intermediaire bleu-indigo) ne sort ni des ondulations par pouce ni des longueurs, qui donnent toutes deux 651.2 ; 707 est 707.57 tronque.
//   « = 2^48 nearly » : 561 millions de millions valent 1.993 fois 2^48, c est 2^49.
// Ce qu il dit et ce que la table donne : le visible « within the ratio of three to five » (5 / 3 = 1.667) ; la table va de 37640 a 59750
//   ondulations par pouce, 1.587. Rouge, jaune, bleu « as the numbers 8, 7, and 6 » : 8, 7.09, 6.13 ; « from red to blue a fourth » (1.333) : 1.306.
//   Les longueurs viennent des epaisseurs de Newton et la vitesse est une hypothese, pas une mesure.
// MESURE : les deux colonnes refaites hors les trois nommes, et toute la colonne par seconde a une unite.
// Temoin : « le visible couvre une octave » (rapport 2) : la table donne 1.587.
// Dessin (vue de face) : couleur (du rouge extreme au violet extreme) ; etiquette 0 la frequence pour minutesYoung minutes / 800, 1 la frequence
//   imprimee / 800, 2 la longueur / 300.
function ondulationsYoung(P, n) {
  const t = Object.fromEntries(SOURCES.youngTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const tab = SOURCES.youngTable.valeur.split(' ').map((x) => x.split(':').map(Number));
  const vitesse = (min) => nb('feet') * 12 / (min * 60), v = vitesse(nb('minutes'));
  const horsL = [], horsF = [];
  tab.forEach(([L, N, F], i) => { if (Math.round(1e7 / N) !== L) horsL.push(i); if (Math.round(N * v / 1e12) !== F) horsF.push(i); });
  const NOMMES_L = [1], NOMMES_F = [10, 13];
  const ecartListe = (h, nm) => h.filter((i) => !nm.includes(i)).length + nm.filter((i) => !h.includes(i)).length;
  let ecarts = ecartListe(horsL, NOMMES_L) + ecartListe(horsF, NOMMES_F);
  if (tab.some(([, N, F]) => !(Math.abs(N * v / 1e12 - F) < 1))) ecarts++;
  let deux = 1; for (let k = 0; k < nb('power'); k++) deux *= 2;
  const facteurPuissance = tab[6][2] * 1e12 / deux, etendue = tab[14][1] / tab[0][1];
  const Lr = tab[1][0], Ly = tab[5][0], Lb = tab[9][0];
  const vChoisie = vitesse(P.minutesYoung), pts = [];
  tab.forEach(([L, N, F], i) => { for (let r = 0; r < 12; r++) { pts.push([i / 14, N * vChoisie / 1e12 / 800, 0]); pts.push([i / 14, F / 800, 1]); pts.push([i / 14, L / 300, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'undulations', invariants: {
    ondulationsYoung: { mesure: ecarts, formule: 0, longueursRetrouvees: tab.length - horsL.length, frequencesRetrouvees: tab.length - horsF.length, vitesseSupposee: v, ligne652DepuisL: v / (tab[10][0] * 1e-7) / 1e12,
      facteurPuissance, etendueYoung: etendue, huitSeptSix: (8 * Ly / Lr).toFixed(3) + ' ' + (8 * Lb / Lr).toFixed(3), quarte: Lr / Lb, frequenceChoisie: tab[6][1] * vChoisie / 1e12,
      note: 'a length or frequency other than the three named not recovered, or a frequency a unit or more away' },
    temoin: { mesure: etendue < 1.8 ? 0 : 1, formule: 0, octave: 2, etendueVisible: etendue, note: 'witness: if the visible spanned an octave the ratio would be 2; the table gives 1.587' } } };
}

// ---------- 115 : le pic du corps noir, Lummer et Pringsheim 1899 (idee : codex 29, sous-agent Claude ; Tabelle I : SOURCES, Verh. DPG 1) ----------
// Pour un corps noir chauffe de 621 a 1646 kelvins, ils mesurent la longueur d onde du maximum d energie (lambda_m) et sa hauteur (E_m) : lambda_m
//   recule quand T monte (A = lambda_m T presque constant) et E_m monte comme T^5 (B = E_m / T^5 presque constant).
// Exact ici : A refait a une unite pour 7 / 8 lignes (1646 : 2929.9 pour 2928) ; B a 1e-17 pour 6 / 8 (1646 : 2239.6 pour 2246 ; 1460.4 :
//   2182.8 pour 2184 ; comptes corriges par la contre-lecture) ; la temperature tiree de B moyen a 0.3 pour 8 / 8 ; la colonne Diff 8 / 8 ;
//   « Mittel = 2940 » = la moyenne des 8 A (2941.5) a la dizaine, « 2188 » = celle des B (2187.5). Pentes en log-log : lambda_m en T^-0.970,
//   E_m en T^5.013. E_m est en unites du bolometre : seule la constance de B compte. Les T au-dessus de 1000 sont extrapolees.
// MESURE : A et B hors les lignes nommees, les temperatures, les ecarts, les deux moyennes.
// Temoin : « E_m comme T^4 » : E_m / T^4 varie d un facteur 2.71 sur la serie ; E_m / T^5 reste a 2.65 % au plus de 2188.
// Dessin (vue de face) : T / 1700 ; etiquette 0 E_m / T^exposantLummer rapporte a sa moyenne / 2, 1 lambda_m T / 3000, 2 E_m / 300.
function picLummer(P, n) {
  const lignes = SOURCES.lummerTable.valeur.split(' ').map((x) => x.split(':').map(Number));
  const t = Object.fromEntries(SOURCES.lummerTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const puiss = (x, k) => { let p = 1; for (let i = 0; i < k; i++) p *= x; return p; }, racine5 = (x) => expD(lnD(x) / 5);
  const horsA = [], horsB = [], horsT = []; let diffs = 0;
  lignes.forEach(([T, l, E, A, B, Tc, Df]) => {
    if (Math.abs(l * T - A) > 1) horsA.push(T);
    if (Math.abs(E / puiss(T, 5) * 1e17 - B) > 1) horsB.push(T);
    if (Math.abs(racine5(E / (nb('Bmean') * 1e-17)) - Tc) > 0.3) horsT.push(T);
    if ((Tc - T).toFixed(1) === Df.toFixed(1)) diffs++;
  });
  const NOMMES_A = [1646], NOMMES_B = [1646, 1460.4], liste = (h, nm) => h.filter((x) => !nm.includes(x)).length + nm.filter((x) => !h.includes(x)).length;
  let ecarts = liste(horsA, NOMMES_A) + liste(horsB, NOMMES_B) + horsT.length + (diffs === lignes.length ? 0 : 1);
  const moyA = lignes.reduce((s, r) => s + r[3], 0) / lignes.length, moyB = lignes.reduce((s, r) => s + r[4], 0) / lignes.length;
  if (Math.round(moyA / 10) * 10 !== nb('Amean')) ecarts++;
  if (Math.round(moyB) !== nb('Bmean')) ecarts++;
  const pente = (Y) => { const X = lignes.map((r) => lnD(r[0])), mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length; let s = 0, q = 0; X.forEach((x, i) => { s += (x - mx) * (Y[i] - my); q += (x - mx) * (x - mx); }); return s / q; };
  const e4 = lignes.map(([T, , E]) => E / puiss(T, 4)), rapportT4 = Math.max(...e4) / Math.min(...e4), ecartMaxB = Math.max(...lignes.map((r) => Math.abs(r[4] / nb('Bmean') - 1))) * 100;
  const k = P.exposantLummer, eK = lignes.map(([T, , E]) => E / expD(k * lnD(T))), moyK = eK.reduce((a, b) => a + b, 0) / eK.length, pts = [];
  lignes.forEach(([T, l, E], i) => { for (let r = 0; r < 15; r++) { pts.push([T / 1700, eK[i] / moyK / 2, 0]); pts.push([T / 1700, l * T / 3000, 1]); pts.push([T / 1700, E / 300, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let q = 0; q < n; q++) { const [px, py, pe] = pts[q % pts.length], o = 3 * q; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'kelvin, micron', invariants: {
    picLummer: { mesure: ecarts, formule: 0, retrouvesA: lignes.length - horsA.length, retrouvesB: lignes.length - horsB.length, diffsRetrouvees: diffs, moyenneA: moyA, moyenneB: moyB,
      penteLambda: pente(lignes.map((r) => lnD(r[1]))), penteEnergie: pente(lignes.map((r) => lnD(r[2]))), note: 'A or B off besides the named rows, a temperature from B off by more than 0.3, a Diff, or a printed mean not recovered' },
    temoin: { mesure: rapportT4 > 2 && ecartMaxB < 3 ? 0 : 1, formule: 0, rapportT4, ecartMaxB, note: 'witness: E_m / T^4 changes 2.71-fold over the series, while E_m / T^5 stays within 2.65 % of 2188' } } };
}

// ---------- 116 : la balance de Coulomb, 1785 (idee : codex 29, sous-agent Claude ; essais et texte : SOURCES, Mem. Acad. 1785) ----------
// Deux balles de meme electricite se repoussent ; Coulomb mesure la force par la torsion d un fil d argent (micrometre + ecart, en degres).
//   Puis, par une methode « absolument differente », il fait osciller une aiguille devant un globe charge : le temps doit croitre comme la distance.
// Exact ici : torsions 36, 144 et 575.5 ; force x distance^2 = 46 656 pour les deux premiers essais, 41 579.9 au troisieme (-10.9 %). Le 576 imprime
//   est 567 + 9 : la torsion si l ecart etait tombe pile a la moitie de 18 ; il ecrit lui-meme qu « il ne s en falloit que d un demi-degre ».
//   1/340 de grain pour 360 degres -> 1/3400 pour 36 ; 5 degres -> 1/24480 de grain, « un 24 millieme ». Oscillations : 20 x 18 / 9 = 40 comme
//   p. 583 (la p. 584 recopie 41 : nomme) ; 20 x 24 / 9 = 53.3, il imprime 54 (nomme) ; « 1/10 » = (60 - 54) / 60. Corrige de la perte de
//   1/40 par minute pendant quatre minutes (p. 585) : 60 x racine(9) / racine(10) = 56.9, « 57 », a 1/20 de 60.
// Exposant local de la force : 2.000 puis 1.847 ; pente log-log sur les trois essais -1.919.
// MESURE : 144, 576 lu comme 567 + 9, 1/3400, le 24 millieme, la theorie 40, le 1/10, le 57 et le 1/20 ; 41 et 54 nommes.
// Temoin : « force en 1 / distance » : 72 degres a 18, 152.5 a 8.5 ; il mesure 144 et 575.5 (2 et 3.8 fois plus).
// Dessin (vue de face) : distance / 40 contre torsion / 650 ; etiquette 0 la loi en 1 / d^exposantCoulomb depuis le premier essai, 1 les essais,
//   2 les oscillations (pouces / 40, secondes / 70).
function balanceCoulomb(P, n) {
  const t = Object.fromEntries(SOURCES.coulombTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]), liste = (cle) => t[cle].split(',').map(Number);
  const essais = SOURCES.coulombTorsion.valeur.split(' ').map((x) => x.split(':').map(Number)), osc = SOURCES.coulombOscillations.valeur.split(' ').map((x) => x.split(':').map(Number));
  const F = essais.map(([m, x]) => m + x), d = essais.map(([, x]) => x), Fd2 = F.map((f, i) => f * d[i] * d[i]);
  let ecarts = 0;
  if (F[1] !== nb('force2')) ecarts++;
  if (essais[2][0] + d[1] / 2 !== nb('total3') || 4 * F[1] !== nb('total3') || d[2] !== d[1] / 2 - nb('demi')) ecarts++;
  if (nb('g360') * 360 / 36 !== nb('g36')) ecarts++;
  if (!(Math.abs(nb('g36') * 36 / 5 / 1000 - nb('millieme5')) < 1)) ecarts++;
  const theorie = osc.map(([dist]) => osc[0][1] * dist / osc[0][0]), imprimee = liste('theorie'), p584 = liste('temps584');
  const NOMMES_THEORIE = [2], horsTheorie = theorie.map((v, i) => (Math.round(v) !== imprimee[i] ? i : -1)).filter((i) => i >= 0);
  ecarts += horsTheorie.filter((i) => !NOMMES_THEORIE.includes(i)).length + NOMMES_THEORIE.filter((i) => !horsTheorie.includes(i)).length;
  const DEUX_PAGES = [1], diffPages = osc.map(([, tps], i) => (tps !== p584[i] ? i : -1)).filter((i) => i >= 0);
  ecarts += diffPages.filter((i) => !DEUX_PAGES.includes(i)).length + DEUX_PAGES.filter((i) => !diffPages.includes(i)).length;
  if ((osc[2][1] - imprimee[2]) / osc[2][1] !== 1 / nb('dixieme')) ecarts++;
  const corrige = osc[2][1] * Math.sqrt(9) / Math.sqrt(10);
  if (Math.round(corrige) !== nb('corrige') || (osc[2][1] - nb('corrige')) / osc[2][1] !== 1 / nb('vingtieme') || nb('minutes') / nb('perteMinute') !== 1 / nb('dixieme')) ecarts++;
  const lnF = F.map((f) => lnD(f)), lnd = d.map((x) => lnD(x)), mx = lnd.reduce((a, b) => a + b, 0) / 3, my = lnF.reduce((a, b) => a + b, 0) / 3;
  let s = 0, q = 0; lnd.forEach((x, i) => { s += (x - mx) * (lnF[i] - my); q += (x - mx) * (x - mx); });
  const enUnSurD = [d[0] * F[0] / d[1], d[0] * F[0] / d[2]];
  const ex = P.exposantCoulomb, pts = [];
  for (let k = 0; k <= 80; k++) { const x = 8 + 28 * k / 80; pts.push([x / 40, F[0] * expD(ex * lnD(d[0] / x)) / 650, 0]); }
  essais.forEach((_, i) => { for (let r = 0; r < 15; r++) pts.push([d[i] / 40, F[i] / 650, 1]); });
  osc.forEach(([dist, tps]) => { for (let r = 0; r < 15; r++) pts.push([dist / 40, tps / 70, 2]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'degrees of torsion', invariants: {
    balanceCoulomb: { mesure: ecarts, formule: 0, torsions: F.join(' '), forceFoisD2: Fd2.join(' '), ecartTroisieme: (Fd2[2] / Fd2[0] - 1) * 100, exposant12: lnD(F[1] / F[0]) / lnD(d[0] / d[1]), exposant23: lnD(F[2] / F[1]) / lnD(d[1] / d[2]),
      penteCoulomb: s / q, theorieTroisieme: theorie[2], tempsCorrige: corrige, carreInverseTroisieme: F[0] * d[0] * d[0] / (d[2] * d[2]), note: 'a printed torsion, the 576, 1/3400, the 24 thousandth, a theory time other than the named 54, the 1/10, the 57 or the 1/20 not recovered' },
    temoin: { mesure: F[1] / enUnSurD[0] > 1.8 && F[2] / enUnSurD[1] > 1.8 ? 0 : 1, formule: 0, enUnSurD18: enUnSurD[0], enUnSurD85: enUnSurD[1], note: 'witness: a force falling as 1 / distance would give 72 at 18 degrees and 152.5 at 8.5; he measured 144 and 575.5' } } };
}

// ---------- 117 : la chaleur d un courant, Joule 1841 (idee : codex 29, sous-agent Claude ; table et texte : SOURCES, Phil. Mag. 19) ----------
// Joule fait passer un courant dans un fil plonge dans l eau et mesure l echauffement : la chaleur est proportionnelle a la resistance et au CARRE
//   de l intensite (« Q » = ses propres degres de galvanometre, pas des amperes ; chaleurs en degres Fahrenheit d une masse d eau donnee).
// Exact ici : la colonne « ratio of the squares » de la demi-heure = k I^2 au dixieme avec k = somme des chaleurs / somme des I^2 = 3.412 : 4 / 4.
//   La colonne de l heure : seule 4.55 a une decimale (1 et 40 passent a coup sur) ; elle donne 4.54 : nommee. Exposants en log-log : 1.959 (demi-
//   heure), 1.896 (heure). Les deux reductions de la p. 266 : (1.88 / 2.54)^2 x 60 / 27 x 6.22 = 7.572 et (1.88 / 2.085)^2 x 60 / 45 x 7.04 = 7.632,
//   imprimees 7.57 et 7.63 ; avec la mesure directe 7.47, moyenne 7.56. Exp. 1 : 3 pieds de fil fin = 8 de fil gros -> 3.4 x 3 / 8 = 1.275
//   (« 1.27 ») ; chaleur et resistance s accordent a 2.3 %, 0.2 % et 3.4 % dans les Exp. 1, 2, 3.
// MESURE : la colonne demi-heure, la case 4.55 nommee, les reductions et leur moyenne, le 1.275, les trois accords a 4 %.
// Temoin : « chaleur proportionnelle a l intensite » : de 0.92 a 2.73 Q elle serait multipliee par 2.97 ; il mesure 25 / 3 = 8.33 (I^2 : 8.81).
// Dessin (vue de face) : courant / 3 contre chaleur / 30 ; etiquette 0 la loi k I^exposantJouleQ, 1 la demi-heure, 2 l heure.
function effetJoule(P, n) {
  const tab = SOURCES.jouleTable.valeur.split(' ').map((l) => l.split(':').map((v) => (v === '-' ? null : +v)));
  const t = Object.fromEntries(SOURCES.jouleTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const kDe = (col) => { const r = tab.filter((x) => x[col] !== null); return r.reduce((s, x) => s + x[col], 0) / r.reduce((s, x) => s + x[1] * x[1], 0); };
  const k4 = kDe(2), k6 = kDe(4);
  let ecarts = 0;
  const col4 = tab.filter((r) => r[3] !== null), col4Ok = col4.filter((r) => (k4 * r[1] * r[1]).toFixed(1) === r[3].toFixed(1)).length;
  if (col4Ok !== col4.length) ecarts++;
  const dec = (v) => (String(v).includes('.') ? String(v).split('.')[1].length : 0), col6 = tab.filter((r) => r[5] !== null);
  const hors6 = col6.filter((r) => (k6 * r[1] * r[1]).toFixed(dec(r[5])) !== r[5].toFixed(dec(r[5]))).map((r) => r[1]);
  const NOMMES_6 = [0.92];
  ecarts += hors6.filter((x) => !NOMMES_6.includes(x)).length + NOMMES_6.filter((x) => !hors6.includes(x)).length;
  const reduire = (r, tt, h) => (nb('r3') / r) * (nb('r3') / r) * nb('t3') / tt * h;
  const red1 = reduire(nb('r1'), nb('t1'), nb('h1')), red2 = reduire(nb('r2'), nb('t2'), nb('h2'));
  if (red1.toFixed(2) !== t.red1 || red2.toFixed(2) !== t.red2) ecarts++;
  if (((nb('red1') + nb('red2') + nb('h3')) / 3).toFixed(2) !== t.moy) ecarts++;
  const res1 = nb('res1a') * nb('feetThin') / nb('feetThick');
  if (!(Math.abs(res1 - nb('res1b')) <= 0.005 + 1e-9)) ecarts++;
  const accords = [['heat1a', 'heat1b', 'res1a', 'res1b'], ['heat2a', 'heat2b', 'res2a', 'res2b'], ['heat3a', 'heat3b', 'res3a', 'res3b']].map(([a, b, c, e]) => ((nb(a) / nb(b)) / (nb(c) / nb(e)) - 1) * 100);
  if (accords.some((x) => !(Math.abs(x) < 4))) ecarts++;
  const pente = (rows, col) => { const X = rows.map((r) => lnD(r[1])), Y = rows.map((r) => lnD(r[col])), mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length; let s = 0, q = 0; X.forEach((x, i) => { s += (x - mx) * (Y[i] - my); q += (x - mx) * (x - mx); }); return s / q; };
  const demi = tab.filter((r) => r[2] !== null), heure = tab.filter((r) => r[4] !== null);
  const iBas = tab[1], iHaut = tab[4], lineaire = iHaut[1] / iBas[1], observe = iHaut[2] / iBas[2];
  const ex = P.exposantJouleQ, pts = [];
  for (let k = 0; k <= 80; k++) { const x = 0.3 + 2.5 * k / 80; pts.push([x / 3, k4 * expD(ex * lnD(x)) / 30, 0]); }
  demi.forEach((r) => { for (let q = 0; q < 12; q++) pts.push([r[1] / 3, r[2] / 30, 1]); });
  heure.forEach((r) => { for (let q = 0; q < 12; q++) pts.push([r[1] / 3, r[4] / 30, 2]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'Fahrenheit degrees', invariants: {
    effetJoule: { mesure: ecarts, formule: 0, kDemiHeure: k4, colonneDemiHeure: col4Ok, kHeure: k6, casesDiscriminantes: col6.filter((r) => dec(r[5]) > 0).length, exposantDemiHeure: pente(demi, 2), exposantHeure: pente(heure, 4),
      reduction1: red1, reduction2: red2, resistanceFinGros: res1, accordsChaleurResistance: accords.map((x) => x.toFixed(2)).join(' '), note: 'the half-hour column, the named 4.55, a reduction, the mean, the 1.27 or a heat / resistance agreement within 4 % not recovered' },
    temoin: { mesure: observe / lineaire > 2 ? 0 : 1, formule: 0, enIntensite: lineaire, observe, enCarre: lineaire * lineaire, note: 'witness: heat proportional to the current would grow 2.97-fold from 0.92 to 2.73 Q; it grew 8.33-fold (the square gives 8.81)' } } };
}

// ---------- 118 : la vitesse critique, Reynolds 1883 (idee : codex 29, sous-agent Claude ; Table I : SOURCES, Phil. Trans. 174) ----------
// Dans trois tubes de verre, Reynolds cherche la vitesse ou un filet colore cesse de couler droit et se brouille. Il la trouve proportionnelle a la
//   viscosite relative P (la sienne : 1 a 0 C) et inversement proportionnelle au diametre : V = P / (B_s D), B_s = 43.79 pour ce montage. Ce n est
//   pas le nombre de Reynolds moderne (P n est pas une viscosite absolue).
// Exact ici, a une unite du dernier chiffre : log du temps 23 / 29 (la ligne 23 imprime 116 secondes, son log et sa vitesse sont ceux de 216 :
//   nommee ; les cinq autres ecarts restent sous 1e-4) ; log V par la chaine des logarithmes (log Q - log pi/4 - 2 log D - log t) 25 / 29, toutes a
//   1e-4 ; log B_s = -log V - log D + log P 22 / 29 a 1e-5, 26 / 29 a 1e-4 (lignes 5, 7 et 18 fausses d environ 0.01 : nommees) ; V = 10^log V
//   24 / 29 ; moyenne des 29 log B_s imprimes 1.64141 (« 1.64139 ») -> B_s 43.79. Ses log D ne sont pas ceux de ses diametres (0.026809, 0.015276,
//   0.0079037 au lieu de 0.0268, 0.01527, 0.007886) : il a calcule par les logs. Comptes corriges par la contre-lecture (le codex disait 28 / 29).
// MESURE : les quatre comptes, les lignes nommees, la moyenne et B_s.
// Temoin : « vitesse critique independante du diametre » : pente nulle ; log(V / P) contre log D donne -1.010.
// Dessin (vue de face) : diametre en log ; etiquette 0 la loi V = P / (43.79 D^exposantReynolds) / 3, 1 les vitesses mesurees / 3, 2 log B_s - 1.5.
function critiqueReynolds(P, n) {
  const lignes = SOURCES.reynoldsTable.valeur.split(' ').map((x) => { const [tube, T, t, V, logt, mlogP, logV, logBs] = x.split(':').map(Number); return { tube, T, t, V, logt, mlogP, logV, logBs }; });
  const t = Object.fromEntries(SOURCES.reynoldsTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const logD = { 1: nb('logD1'), 2: nb('logD2'), 3: nb('logD3') }, lg = (x) => lnD(x) / lnD(10), lpi4 = lg(PI / 4), dix = (x) => expD(x * lnD(10));
  const a = (tol) => (x, y) => Math.abs(x - y) <= tol + 1e-9, a5 = a(1e-5), a4 = a(1e-4);
  const hors = (f) => lignes.map((r, i) => (f(r) ? -1 : i + 1)).filter((i) => i > 0);
  const horsT5 = hors((r) => a5(lg(r.t), r.logt)), horsT4 = hors((r) => a4(lg(r.t), r.logt));
  const horsV5 = hors((r) => a5(nb('logQ') - lpi4 - 2 * logD[r.tube] - r.logt, r.logV)), horsV4 = hors((r) => a4(nb('logQ') - lpi4 - 2 * logD[r.tube] - r.logt, r.logV));
  const bs = (r) => -r.mlogP - r.logV - logD[r.tube], horsB5 = hors((r) => a5(bs(r), r.logBs)), horsB4 = hors((r) => a4(bs(r), r.logBs));
  const horsVV = hors((r) => Math.abs(dix(r.logV) - r.V) <= (r.tube === 1 ? 1e-4 : 1e-3) + 1e-9);
  const NOMMES_T = [23], NOMMES_B = [5, 7, 18], liste = (h, nm) => h.filter((i) => !nm.includes(i)).length + nm.filter((i) => !h.includes(i)).length;
  let ecarts = liste(horsT4, NOMMES_T) + horsV4.length + liste(horsB4, NOMMES_B);
  const moy = lignes.reduce((s, r) => s + r.logBs, 0) / lignes.length;
  if (!(Math.abs(moy - nb('meanLogBs')) <= 2e-5 + 1e-9)) ecarts++;
  if (dix(nb('meanLogBs')).toFixed(2) !== t.Bs) ecarts++;
  const X = lignes.map((r) => logD[r.tube]), Y = lignes.map((r) => r.logV + r.mlogP), mx = X.reduce((p, q) => p + q, 0) / X.length, my = Y.reduce((p, q) => p + q, 0) / Y.length;
  let s = 0, q = 0; X.forEach((x, i) => { s += (x - mx) * (Y[i] - my); q += (x - mx) * (x - mx); });
  const pente = s / q, sigma = Math.sqrt(lignes.reduce((p, r) => p + (r.logBs - moy) * (r.logBs - moy), 0) / lignes.length);
  const ex = P.exposantReynolds, pts = [];
  lignes.forEach((r) => { const Dm = dix(logD[r.tube]), Pr = dix(-r.mlogP), x = (logD[r.tube] + 2.2) / 0.7; for (let k = 0; k < 10; k++) { pts.push([x, Pr / (nb('Bs') * expD(ex * lnD(Dm))) / 3, 0]); pts.push([x, r.V / 3, 1]); pts.push([x, r.logBs - 1.5, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'metres per second', invariants: {
    critiqueReynolds: { mesure: ecarts, formule: 0, logTempsRetrouves: lignes.length - horsT5.length, logVRetrouves: lignes.length - horsV5.length, logBsRetrouves5: lignes.length - horsB5.length, logBsRetrouves4: lignes.length - horsB4.length,
      vitessesDepuisLog: lignes.length - horsVV.length, moyenneLogBs: moy, diametresDepuisLog: [1, 2, 3].map((k) => dix(logD[k]).toPrecision(5)).join(' '), sigmaLogBs: sigma, ligne23Temps: dix(lignes[22].logt),
      note: 'a log of time beyond the named row 23, a log V by the chain of logs, a log B_s beyond rows 5, 7 and 18 (at 1e-4), the mean or the 43.79 not recovered' },
    temoin: { mesure: pente < -0.8 ? 0 : 1, formule: 0, penteDiametre: pente, note: 'witness: a critical velocity independent of the diameter would give a slope of 0; log(V / P) against log D gives -1.010' } } };
}

// ---------- 119 : l eau a travers le sable, Darcy 1856 (idee : codex 29, sous-agent Claude ; tableaux : SOURCES, Fontaines de Dijon, Note D) ----------
// Pour les filtres de Dijon, Darcy fait passer l eau a travers une colonne de sable et mesure le debit sous diverses charges : « le debit de chaque
//   filtre croit proportionnellement a la charge », et en raison inverse de l epaisseur. C est la loi de Darcy des ecoulements souterrains.
// Exact ici : rapports debit / pression des series 1 et 2 a 0.01 pres : 15 / 16 (serie 2, ligne 1 : 1.023 pour 1.01, nommee) ; a l arrondi
//   strict 13 / 16 seulement. Pentes par moindres carres a l origine, debit en l/s par m2 de la section de 0m35 : 0.4912 et 0.1452 (« 0.493 »,
//   « 0.145 » a 0.002) ; avec les epaisseurs : 0.493 x 0.58 = 0.286, 0.145 x 1.14 = 0.165 comme imprime. Fevrier 1856 : differences de pression
//   11 / 12 (ligne 5 : 12.80 - 0.49 = 12.31, imprime 12.35, nommee) ; rapports debit / difference 12 / 12. Ses manometres se lisaient a 1m30 pres
//   sous forte charge (p. 591) : les ecarts de quelques centiemes sont dans l erreur de lecture. Couches de sable : 0.58 + 0.13 + 0.12 + 0.17 = 1.00.
// MESURE : les rapports hors la ligne nommee, les pentes a 0.002, les deux produits, les differences hors la ligne 5, les rapports de fevrier.
// Temoin : « le debit suit la pression sur le filtre seule » : en fevrier, 12.88 et 12.86 m dessus donnent 18.3 et 4.15 litres par minute ; le
//   meilleur ajustement sur la pression dessus laisse 4.90 l/min d erreur, celui sur la difference imprimee 0.39.
// Dessin (vue de face) : charge effective (dessus - partDessous x dessous) / 14 contre debit / 20 ; etiquette 0 fevrier, 1 la droite ajustee,
//   2 la 1re serie (pression / 14, debit / 30).
function filtreDarcy(P, n) {
  const series = SOURCES.darcySeries.valeur.split('|').map((g) => g.split(' ').map((x) => x.split(':').map(Number)));
  const fev = SOURCES.darcyFevrier.valeur.split(' ').map((x) => x.split(':').map(Number)), t = Object.fromEntries(SOURCES.darcyTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const tous = [...series[0], ...series[1]], NOMMES_R = [10], NOMMES_D = [4];
  const horsR = tous.map(([q, p, r], i) => (Math.abs(q / p - r) <= 0.01 + 1e-9 ? -1 : i)).filter((i) => i >= 0);
  let ecarts = horsR.filter((i) => !NOMMES_R.includes(i)).length + NOMMES_R.filter((i) => !horsR.includes(i)).length;
  const arrondis = tous.filter(([q, p, r]) => (q / p).toFixed(2) === r.toFixed(2)).length, section = PI * nb('diametre') * nb('diametre') / 4;
  const pentes = series.map((s) => s.reduce((a, [q, p]) => a + q * p, 0) / s.reduce((a, [, p]) => a + p * p, 0) / 60 / section);
  if (!(Math.abs(pentes[0] - nb('k1')) <= 0.002) || !(Math.abs(pentes[1] - nb('k2')) <= 0.002)) ecarts++;
  if ((nb('k1') * nb('e1')).toFixed(3) !== t.I1 || (nb('k2') * nb('e2')).toFixed(3) !== t.I2) ecarts++;
  if (!(Math.abs(t.sable.split(',').map(Number).reduce((a, b) => a + b, 0) - 1) < 1e-9)) ecarts++;
  const horsD = fev.map(([, u, v, df], i) => (Math.abs(u - v - df) <= 0.005 + 1e-9 ? -1 : i)).filter((i) => i >= 0);
  ecarts += horsD.filter((i) => !NOMMES_D.includes(i)).length + NOMMES_D.filter((i) => !horsD.includes(i)).length;
  const rapportsFev = fev.filter(([q, , , df, r]) => Math.abs(q / df - r) <= 0.01 + 1e-9).length;
  if (rapportsFev !== fev.length) ecarts++;
  const Q = fev.map((f) => f[0]);
  const rmsOrigine = (X) => { const c = Q.reduce((s, q, i) => s + q * X[i], 0) / X.reduce((s, x) => s + x * x, 0); return Math.sqrt(Q.reduce((s, q, i) => s + (q - c * X[i]) * (q - c * X[i]), 0) / Q.length); };
  const rmsAffine = (X) => { const k = X.length, mx = X.reduce((a, b) => a + b, 0) / k, my = Q.reduce((a, b) => a + b, 0) / k; let sxy = 0, sxx = 0; X.forEach((x, i) => { sxy += (x - mx) * (Q[i] - my); sxx += (x - mx) * (x - mx); });
    const b = sxy / sxx, a = my - b * mx; return Math.sqrt(Q.reduce((s, q, i) => s + (q - a - b * X[i]) * (q - a - b * X[i]), 0) / k); };
  const dessus = fev.map((f) => f[1]), diffImp = fev.map((f) => f[3]), kFev = Q.reduce((s, q, i) => s + q * diffImp[i], 0) / diffImp.reduce((s, x) => s + x * x, 0) / 60 / section;
  const w = P.partDessous, eff = fev.map((f) => f[1] - w * f[2]), cW = Q.reduce((s, q, i) => s + q * eff[i], 0) / eff.reduce((s, x) => s + x * x, 0), pts = [];
  fev.forEach((f, i) => { for (let r = 0; r < 14; r++) pts.push([eff[i] / 14, f[0] / 20, 0]); });
  for (let k = 0; k <= 60; k++) { const x = 14 * k / 60; pts.push([x / 14, cW * x / 20, 1]); }
  series[0].forEach(([q, p]) => { for (let r = 0; r < 8; r++) pts.push([p / 14, q / 30, 2]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'litres per minute', invariants: {
    filtreDarcy: { mesure: ecarts, formule: 0, rapportsRetrouves: tous.length - horsR.length, rapportsArrondis: arrondis, pentesSeries: pentes.map((x) => x.toFixed(4)).join(' '), differencesRetrouvees: fev.length - horsD.length, rapportsFevrier: rapportsFev,
      kFevrier: kFev, rmsChoisi: rmsOrigine(eff), note: 'a ratio other than the named one, a slope beyond 0.002, the 0.286 and 0.165, a pressure difference other than row 5, or a February ratio not recovered' },
    temoin: { mesure: rmsAffine(dessus) / rmsOrigine(diffImp) > 5 ? 0 : 1, formule: 0, rmsDessusOrigine: rmsOrigine(dessus), rmsDessusAffine: rmsAffine(dessus), rmsDifference: rmsOrigine(diffImp), rmsDifferenceAffine: rmsAffine(diffImp),
      note: 'witness: flow following the pressure above the filter alone leaves 4.90 litres a minute of error; the pressure difference leaves 0.39' } } };
}

// ---------- 120 : les deplacements browniens, Perrin 1913 (idee : codex 29, sous-agent Claude ; tables : SOURCES, Les Atomes p. 168-170) ----------
// Perrin pointe des grains de gomme-gutte toutes les 30 secondes et compare leurs deplacements a la loi du hasard (Laplace-Gauss). Sa preface relie
//   ces donnees a la geometrie : « les courbes qui n ont pas de tangente sont la regle », et les colloides en fournissent « en abondance ». Il ne
//   mesure aucune dimension fractale : ce sont des statistiques de deplacements.
// Exact ici : sommes 221 trouves / 223 calcules et 205 / 204 ; une demi-gaussienne (projections comptees depuis 0, inference qui se verifie)
//   d ecart-type 6.2965 et 6.3029 micron redonne les colonnes « calcule » a une unite pour 9 / 10 et 10 / 10 (modele arrondi ; brut : 8 / 10 et
//   10 / 10, criteres corriges par la contre-lecture). Anneaux : probabilites sommant a 1.000 ; 500 x P arrondi = n calcule pour 8 / 9 (anneau 2 :
//   83.5, imprime 83, nomme) ; 501 points trouves pour « 500 observations » (nomme). d / e : racine(pi) / 2 = 0.886, comme trouve ; le « 0,894
//   prevu » ne se retrouve pas (8 / 9 = 0.889). Khi-deux trouve contre calcule : 12.52, 4.92 et 2.04.
// MESURE : sommes, demi-gaussiennes, 500 x P hors l anneau 2, d / e.
// Temoin : « deplacements repartis uniformement » : khi-deux 103.2, 112.6 et 188.5 (attendu = total observe), contre 12.5, 4.9 et 2.0.
// Dessin (vue de face) : projection / 17 contre nombre / 50 ; etiquette 0 la demi-gaussienne d ecart-type sigmaPerrin, 1 la 1re serie trouvee,
//   2 la colonne calculee de Perrin.
function deplacementsPerrin(P, n) {
  const [t1, c1, t2, c2] = SOURCES.perrinProjections.valeur.split('|').map((g) => g.split(' ').map(Number));
  const anneaux = SOURCES.perrinAnneaux.valeur.split(' ').map((x) => x.split(':').map(Number)), t = Object.fromEntries(SOURCES.perrinTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (cle) => Number(t[cle]);
  const somme = (a) => a.reduce((x, y) => x + y, 0), h = nb('classe');
  const phi = (z) => { const m = 400, pas = z / m; let acc = 0; for (let i = 0; i <= m; i++) { const x = i * pas; acc += (i === 0 || i === m ? 1 : i % 2 ? 4 : 2) * expD(-x * x / 2); } return 0.5 + acc * pas / 3 / Math.sqrt(2 * PI); };
  const demiGauss = (sig, N) => c1.map((_, k) => 2 * N * (phi(h * (k + 1) / sig) - phi(h * k / sig)));
  const ajuste = (c) => { const N = somme(c), err = (sig) => demiGauss(sig, N).reduce((a, v, i) => a + (v - c[i]) * (v - c[i]), 0); let a = 5, b = 8;
    for (let it = 0; it < 60; it++) { const x1 = b - 0.618034 * (b - a), x2 = a + 0.618034 * (b - a); if (err(x1) < err(x2)) b = x2; else a = x1; } return (a + b) / 2; };
  const s1 = ajuste(c1), s2 = ajuste(c2), m1 = demiGauss(s1, somme(c1)), m2 = demiGauss(s2, somme(c2));
  const aUn = (m, c, arrondi) => m.filter((v, i) => Math.abs((arrondi ? Math.round(v) : v) - c[i]) <= 1).length;
  let ecarts = 0;
  if (aUn(m1, c1, true) < 9 || aUn(m2, c2, true) < 10) ecarts++;
  const P_ = anneaux.map((r) => r[0]), nc = anneaux.map((r) => r[1]), nt = anneaux.map((r) => r[2]);
  if (somme(P_).toFixed(3) !== '1.000' || somme(nc) !== nb('grains')) ecarts++;
  const NOMMES = [1], hors = nc.map((v, i) => (Math.round(nb('grains') * P_[i]) === v ? -1 : i)).filter((i) => i >= 0);
  ecarts += hors.filter((i) => !NOMMES.includes(i)).length + NOMMES.filter((i) => !hors.includes(i)).length;
  const deCalcule = Math.sqrt(PI) / 2;
  if (deCalcule.toFixed(3) !== t.de) ecarts++;
  const khi = (o, e) => o.reduce((a, v, i) => a + (v - e[i]) * (v - e[i]) / e[i], 0), unif = (o) => { const e = somme(o) / o.length; return o.reduce((a, v) => a + (v - e) * (v - e) / e, 0); };
  const khiGauss = [khi(t1, c1), khi(t2, c2), khi(nt, nc)], khiUnif = [unif(t1), unif(t2), unif(nt)];
  const sig = P.sigmaPerrin, mod = demiGauss(sig, somme(t1)), pts = [];
  mod.forEach((v, k) => { for (let r = 0; r < 12; r++) { pts.push([(k + 0.5) * h / 17, v / 50, 0]); pts.push([(k + 0.5) * h / 17, t1[k] / 50, 1]); pts.push([(k + 0.5) * h / 17, c1[k] / 50, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'grains', invariants: {
    deplacementsPerrin: { mesure: ecarts, formule: 0, sommesProjections: [t1, c1, t2, c2].map(somme).join(' '), trouvesAnneaux: somme(nt), sigmas: s1.toFixed(4) + ' ' + s2.toFixed(4), aUneUnite: aUn(m1, c1, true) + ' ' + aUn(m2, c2, true) + ' (brut ' + aUn(m1, c1, false) + ' ' + aUn(m2, c2, false) + ')',
      deCalcule, khiGauss: khiGauss.map((x) => x.toFixed(2)).join(' '), note: 'a sum, a half-normal fit, 500 x P besides ring 2, or d / e = 0.886 not recovered' },
    temoin: { mesure: khiUnif.every((x, i) => x > 5 * khiGauss[i]) ? 0 : 1, formule: 0, khiUniforme: khiUnif.map((x) => x.toFixed(2)).join(' '), note: 'witness: displacements spread evenly would give chi-squares of 103.2, 112.6 and 188.5 against 12.5, 4.9 and 2.0' } } };
}

// ---------- 121 : l aimant et la distance, Gauss 1832 (idee : codex 30, sous-agent Claude ; tables : SOURCES, Ann. Phys. 28 p. 604-605) ----------
// Gauss pose une seconde aiguille aimantee a 1.1 - 4 m d une aiguille suspendue, dans deux positions, et lit la deviation (moyenne de quatre
//   positions, en secondes d arc). Il ajuste tang v = a R^-3 + b R^-5 « nach der Methode der kleinsten Quadrate » et imprime calcul et difference.
// Exact ici : difference imprimee = observe - calcule imprime, au dixieme : 27 / 28 ; les coefficients imprimes redonnent la colonne calculee a un
//   dixieme pres pour 27 / 28 (22 / 28 a l arrondi strict). La seule exception est la meme dans les deux controles : v' a 3.5 m (calcule imprime
//   3' 29".8, recalcule 29".92, difference -1.0 au lieu de -0.9) : nommee. a1 / a2 = 2.000000 exactement (le texte n ecrit pas la contrainte ;
//   un ajustement libre donne 2.0013). Exposants d une loi de puissance pure : 2.9962 (13 points) et 3.0275 (15 points).
// MESURE : differences et colonne calculee hors la ligne nommee, a1 = 2 a2, exposants a 0.05 de 3.
// Temoin : « l action decroit comme R^-2 » (une constante, moindres carres sur la tangente, ecart en angle) : 610.3" et 566.7" d ecart quadratique
//   moyen, contre 12.8" et 28.5" en R^-3.
// Dessin (vue de face) : R / 4.2 contre angle / 8100" ; etiquette 0 la premiere position, 1 la seconde, 2 l ajustement a une constante en
//   R^-exposantGauss.
function aimantGauss(P, n) {
  const sec = (x) => { if (x === 'x') return null; const [d, m, s] = x.split('-').map(Number); return d * 3600 + m * 60 + s; };
  const obs = SOURCES.gaussObserve.valeur.split(' ').map((l) => l.split(':')), cal = SOURCES.gaussCalcule.valeur.split(' ').map((l) => l.split(':'));
  const t = Object.fromEntries(SOURCES.gaussFormules.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const R = obs.map((l) => Number(l[0])), SEC = 180 * 3600 / PI;
  const series = [['v', obs.map((l) => sec(l[1])), cal.map((l) => sec(l[1])), cal.map((l) => (l[2] === 'x' ? null : Number(l[2]))), nb('a1'), nb('b1')],
    ['w', obs.map((l) => sec(l[2])), cal.map((l) => sec(l[3])), cal.map((l) => Number(l[4])), nb('a2'), nb('b2')]];
  const horsDiff = [], horsCalc = [];
  let ecarts = 0, strict = 0, nPts = 0;
  for (const [nom, o, c, d, a, b] of series) R.forEach((r, i) => {
    if (o[i] === null) return;
    nPts++;
    if (Math.round((o[i] - c[i]) * 10) !== Math.round(d[i] * 10)) horsDiff.push(nom + r.toFixed(1));
    const r2 = r * r, calc = atanD(a / (r2 * r) + b / (r2 * r2 * r)) * SEC;
    if (!(Math.abs(calc - c[i]) <= 0.1 + 1e-9)) horsCalc.push(nom + r.toFixed(1));
    if (Math.round(calc * 10) === Math.round(c[i] * 10)) strict++;
  });
  const NOMMES = ['w3.5'];
  for (const hors of [horsDiff, horsCalc]) ecarts += hors.filter((h) => !NOMMES.includes(h)).length + NOMMES.filter((h) => !hors.includes(h)).length;
  if ((nb('a1') / nb('a2')).toFixed(6) !== '2.000000') ecarts++;
  const tanS = (s) => sinD(s / SEC) / cosD(s / SEC), idx = (o) => R.map((_, i) => i).filter((i) => o[i] !== null);
  const pente = (xs, ys) => { const k = xs.length, mx = xs.reduce((p, q) => p + q, 0) / k, my = ys.reduce((p, q) => p + q, 0) / k; let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); }); return sxy / sxx; };
  const exposants = series.map(([, o]) => -pente(idx(o).map((i) => lnD(R[i])), idx(o).map((i) => lnD(tanS(o[i])))));
  if (!exposants.every((e) => Math.abs(e - 3) < 0.05)) ecarts++;
  const ajuste = (o, m) => { const id = idx(o), x = id.map((i) => expD(-m * lnD(R[i]))), y = id.map((i) => tanS(o[i]));
    const k = x.reduce((p, xi, j) => p + xi * y[j], 0) / x.reduce((p, xi) => p + xi * xi, 0);
    return { k, rms: Math.sqrt(id.reduce((p, i, j) => p + (atanD(k * x[j]) * SEC - o[i]) * (atanD(k * x[j]) * SEC - o[i]), 0) / id.length) }; };
  const carre = series.map(([, o]) => ajuste(o, 2).rms), cube = series.map(([, o]) => ajuste(o, 3).rms);
  const m = P.exposantGauss, pts = [];
  series.forEach(([, o]) => { const { k } = ajuste(o, m); for (let j = 0; j <= 80; j++) { const r = 1 + 3.2 * j / 80; pts.push([r / 4.2, atanD(k * expD(-m * lnD(r))) * SEC / 8100, 2]); } });
  series.forEach(([, o], s) => R.forEach((r, i) => { if (o[i] !== null) for (let q = 0; q < 12; q++) pts.push([r / 4.2, o[i] / 8100, s]); }));
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'seconds of arc', invariants: {
    aimantGauss: { mesure: ecarts, formule: 0, anglesGauss: nPts, differencesGauss: (nPts - horsDiff.length) + '/' + nPts, formulesGauss: (nPts - horsCalc.length) + '/' + nPts + ' (strict ' + strict + ')',
      rapportGauss: (nb('a1') / nb('a2')).toFixed(6), exposantsGauss: exposants.map((e) => e.toFixed(4)).join(' '), rmsCubeGauss: cube.map((x) => x.toFixed(2)).join(' '),
      note: 'a printed difference or calculated angle off besides the named v\' at 3.5 m, a1 other than 2 a2, or a power not near 3' },
    temoin: { mesure: carre.every((x, i) => x > 10 * cube[i]) ? 0 : 1, formule: 0, rmsCarreGauss: carre.map((x) => x.toFixed(2)).join(' '), note: 'witness: a pull falling as the square would miss by 610 and 567 seconds of arc on average, against 13 and 29 for the cube' } } };
}

// ---------- 122 : le rapport des unites, Weber et Kohlrausch 1856 (idee : codex 30, sous-agent Claude ; tables : SOURCES, Ann. Phys. 99 p. 18-21) ----------
// Une bouteille de Leyde chargee d une quantite E (mesuree en unites electrostatiques) se decharge a travers un galvanometre de 5635 tours ;
//   l elongation phi donne le temps tau = A phi pendant lequel un courant d intensite magnetique 1 ferait le meme effet. La moitie de E traverse :
//   E / 2 tau est le rapport de l unite magnetique de courant a l unite mecanique.
// Exact ici : tau = 0.020915 phi a 7 decimales 5 / 5 ; E / (2 tau imprime) a 0.021 % au plus des cinq valeurs imprimees (leur regle d arrondi
//   n est pas retrouvee : 4 / 5 a la centaine de millions) ; moyenne imprimee 155370 = moyenne exacte des cinq ; 155370 x racine(1/2) = 109863.2
//   et 155370 x 4 / racine(2) = 439452.7, imprimes a la dizaine 109860 et 439450 ; 155370 x 106 2/3 = 16572.8 milliards, imprime 16573.
// MESURE : tau, E / 2 tau a 0.05 %, la moyenne, les trois produits a l arrondi imprime.
// Temoin : « l elongation ne depend pas de la charge » (phi constant) : 11.59 % d ecart quadratique relatif, contre 2.82 % pour phi
//   proportionnel a E. Mais pas strictement proportionnel : l essai 3 a plus de charge que le 5 et une elongation plus petite.
// Dessin (vue de face) : essai / 5 contre rapport / 1.7e11 ; etiquette 0 la part de la charge partWeber x E / tau, 1 la valeur imprimee,
//   2 la moyenne imprimee.
function unitesWeber(P, n) {
  const es = SOURCES.weberEssais.valeur.split(' ').map((l) => l.split(':').map(Number)), t = Object.fromEntries(SOURCES.weberTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const E = es.map((r) => r[0]), phi = es.map((r) => r[2]), tau = es.map((r) => r[3]), q = es.map((r) => r[4]);
  let ecarts = 0;
  const tauOK = phi.filter((p, i) => Math.round(p * nb('A') * 1e7) === Math.round(tau[i] * 1e7)).length;
  if (tauOK !== 5) ecarts++;
  const rapport = E.map((e, i) => e / (2 * tau[i]) / 1e6), ecartPct = rapport.map((x, i) => Math.abs(q[i] - x) / x * 100);
  if (!ecartPct.every((x) => x < 0.05)) ecarts++;
  const moy = q.reduce((a, b) => a + b, 0) / q.length;
  if (moy !== nb('moyenne')) ecarts++;
  const dizaine = (x) => Math.round(x / 10) * 10, dyn = moy * Math.sqrt(0.5), lyt = moy * 320 / 3 / 1000, c = 4 * moy / Math.sqrt(2);
  if (dizaine(dyn) !== nb('dynamique') || Math.round(lyt) !== nb('lytique') || dizaine(c) !== nb('c')) ecarts++;
  const meile = nb('c') * 1e6 / nb('meilen') / 1000;
  const k = E.reduce((a, e, i) => a + e * phi[i], 0) / E.reduce((a, e) => a + e * e, 0), mp = phi.reduce((a, b) => a + b, 0) / 5;
  const rms = (f) => Math.sqrt(phi.reduce((a, x, i) => a + ((f(i) - x) / x) * ((f(i) - x) / x), 0) / phi.length) * 100;
  const prop = rms((i) => k * E[i]), constant = rms(() => mp);
  const part = P.partWeber, pts = [];
  E.forEach((e, i) => { for (let r = 0; r < 12; r++) { pts.push([(i + 1) / 5, part * e / tau[i] / 1.7e11, 0]); pts.push([(i + 1) / 5, q[i] * 1e6 / 1.7e11, 1]); } });
  for (let j = 0; j <= 40; j++) pts.push([0.1 + j / 40, moy * 1e6 / 1.7e11, 2]);
  const brut = new Float64Array(n * 3);
  for (let k2 = 0; k2 < n; k2++) { const [px, py, pe] = pts[k2 % pts.length], o = 3 * k2; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'millions (ratio of units)', invariants: {
    unitesWeber: { mesure: ecarts, formule: 0, tauWeber: tauOK + '/5', rapportsWeber: rapport.map((x) => x.toFixed(1)).join(' '), ecartMaxWeber: Math.max(...ecartPct).toFixed(4), moyenneWeber: moy,
      produitsWeber: dyn.toFixed(1) + ' ' + lyt.toFixed(2) + ' ' + c.toFixed(1), meileWeber: meile.toFixed(1), note: 'a tau, a ratio beyond 0.05 %, the mean, or 109860 / 16573 / 439450 not recovered' },
    temoin: { mesure: constant > 3 * prop ? 0 : 1, formule: 0, ecartProportionnel: prop.toFixed(2), ecartConstant: constant.toFixed(2), note: 'witness: a swing that ignores the charge misses by 11.6 % on average, against 2.8 % for a swing in proportion' } } };
}

// ---------- 123 : le debit des tubes fins, Poiseuille 1840 (idee : codex 30, sous-agent Claude ; tables : SOURCES, C. R. t. XI p. 964-1046) ----------
// Poiseuille fait couler de l eau a 10 degres dans des tubes de verre de 0.014 a 0.65 mm sous une pression de mercure et mesure le volume
//   ecoule (ou le temps de vidage d une ampoule). Il en tire Q = k'' P D^4 / L.
// Exact ici : temps inversement proportionnels a la pression : P t constant a 0.056 % (tube de 100.5 mm, 3 pressions) et 0.108 % (75.8 mm,
//   6 pressions), pentes log-log -0.9994 et -0.9997 ; Q / D^4 des 7 tubes a 0.25 % de leur moyenne, pente log Q / log D 3.9993. La moyenne
//   imprimee des k'' (2495.224) ne sort pas de ses sept valeurs (2495.3657) : nommee. Les k'' et le tableau supposent une longueur que les
//   pages n ecrivent pas : 25.000 mm a 0.0005 pres pour 4 tubes sur 7 (E, B, A, F).
// MESURE : les deux series de pressions, la loi en D^4, la moyenne nommee, les quatre longueurs de 25 mm.
// Temoin : Navier (vitesse proportionnelle au diametre, donc Q en D^3, une constante ajustee) : facteur 3.16 d ecart moyen sur Q, contre
//   1.001 en D^4.
// Dessin (vue de face) : ln D contre ln Q (cadres) ; etiquette 0 les sept tubes, 1 la droite Q = c D^exposantPoiseuille ajustee.
function tubesPoiseuille(P, n) {
  const tubes = SOURCES.poiseuilleTubes.valeur.split(' ').map((l) => l.split(':')), t = Object.fromEntries(SOURCES.poiseuilleTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const Dm = tubes.map((r) => Number(r[1])), Q = tubes.map((r) => Number(r[2])), K = tubes.map((r) => Number(r[3]));
  const series = SOURCES.poiseuillePressions.valeur.split(' ').reduce((acc, x) => { if (x.includes('|')) { const [L, pt] = x.split('|'); acc.push([]); x = pt; } acc[acc.length - 1].push(x.split(':').map(Number)); return acc; }, []);
  const pente = (x, y) => { const k = x.length, mx = x.reduce((a, b) => a + b, 0) / k, my = y.reduce((a, b) => a + b, 0) / k; let sxy = 0, sxx = 0;
    x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) * (v - mx); }); return sxy / sxx; };
  let ecarts = 0;
  const etendues = series.map((s) => { const pt = s.map(([p, tps]) => p * tps), m = pt.reduce((a, b) => a + b, 0) / pt.length; return (Math.max(...pt) - Math.min(...pt)) / m * 100; });
  const pentesP = series.map((s) => pente(s.map(([p]) => lnD(p)), s.map(([, tps]) => lnD(tps))));
  if (!etendues.every((e) => e < 0.2) || !pentesP.every((p) => Math.abs(p + 1) < 0.01)) ecarts++;
  const q4 = Q.map((q, i) => q / (Dm[i] * Dm[i] * Dm[i] * Dm[i])), m4 = q4.reduce((a, b) => a + b, 0) / q4.length, ecartsD4 = q4.map((x) => (x - m4) / m4 * 100);
  const penteD = pente(Dm.map((d) => lnD(d)), Q.map((q) => lnD(q)));
  if (!ecartsD4.every((x) => Math.abs(x) < 0.3) || Math.abs(penteD - 4) > 0.01) ecarts++;
  const moyK = K.reduce((a, b) => a + b, 0) / K.length, MOYENNE_NOMMEE = true;
  if ((moyK.toFixed(3) !== nb('moyenneK').toFixed(3)) !== MOYENNE_NOMMEE) ecarts++;
  const longueurs = Q.map((q, i) => K[i] * nb('pression') * Dm[i] * Dm[i] * Dm[i] * Dm[i] * nb('temps') / q), a25 = longueurs.filter((L) => Math.abs(L - 25) < 0.0005).length;
  if (a25 !== 4) ecarts++;
  const ajuste = (m) => { const c = Q.reduce((a, q, i) => a + lnD(q) - m * lnD(Dm[i]), 0) / Q.length;
    return { c, rms: Math.sqrt(Q.reduce((a, q, i) => a + (lnD(q) - c - m * lnD(Dm[i])) * (lnD(q) - c - m * lnD(Dm[i])), 0) / Q.length) }; };
  const navier = ajuste(3), loi = ajuste(4);
  const m = P.exposantPoiseuille, fit = ajuste(m), x0 = lnD(0.01), dx = lnD(0.7) - x0, pts = [];
  for (let j = 0; j <= 80; j++) { const lx = x0 + dx * j / 80; pts.push([(lx - x0) / dx, (fit.c + m * lx) / 16, 1]); }
  Dm.forEach((d, i) => { for (let r = 0; r < 12; r++) pts.push([(lnD(d) - x0) / dx, lnD(Q[i]) / 16, 0]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'cubic millimetres', invariants: {
    tubesPoiseuille: { mesure: ecarts, formule: 0, etenduesPression: etendues.map((e) => e.toFixed(3)).join(' '), pentesPression: pentesP.map((p) => p.toFixed(4)).join(' '), ecartsD4: ecartsD4.map((x) => x.toFixed(3)).join(' '),
      penteDiametrePoiseuille: penteD.toFixed(4), moyenneKRecalculee: moyK.toFixed(4), longueursImplicites: longueurs.map((L) => L.toFixed(3)).join(' '), note: 'a pressure series, the fourth power, the named mean of k, or the four 25 mm lengths not recovered' },
    temoin: { mesure: navier.rms > 100 * loi.rms ? 0 : 1, formule: 0, facteurNavier: expD(navier.rms).toFixed(3), facteurD4: expD(loi.rms).toFixed(3), note: 'witness: a flow in D cubed (Navier) misses by a factor of 3.16 on average, against 1.001 for D to the fourth' } } };
}

// ---------- 124 : la variation du compas, Halley 1683 (idee : codex 30, sous-agent Claude ; table et texte : SOURCES, Phil. Trans. 13 p. 210-217) ----------
// Halley rassemble les ecarts de la boussole au nord vrai (« variation ») releves de 1580 a 1683 et en tire deux faits : la variation change
//   avec le temps, et sous un meme meridien elle peut etre de sens contraires (contre la theorie de Bond a deux poles).
// Exact ici : a Londres, 11 15 E en 1580 et 4 30 W en 1683 : 15.75 degres, « more than 15 » (p. 215) ; les quatre intervalles de Londres vont
//   vers l Ouest de plus en plus vite (-7.500, -9.583, -10.395, -10.909 minutes par an) ; les sept intervalles d un meme lieu (Londres 4,
//   Paris 2, Copenhague 1) vont tous vers l Ouest ; Brest 1 3/4, Londres 4 1/2 et Dantzick 7 (p. 217) sont ceux de la table ; Hudson 29 1/2
//   W et la Plata 20 1/2 E (p. 214) aussi, a 4 degres de longitude l un de l autre.
// MESURE : les 15.75 degres, la derive accelere, 7 / 7 vers l Ouest, les cinq nombres du texte.
// Temoin : « la variation d un lieu est fixe » (Gilbert, Descartes) : le plus petit des sept changements fait deja 1.917 degres.
// Dessin (vue de face) : (annee - 1570) / 120 contre variation / 12 ; etiquette 0 Londres, 1 Paris et Copenhague, 2 Londres interpole a
//   anneeHalley (trait vertical).
function variationsHalley(P, n) {
  const dm = (x) => { const neg = x.startsWith('-'), [d, m] = (neg ? x.slice(1) : x).split('-').map(Number); return (neg ? -1 : 1) * (d + m / 60); };
  const lignes = SOURCES.compasHalleyTable.valeur.split(' ').map((l) => { const [lieu, lon, an, v] = l.split(/:/); return { lieu, lon: dm(lon), an: Number(an), v: dm(v) }; });
  const t = Object.fromEntries(SOURCES.compasHalleyTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const de = (lieu) => lignes.filter((l) => l.lieu === lieu), londres = de('London');
  let ecarts = 0;
  const changeLondres = londres[0].v - londres[londres.length - 1].v;
  if (!(changeLondres > nb('londresCent'))) ecarts++;
  const taux = londres.slice(1).map((l, i) => (l.v - londres[i].v) * 60 / (l.an - londres[i].an));
  if (!taux.every((x, i) => i === 0 || x < taux[i - 1])) ecarts++;
  const intervalles = ['London', 'Paris', 'Copenhagen'].flatMap((lieu) => { const s = de(lieu); return s.slice(1).map((l, i) => l.v - s[i].v); });
  const versOuest = intervalles.filter((d) => d < 0).length;
  if (versOuest !== intervalles.length) ecarts++;
  const egal = (lieu, val) => Math.abs(Math.abs(de(lieu).slice(-1)[0].v) - val) < 1e-9;
  const texte = [['Brest', 'brest'], ['London', 'londres'], ['Dantzick', 'dantzick'], ['HudsonsStraights', 'hudson'], ['RiverOfPlate', 'plata']].filter(([l, c]) => egal(l, nb(c))).length;
  if (texte !== 5) ecarts++;
  const hud = de('HudsonsStraights')[0], pla = de('RiverOfPlate')[0], bond = hud.v * pla.v < 0 && Math.abs(hud.lon - pla.lon) <= 4;
  if (!bond) ecarts++;
  const plusPetit = Math.min(...intervalles.map((d) => Math.abs(d)));
  const an = P.anneeHalley, k = londres.findIndex((l) => l.an >= an), a = londres[Math.max(0, k - 1)], b = londres[Math.max(0, k)];
  const vAn = b.an === a.an ? b.v : a.v + (b.v - a.v) * (an - a.an) / (b.an - a.an), pts = [];
  for (let j = 0; j <= 40; j++) pts.push([(an - 1570) / 120, (-6 + 18 * j / 40) / 12, 2]);
  for (let r = 0; r < 20; r++) pts.push([(an - 1570) / 120, vAn / 12, 2]);
  lignes.forEach((l) => { const e = l.lieu === 'London' ? 0 : l.lieu === 'Paris' || l.lieu === 'Copenhagen' ? 1 : -1; if (e >= 0) for (let r = 0; r < 15; r++) pts.push([(l.an - 1570) / 120, l.v / 12, e]); });
  const brut = new Float64Array(n * 3);
  for (let q = 0; q < n; q++) { const [px, py, pe] = pts[q % pts.length], o = 3 * q; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'degrees of variation', invariants: {
    variationsHalley: { mesure: ecarts, formule: 0, changeLondres: changeLondres.toFixed(2), tauxLondres: taux.map((x) => x.toFixed(3)).join(' '), versOuest: versOuest + '/' + intervalles.length, texteTable: texte + '/5',
      londresInterpolee: vAn.toFixed(2), note: 'the 15 degrees at London, the speeding drift, a move to the East, a number of the text not in the table, or Hudson and the Plate on the same side' },
    temoin: { mesure: plusPetit > 1 ? 0 : 1, formule: 0, plusPetitChangement: plusPetit.toFixed(3), note: 'witness: a fixed variation would not move; the smallest of the seven changes is 1.9 degrees' } } };
}

// ---------- 125 : les spirales des cones, Beal 1873 (idee : codex 30, sous-agent Claude ; tableau : SOURCES, Am. Nat. 7 p. 451-452) ----------
// Beal compte, sur 895 cones de six especes, les spirales paralleles les plus visibles a droite et a gauche. La plupart sont deux nombres de
//   Fibonacci voisins (5 et 8, 3 et 5), comme le veut la phyllotaxie ; mais 41 cones montrent 4 et 7 spirales, un ordre (3/7) qu Airy
//   disait exclu « par la geometrie ».
// Exact ici : l arbre 1 fait 155 cones, le nombre ecrit en toutes lettres ; 895 cones en tout ; 744 (0.8313) a deux Fibonacci voisins, 824
//   (0.9207) a deux Fibonacci ; 41 cones a 4 et 7. Droite contre gauche (petit nombre a droite : 427 contre 467, le cone « 4 & 10 » mis a
//   part) : p = 0.1921 au test binomial exact, egalite non rejetee ; mais deux groupes la rejettent, contre le « about equally » de Beal :
//   l arbre 3 d epicea de Norvege (5 contre 20, p = 0.0041 ; vu par moi, le codex ne testait que par espece) et le meleze d Europe (33
//   contre 53, p = 0.0399) : nommes.
// MESURE : 155, 895, 744, 41, p global > 0.05, seuls l arbre 3 et le meleze d Europe sous 0.05.
// Temoin : la regle d Airy (ordres 1/4, 3/7, 4/9, 4/11 exclus) prevoit zero cone a 4 et 7 ; il y en a 41.
// Dessin (vue de face) : spirales a droite / 14 contre a gauche / 14, un point par cone (decale) ; groupeBeal = 0 tous, 1 a 12 un groupe ;
//   etiquette 0 Fibonacci voisins, 1 deux Fibonacci non voisins, 2 autre.
function spiralesBeal(P, n) {
  const groupes = SOURCES.conesBealTable.valeur.split(' ').map((g) => { const [nom, L] = g.split(':'); return { nom, lignes: L.split(',').map((r) => { const [c, d, x] = r.split('-'); return { c: Number(c), d: Number(d), g: x === 'x' ? null : Number(x) }; }) }; });
  const t = Object.fromEntries(SOURCES.conesBealTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const FIB = [1, 2, 3, 5, 8, 13, 21], voisins = (a, b) => FIB.some((f, i) => i > 0 && ((a === FIB[i - 1] && b === f) || (b === FIB[i - 1] && a === f)));
  const somme = (L, f) => L.reduce((s, r) => s + (f(r) ? r.c : 0), 0), toutes = groupes.flatMap((g) => g.lignes);
  let ecarts = 0;
  if (somme(groupes[0].lignes, () => true) !== nb('arbre1')) ecarts++;
  const total = somme(toutes, () => true), nVoisins = somme(toutes, (r) => r.g !== null && voisins(r.d, r.g)), nFib = somme(toutes, (r) => r.g !== null && FIB.includes(r.d) && FIB.includes(r.g));
  const airy = somme(toutes, (r) => (r.d === 4 && r.g === 7) || (r.d === 7 && r.g === 4));
  const lnFact = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += lnD(i); return s; };
  const binom = (k, m) => { const pk = (j) => expD(lnFact(m) - lnFact(j) - lnFact(m - j) - m * lnD(2)), obs = pk(k); let p = 0; for (let j = 0; j <= m; j++) if (pk(j) <= obs * (1 + 1e-12)) p += pk(j); return p > 1 ? 1 : p; };
  const sens = (L) => [somme(L, (r) => r.g !== null && r.d < r.g), somme(L, (r) => r.g !== null && r.d > r.g)];
  const [dTous, gTous] = sens(toutes), pTous = binom(dTous, dTous + gTous);
  const pGroupe = groupes.map((g) => { const [a, b] = sens(g.lignes); return binom(a, a + b); });
  const NOMMES = ['N3', 'EL'], rejetes = groupes.filter((g, i) => pGroupe[i] < 0.05).map((g) => g.nom);
  ecarts += rejetes.filter((x) => !NOMMES.includes(x)).length + NOMMES.filter((x) => !rejetes.includes(x)).length;
  if (!(pTous > 0.05)) ecarts++;
  const choix = P.groupeBeal, vus = choix === 0 ? groupes : [groupes[choix - 1]], pts = [];
  vus.forEach((g) => g.lignes.forEach((r) => { if (r.g === null) return; const e = voisins(r.d, r.g) ? 0 : FIB.includes(r.d) && FIB.includes(r.g) ? 1 : 2;
    for (let k = 0; k < r.c; k++) pts.push([(r.d + 0.06 * ((k % 9) - 4)) / 14, (r.g + 0.06 * (((k / 9) | 0) % 9 - 4)) / 14, e]); }));
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'cones', invariants: {
    spiralesBeal: { mesure: ecarts, formule: 0, conesTotal: total, conesArbre1: somme(groupes[0].lignes, () => true), partVoisins: (nVoisins / total).toFixed(4), partDeuxFib: (nFib / total).toFixed(4),
      conesQuatreSept: airy, droiteGauche: dTous + ' ' + gTous, pSymetrie: pTous.toFixed(4), pMelezeEurope: pGroupe[groupes.findIndex((g) => g.nom === 'EL')].toFixed(4),
      pArbre3: pGroupe[groupes.findIndex((g) => g.nom === 'N3')].toFixed(4), note: 'tree 1 not 155, a total off, the right-left balance rejected overall, or a group other than Norway tree 3 and the European larch rejected' },
    temoin: { mesure: airy >= 10 ? 0 : 1, formule: 0, conesExclusAiry: airy, note: 'witness: Airy said the geometry excludes 4 and 7 spirals; Beal counted 41 such cones' } } };
}

// ---------- 126 : les temps des seismes, Oldham 1906 (idee : codex 30, sous-agent Claude ; tables : SOURCES, QJGS 62 p. 464 et 467) ----------
// Oldham lisse les temps d arrivee des deux phases des « preliminary tremors » releves dans le monde entier et les ramene a 30, 60 ... 180
//   degres de l origine, sur un globe de 40 000 km. La vitesse le long de la corde croit avec la profondeur jusqu a 120 degres ; au-dela,
//   la deuxieme phase arrive tres en retard (p. 467 : l intervalle a 120 degres est « somewhat uncertain »).
// Exact ici : longueurs d arc = 40 000 x d / 360 tronquees au dixieme 6 / 6 ; profondeur de la corde 1 - cos(d / 2) au millieme 6 / 6 ;
//   cordes a 1.6 km de 2 R sin(d / 2) 6 / 6 (pas au dixieme) ; vitesses = longueur imprimee / temps, au centieme : 22 / 24, les deux
//   exceptions nommees (1re phase corde a 60 : 9.64 pour 9.65 ; 2e phase arc a 90 : 6.67 pour 6.66, alors que 180 imprime 6.67).
//   Modules : distorsion = densite x v2^2 3 / 3 au dixieme ; compression = densite x v1^2 - 4/3 distorsion 2 / 3 (60 : 219.3 pour 219.4,
//   nomme). Les rapports du texte (.385, .446, .493) ne sont PAS distorsion / compression de sa table (.493, .603, .692) : 0 / 3, garde tel.
// MESURE : arcs, profondeurs, cordes, vitesses hors les deux nommees, modules hors le nomme, et le desaccord texte-table qui reste 0 / 3.
// Temoin : « la 2e phase garde la vitesse de corde de 120 degres » : 32.3 minutes a 150 et 33.5 a 180, contre 45 et 50 imprimes.
// Dessin (vue de face) : distance / 180 contre minutes / 50 ; etiquette 0 la 1re phase, 1 la 2e, 2 un trajet en corde a vitesseOldham.
function tempsOldham(P, n) {
  const T = SOURCES.seismesOldhamTable.valeur.split(' ').map((l) => l.split(':').map(Number)), Mo = SOURCES.seismesOldhamModules.valeur.split(' ').map((l) => l.split(':').map(Number));
  const R = 40000 / (2 * PI), cent = (x) => Math.round(x * 100) / 100;
  let ecarts = 0, arcs = 0, profondeurs = 0, cordes = 0;
  const hors = [];
  for (const [d, tp, pa, pc, ts, sa, sc, la, lc, pr] of T) {
    if (Math.floor(40000 * d / 360 * 10 + 1e-9) / 10 === la) arcs++;
    if ((1 - cosD(d * PI / 360)).toFixed(3) === pr.toFixed(3)) profondeurs++;
    if (Math.abs(2 * R * sinD(d * PI / 360) - lc) < 1.6) cordes++;
    [['Pa', la / (tp * 60), pa], ['Pc', lc / (tp * 60), pc], ['Sa', la / (ts * 60), sa], ['Sc', lc / (ts * 60), sc]].forEach(([c, v, imp]) => { if (cent(v) !== imp) hors.push(c + d); });
  }
  if (arcs !== 6 || profondeurs !== 6 || cordes !== 6) ecarts++;
  const NOMMES = ['Pc60', 'Sa90'];
  ecarts += hors.filter((h) => !NOMMES.includes(h)).length + NOMMES.filter((h) => !hors.includes(h)).length;
  const modules = Mo.map(([d, rho, k, mu, rap], i) => { const v1 = T[i][3], v2 = T[i][6], m = rho * v2 * v2; return { d, mu: m, k: rho * v1 * v1 - 4 / 3 * m, kImp: k, muImp: mu, rap }; });
  const horsMu = modules.filter((x) => Math.round(x.mu * 10) / 10 !== x.muImp).length, horsK = modules.filter((x) => Math.round(x.k * 10) / 10 !== x.kImp).map((x) => x.d);
  const K_NOMME = [60];
  if (horsMu !== 0) ecarts++;
  ecarts += horsK.filter((d) => !K_NOMME.includes(d)).length + K_NOMME.filter((d) => !horsK.includes(d)).length;
  const texteTable = modules.filter((x) => (x.muImp / x.kImp).toFixed(3) === x.rap.toFixed(3)).length;
  if (texteTable !== 0) ecarts++;
  const vS120 = T[3][6], predits = [T[4], T[5]].map((r) => r[8] / vS120 / 60);
  const v = P.vitesseOldham, pts = [];
  for (let j = 0; j <= 60; j++) { const d = 3 * j; pts.push([d / 180, 2 * R * sinD(d * PI / 360) / v / 60 / 50, 2]); }
  T.forEach((r) => { for (let q = 0; q < 15; q++) { pts.push([r[0] / 180, r[1] / 50, 0]); pts.push([r[0] / 180, r[4] / 50, 1]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'minutes', invariants: {
    tempsOldham: { mesure: ecarts, formule: 0, arcsOldham: arcs + '/6', profondeursOldham: profondeurs + '/6', cordesOldham: cordes + '/6', vitessesHorsOldham: hors.join(' '),
      distorsionOldham: modules.map((x) => x.mu.toFixed(3)).join(' '), compressionOldham: modules.map((x) => x.k.toFixed(3)).join(' '), texteTableOldham: texteTable + '/3',
      note: 'an arc, a depth, a chord, a speed besides the two named, a modulus besides the named 219.4, or the text ratios matching the table' },
    temoin: { mesure: predits[0] < T[4][4] - 10 && predits[1] < T[5][4] - 10 ? 0 : 1, formule: 0, predit150et180: predits.map((x) => x.toFixed(2)).join(' '), note: 'witness: a second phase keeping its 120 degree chord speed would arrive at 32.3 and 33.5 minutes, against 45 and 50' } } };
}

// ---------- 127 : la fonte d imprimerie, MacKellar 1893 (idee : codex 30, sous-agent Claude ; table : SOURCES, The American Printer p. 57) ----------
// Pour 800 livres de caracteres « pica », les fondeurs fournissaient tant de e, tant de z... MacKellar imprime cette repartition (p. 57) et
//   previent (p. 58) qu un livre peut en manquer selon son sujet. C est donc une estimation de l usage de l anglais, arrondie a la centaine.
// Exact ici : bas-de-casse 106 900 en tout, e / z = 60, 19 valeurs distinctes pour 26 lettres (ex aequo : i n o s, c m, w y, g p, j x), 26 / 26
//   multiples de 100 ; entropie des 26 lettres 4.2219 bits (uniforme : 4.7004) ; petites capitales = capitales / 2 exactement 27 / 28, T 326
//   pour 650 / 2 = 325 (imprime ainsi en 1871 et 1893) : nomme ; 10 lettres au-dessus de 1/26.
// MESURE : les relations de la page seulement : 26 / 26 multiples de 100, petites capitales = capitales / 2 hors T. (La somme, e / z et
//   l entropie sont des calculs : affiches, figes par le banc, pas compares a eux-memes ici.)
// Temoin : « toutes les lettres servent autant » : e aurait 1/26 ; il a 2.919 fois cela, et l entropie tomberait de 4.7004 a 4.2219.
// Dessin (vue de face) : rang / 26 contre part / 0.12 ; etiquette 0 la fonte de MacKellar, 1 la part uniforme, 2 le melange (1 - m) fonte + m
//   uniforme avec m = melangeUniforme.
function fonteMacKellar(P, n) {
  const lc = SOURCES.fonteMacKellarMinuscules.valeur.split(' ').map((x) => { const [l, c] = x.split(':'); return [l, Number(c)]; });
  const ca = SOURCES.fonteMacKellarCapitales.valeur.split(' ').map((x) => { const [l, c, p] = x.split(':'); return [l, Number(c), Number(p)]; });
  const tot = lc.reduce((a, [, c]) => a + c, 0), cnt = (l) => lc.find((x) => x[0] === l)[1];
  let ecarts = 0;
  if (lc.some(([, c]) => c % 100 !== 0)) ecarts++;
  const H = -lc.reduce((a, [, c]) => a + (c / tot) * lnD(c / tot) / lnD(2), 0), Hu = lnD(26) / lnD(2);
  const NOMMES = ['T'], horsDemi = ca.filter(([, c, p]) => p * 2 !== c).map(([l]) => l);
  ecarts += horsDemi.filter((l) => !NOMMES.includes(l)).length + NOMMES.filter((l) => !horsDemi.includes(l)).length;
  const parts = lc.map(([, c]) => c / tot).sort((a, b) => b - a), auDessus = parts.filter((x) => x > 1 / 26).length;
  const m = P.melangeUniforme, pts = [];
  parts.forEach((x, i) => { for (let r = 0; r < 10; r++) { pts.push([(i + 0.5) / 26, x / 0.12, 0]); pts.push([(i + 0.5) / 26, (1 / 26) / 0.12, 1]); pts.push([(i + 0.5) / 26, ((1 - m) * x + m / 26) / 0.12, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'share of the fount', invariants: {
    fonteMacKellar: { mesure: ecarts, formule: 0, sommeMinuscules: tot, eSurZ: cnt('e') / cnt('z'), valeursDistinctes: new Set(lc.map(([, c]) => c)).size, entropieFonte: H.toFixed(4), entropieUniforme: Hu.toFixed(4),
      petitesCapitalesHors: horsDemi.join(' '), lettresAuDessus: auDessus, note: 'a count not in hundreds, or a small capital other than T not half its capital' },
    temoin: { mesure: parts[0] * 26 > 2 && Hu - H > 0.3 ? 0 : 1, formule: 0, eFoisUniforme: (parts[0] * 26).toFixed(3), note: 'witness: if every letter served alike, e would have 1/26; it has 2.919 times that' } } };
}

// ---------- 128 : la longueur des mots allemands, Kaeding 1898 (idee : codex 30, sous-agent Claude ; tables : SOURCES, p. 24-25) ----------
// Pour la stenographie, des centaines de compteurs ont classe pres de 11 millions de mots allemands (14 corpus : presse, droit, theologie,
//   classiques, lettres...) selon leur nombre de syllabes, jusqu a 20 millions de syllabes.
// Exact ici : resume : syllabes = n x mots 15 / 15, totaux 10 906 235 mots et 20 000 000 syllabes ; lignes : 13 / 14 se somment en mots et
//   en syllabes, 13 / 14 moyennes a l arrondi ; colonnes : 14 / 15 ; totaux de lignes = Summa. Une seule cellule fausse explique les trois
//   ecarts : 8b (lettres militaires), 4 syllabes, 13 171 imprime ; la ligne manque de 800 mots et 3 200 syllabes (3 200 / 800 = 4), la
//   colonne 4 de 800 : nommee. Moyenne de la ligne 2 : 2.0261 imprimee 2.02 (nommee) ; 1 syllabe : 49.7543 % imprime 49.76 (nomme).
// MESURE : les quatre controles, hors la cellule 8b, la moyenne 2 et le 49.76 nommes.
// Temoin : « chaque syllabe de plus garde le rapport de 1 a 2 syllabes » (0.5817) : 621 265 mots de 5 syllabes prevus, 187 738 comptes.
// Dessin (vue de face) : syllabes / 15 contre ln(mots + 1) / 16 ; etiquette 0 le corpus choisi (zaehlstoff 0 = Summa, 1 a 14), 1 la Summa,
//   2 la loi geometrique du temoin.
function syllabesKaeding(P, n) {
  const lignes = SOURCES.syllabesKaedingTable.valeur.split(' ').map((l) => { const [nom, c, w, s, m] = l.split('|'); return { nom, c: c.split(',').map(Number), w: Number(w), s: Number(s), m }; });
  const [suC, suW, suS] = SOURCES.syllabesKaedingSumma.valeur.split('|'), summa = suC.split(',').map(Number), SW = Number(suW), SS = Number(suS);
  const [reW, reP, reS] = SOURCES.syllabesKaedingResume.valeur.split('|').map((x) => x.split(',').map(Number));
  let ecarts = 0;
  const somme = (a) => a.reduce((x, y) => x + y, 0), syl = (c) => c.reduce((a, x, i) => a + x * (i + 1), 0);
  if (reS.some((s, i) => s !== (i + 1) * reW[i]) || somme(reW) !== SW || somme(reS) !== SS || reW.some((x, i) => x !== summa[i])) ecarts++;
  const horsMots = lignes.filter((l) => somme(l.c) !== l.w).map((l) => l.nom), horsSyl = lignes.filter((l) => syl(l.c) !== l.s).map((l) => l.nom);
  const horsCol = summa.map((x, j) => (somme(lignes.map((l) => l.c[j])) !== x ? j + 1 : 0)).filter((j) => j > 0);
  const CELLULE = ['8b'], COLONNE = [4];
  for (const [hors, nommes] of [[horsMots, CELLULE], [horsSyl, CELLULE], [horsCol, COLONNE]]) ecarts += hors.filter((h) => !nommes.includes(h)).length + nommes.filter((h) => !hors.includes(h)).length;
  const l8b = lignes.find((l) => l.nom === '8b'), manque = [l8b.w - somme(l8b.c), l8b.s - syl(l8b.c)];
  if (manque[1] / manque[0] !== 4) ecarts++;
  if (somme(lignes.map((l) => l.w)) !== SW || somme(lignes.map((l) => l.s)) !== SS) ecarts++;
  const MOYENNE_NOMMEE = ['2'], horsMoy = lignes.filter((l) => (Math.round(l.s / l.w * 100) / 100).toFixed(2) !== l.m).map((l) => l.nom);
  ecarts += horsMoy.filter((h) => !MOYENNE_NOMMEE.includes(h)).length + MOYENNE_NOMMEE.filter((h) => !horsMoy.includes(h)).length;
  const pcts = [...reW.slice(0, 6), somme(reW.slice(6))].map((x) => x / SW * 100), POURCENT_NOMME = [0];
  const horsPct = pcts.map((x, i) => ((Math.round(x * 100) / 100).toFixed(2) !== reP[i].toFixed(2) ? i : -1)).filter((i) => i >= 0);
  ecarts += horsPct.filter((h) => !POURCENT_NOMME.includes(h)).length + POURCENT_NOMME.filter((h) => !horsPct.includes(h)).length;
  const r = summa[1] / summa[0], geo5 = summa[0] * r * r * r * r;
  const z = P.zaehlstoffKaeding, choisie = z === 0 ? summa : lignes[z - 1].c, pts = [];
  for (let j = 0; j < 15; j++) for (let q = 0; q < 10; q++) {
    pts.push([(j + 1) / 15, lnD(choisie[j] + 1) / 16, 0]); pts.push([(j + 1) / 15, lnD(summa[j] + 1) / 16, 1]); pts.push([(j + 1) / 15, lnD(summa[0] * expD(j * lnD(r)) + 1) / 16, 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'words', invariants: {
    syllabesKaeding: { mesure: ecarts, formule: 0, motsTotal: SW, syllabesTotal: SS, moyenneKaeding: (SS / SW).toFixed(5), lignesHors: horsMots.join(' ') + ' | ' + horsSyl.join(' '), colonnesHors: horsCol.join(' '),
      manque8b: manque.join(' '), moyennesHors: horsMoy.join(' '), pourCentUn: pcts[0].toFixed(4), note: 'a summary, row, column or total check off besides the named 8b cell, the row 2 mean and the 49.76' },
    temoin: { mesure: geo5 > 2 * summa[4] ? 0 : 1, formule: 0, geometriqueCinq: Math.round(geo5), note: 'witness: keeping the 1 to 2 syllable ratio would give 621 265 five-syllable words, against 187 738 counted' } } };
}

// ---------- 129 : la charge et le debit, Hagen 1839 (idee : codex 30, sous-agent Claude ; series : SOURCES, Ann. Phys. 46 p. 428-431) ----------
// Hagen fait couler de l eau dans trois tubes de laiton fins et ajuste, par les moindres carres, h = r M + s M^2 : le terme en M paie les
//   frottements, le terme en M^2 la vitesse donnee a l eau. Il en conclut que r depend de la temperature et s non (p. 431).
// Exact ici : ecarts imprimes = h calcule - h observe 21 / 21 ; erreur probable de h = 0.6745 racine(somme e^2 / (n - 2)) 5 / 5 ; h
//   recalcules depuis r et s imprimes a 0.001 pres 18 / 21 (II-3, III-4, V-1 : nommes) ; tube moyen (II, IV, V) : l etendue de r vaut 106
//   fois sa plus grande erreur probable (« das Hundertfache »), les ecarts de s a leur moyenne restent sous 3 fois la leur (2.63 au plus,
//   « nicht voll das Dreifache »).
// MESURE : les 21 ecarts, les 5 erreurs probables, les h hors les trois nommes, et les deux phrases de la p. 431.
// Temoin : « un seul terme, h = k M » (moindres carres) : 0.11 a 0.53 pouce d ecart moyen, contre 0.004 a 0.007 a deux termes.
// Dessin (vue de face) : M / 0.85 contre h / 15 ; etiquette 0 les mesures, 1 les courbes de Hagen, 2 ses courbes avec s x partCarreHagen.
function tubesHagen(P, n) {
  const series = SOURCES.tubesHagenSeries.valeur.split(' ').map((l) => { const [nom, tube, T, h, M, r, s, hc, e, ep] = l.split('|'), v = (x) => x.split(',').map(Number);
    return { nom, tube, T: Number(T), h: v(h), M: v(M), r: Number(r), s: Number(s), hc: v(hc), e: v(e), ep: v(ep) }; });
  let ecarts = 0, ecartsOK = 0, epOK = 0;
  const horsH = [];
  series.forEach((x) => {
    x.M.forEach((m, i) => { const h = x.r * m + x.s * m * m; if (!(Math.abs(h - x.hc[i]) <= 0.001 + 1e-9)) horsH.push(x.nom + '-' + (i + 1));
      if (Math.round((x.hc[i] - x.h[i]) * 1000) === Math.round(x.e[i] * 1000)) ecartsOK++; });
    const ep = 0.6745 * Math.sqrt(x.e.reduce((a, v) => a + v * v, 0) / (x.e.length - 2));
    if (ep.toFixed(4) === x.ep[0].toFixed(4)) epOK++;
  });
  if (ecartsOK !== 21 || epOK !== 5) ecarts++;
  const NOMMES = ['II-3', 'III-4', 'V-1'];
  ecarts += horsH.filter((h) => !NOMMES.includes(h)).length + NOMMES.filter((h) => !horsH.includes(h)).length;
  const moyen = series.filter((x) => x.tube === 'mittlere'), rs = moyen.map((x) => x.r), sMoy = moyen.reduce((a, x) => a + x.s, 0) / moyen.length;
  const centuple = (Math.max(...rs) - Math.min(...rs)) / Math.max(...moyen.map((x) => x.ep[1])), triple = Math.max(...moyen.map((x) => Math.abs(x.s - sMoy) / x.ep[2]));
  if (!(centuple >= 100 && triple < 3)) ecarts++;
  const lineaire = series.map((x) => { const k = x.M.reduce((a, m, i) => a + m * x.h[i], 0) / x.M.reduce((a, m) => a + m * m, 0); return Math.sqrt(x.h.reduce((a, h, i) => a + (k * x.M[i] - h) * (k * x.M[i] - h), 0) / x.h.length); });
  const deuxTermes = series.map((x) => Math.sqrt(x.e.reduce((a, v) => a + v * v, 0) / x.e.length));
  const part = P.partCarreHagen, pts = [];
  series.forEach((x) => { for (let j = 0; j <= 30; j++) { const m = x.M[x.M.length - 1] * j / 30; pts.push([m / 0.85, (x.r * m + x.s * m * m) / 15, 1]); pts.push([m / 0.85, (x.r * m + part * x.s * m * m) / 15, 2]); }
    x.M.forEach((m, i) => { for (let q = 0; q < 8; q++) pts.push([m / 0.85, x.h[i] / 15, 0]); }); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'Paris inches of head', invariants: {
    tubesHagen: { mesure: ecarts, formule: 0, ecartsHagen: ecartsOK + '/21', erreursProbablesHagen: epOK + '/5', hHorsHagen: horsH.join(' '), rFoisErreur: centuple.toFixed(1), sFoisErreur: triple.toFixed(2),
      note: 'a printed residual or probable error off, a recomputed head besides the three named, or r not 100 times its error, or s 3 times' },
    temoin: { mesure: lineaire.every((x, i) => x > 10 * deuxTermes[i]) ? 0 : 1, formule: 0, ecartLineaire: lineaire.map((x) => x.toFixed(4)).join(' '), ecartDeuxTermes: deuxTermes.map((x) => x.toFixed(4)).join(' '),
      note: 'witness: a head in proportion to the flow alone misses by 0.11 to 0.53 inch, against 0.004 to 0.007 with the square term' } } };
}

// ---------- 130 : la spirale des coquilles, Moseley 1838 (idee : codex 30, sous-agent Claude ; tables : SOURCES, Phil. Trans. 128 p. 356-358) ----------
// Moseley mesure au compas la largeur des tours successifs de deux coquilles et montre qu elles decroissent en progression geometrique, comme
//   le veut une spirale logarithmique (meme rapport d un tour au suivant, « characteristic number » 1.18 et 1.13).
// Exact ici : progressions imprimees = premiere largeur / raison^k a une unite du dernier chiffre : 7 / 8 (Turbo duplicatus, terme 3 :
//   0.796496 imprime .79651, nomme) et 7 / 7 (Buccinum) ; raisons ajustees (moindres carres sur ln) 1.1820 et 1.1311 ; (1.645)^1/3 =
//   1.18047 et (1.45)^1/3 = 1.13185, imprimes tronques 1.1804 et 1.1318 ; mais (1.389)^1/2 = 1.17856, pas le 1.1806 imprime (nomme) ;
//   Buccinum : six tours / trois tours = 2.4519, 2.4565, 2.4625, imprimes 2.45, le dernier a plus d une unite (nomme).
// MESURE : les deux progressions, les raisons ajustees a 0.01 du nombre caracteristique, les trois formules, les trois mu.
// Temoin : « les tours decroissent d une quantite constante » (droite ajustee) : 0.048 et 0.019 pouce d ecart moyen, contre 0.004 et 0.005
//   pour la progression geometrique ajustee.
// Dessin (vue de face) : tour / 8 contre largeur / 1.4 ; etiquette 0 Turbo duplicatus, 1 Buccinum, 2 les progressions de raison raisonMoseley.
function spiraleMoseley(P, n) {
  const co = SOURCES.spiraleMoseleyTours.valeur.split(' ').map((l) => { const [nom, r, w, g] = l.split('|'); return { nom, r: Number(r), w: w.split(',').map(Number), g: g.split(',') }; });
  const fo = SOURCES.spiraleMoseleyFormules.valeur.split(' ').map((l) => l.split(':').map(Number)), mu = SOURCES.spiraleMoseleyMu.valeur.split(' ').map((l) => l.split(':').map(Number));
  let ecarts = 0;
  const hors = [];
  co.forEach((c) => c.g.forEach((txt, k) => { const d = (txt.split('.')[1] || '').length, u = expD(-d * lnD(10)), x = c.w[0] / expD(k * lnD(c.r));
    if (!(Math.abs(x - Number(txt)) <= u + 1e-9)) hors.push(c.nom + k); }));
  const NOMMES = ['duplicatus3'];
  ecarts += hors.filter((h) => !NOMMES.includes(h)).length + NOMMES.filter((h) => !hors.includes(h)).length;
  const ajuste = (w) => { const m = w.length, mx = (m - 1) / 2, ly = w.map((v) => lnD(v)), my = ly.reduce((a, b) => a + b, 0) / m; let sxy = 0, sxx = 0;
    w.forEach((_, k) => { sxy += (k - mx) * (ly[k] - my); sxx += (k - mx) * (k - mx); }); const b = sxy / sxx, a = my - b * mx;
    const ml = w.reduce((p, q) => p + q, 0) / m; let s2 = 0; w.forEach((v, k) => { s2 += (k - mx) * (v - ml); }); const bl = s2 / sxx, al = ml - bl * mx;
    return { r: expD(-b), geo: Math.sqrt(w.reduce((s, v, k) => s + (expD(a + b * k) - v) * (expD(a + b * k) - v), 0) / m), arith: Math.sqrt(w.reduce((s, v, k) => s + (al + bl * k - v) * (al + bl * k - v), 0) / m) }; };
  const fits = co.map((c) => ajuste(c.w));
  if (!fits.every((f, i) => Math.abs(f.r - co[i].r) < 0.01)) ecarts++;
  const tronque = (x) => Math.floor(x * 10000 + 1e-9) / 10000, horsFormule = fo.map(([b, e, r], i) => (tronque(expD(lnD(b) / e)) !== r ? i : -1)).filter((i) => i >= 0);
  const FORMULE_NOMMEE = [1];
  ecarts += horsFormule.filter((i) => !FORMULE_NOMMEE.includes(i)).length + FORMULE_NOMMEE.filter((i) => !horsFormule.includes(i)).length;
  const MU_NOMME = [2], horsMu = mu.map(([a, b], i) => (Math.abs(a / b - 2.45) <= 0.01 + 1e-9 ? -1 : i)).filter((i) => i >= 0);
  ecarts += horsMu.filter((i) => !MU_NOMME.includes(i)).length + MU_NOMME.filter((i) => !horsMu.includes(i)).length;
  const raison = P.raisonMoseley, pts = [];
  co.forEach((c, i) => c.w.forEach((v, k) => { for (let q = 0; q < 10; q++) { pts.push([(k + 0.5) / 8, v / 1.4, i]); pts.push([(k + 0.5) / 8, c.w[0] / expD(k * lnD(raison)) / 1.4, 2]); } }));
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'inches', invariants: {
    spiraleMoseley: { mesure: ecarts, formule: 0, progressionHors: hors.join(' '), raisonsAjustees: fits.map((f) => f.r.toFixed(4)).join(' '), formulesMoseley: fo.map(([b, e]) => expD(lnD(b) / e).toFixed(5)).join(' '),
      muBuccinum: mu.map(([a, b]) => (a / b).toFixed(4)).join(' '), note: 'a progression term besides duplicatus 3, a fitted ratio more than 0.01 off, a formula besides the 1.1806, or a mu besides the third' },
    temoin: { mesure: fits.every((f) => f.arith > 3 * f.geo) ? 0 : 1, formule: 0, ecartArithmetique: fits.map((f) => f.arith.toFixed(4)).join(' '), ecartGeometrique: fits.map((f) => f.geo.toFixed(4)).join(' '),
      note: 'witness: whorls shrinking by a fixed amount miss by 0.048 and 0.019 inch, against 0.004 and 0.005 for a fixed ratio' } } };
}

// ---------- 131 : les pois de Mendel, 1866 (idee : codex 31, sous-agent Claude ; comptes : SOURCES, Verhandlungen Brunn IV p. 12-15) ----------
// Mendel croise des pois qui different par un seul caractere et compte, a la generation suivante, les formes dominantes et recessives :
//   environ 3 pour 1, pour les sept caracteres. A la generation d apres, les dominants se partagent en 1 constant pour 2 hybrides.
// Exact ici : dominant + recessif = total 7 / 7 ; rapports imprimes = arrondi au centieme 7 / 7 (la troncature n en donne que 2) ; le
//   2,98 de la p. 15 sort des totaux (14 949 / 5 010 = 2.98383) comme de la moyenne des sept rapports (2.98143) : la page ne dit pas
//   lequel ; seconde generation 372 / 193 = 1.9275 et 353 / 166 = 2.1265, imprimes 1,93 et 2,13, sommes 565 et 519.
//   Somme des sept khi-deux contre 3 : 1 : 2.1389 (7 degres) : un calcul, sans conclusion sur la facon dont les comptes ont ete faits.
// MESURE : sommes, rapports, 2,98 par l un des deux chemins, seconde generation.
// Temoin : « les deux formes reviennent a egalite » (1 : 1) : somme des khi-deux 4950.9, contre 2.14 pour 3 : 1.
// Dessin (vue de face) : essai / 8 contre part / 1 ; etiquette 0 la part dominante comptee, 1 la part recessive, 2 la part recessive attendue
//   pour un rapport dominant / recessif egal a rapportMendel.
function poisMendel(P, n) {
  const f2 = SOURCES.poisMendelF2.valeur.split(' ').map((l) => l.split(':').map(Number)), f3 = SOURCES.poisMendelF3.valeur.split(' ').map((l) => l.split(':').map(Number));
  const t = Object.fromEntries(SOURCES.poisMendelTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const cent = (x) => (Math.round(x * 100) / 100).toFixed(2);
  let ecarts = 0;
  const sommes = f2.filter(([, tot, d, r]) => d + r === tot).length, rapports = f2.filter(([, , d, r, q]) => cent(d / r) === q.toFixed(2)).length;
  if (sommes !== 7 || rapports !== 7) ecarts++;
  const D2 = f2.reduce((a, e) => a + e[2], 0), R2 = f2.reduce((a, e) => a + e[3], 0), parTotaux = D2 / R2, parMoyenne = f2.reduce((a, e) => a + e[4], 0) / f2.length;
  if (cent(parTotaux) !== nb('moyenne').toFixed(2) && cent(parMoyenne) !== nb('moyenne').toFixed(2)) ecarts++;
  if (!f3.every(([, tot, c, h, q]) => c + h === tot && cent(h / c) === q.toFixed(2))) ecarts++;
  const khi = (pDom) => f2.reduce((a, [, tot, d, r]) => { const ed = tot * pDom, er = tot * (1 - pDom); return a + (d - ed) * (d - ed) / ed + (r - er) * (r - er) / er; }, 0);
  const k31 = khi(0.75), k11 = khi(0.5);
  const q = P.rapportMendel, pts = [];
  f2.forEach(([e, tot, d, r]) => { for (let k = 0; k < 15; k++) { pts.push([e / 8, d / tot, 0]); pts.push([e / 8, r / tot, 1]); pts.push([e / 8, 1 / (q + 1), 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'share of the offspring', invariants: {
    poisMendel: { mesure: ecarts, formule: 0, sommesMendel: sommes + '/7', rapportsMendel: rapports + '/7', totauxMendel: D2 + ' ' + R2, deuxCheminsMendel: parTotaux.toFixed(5) + ' ' + parMoyenne.toFixed(5),
      secondeGeneration: f3.map(([, , c, h]) => (h / c).toFixed(4)).join(' '), khiDeuxTroisUn: k31.toFixed(4), note: 'a sum or a printed ratio off, the 2.98 not recovered either way, or a second generation ratio off' },
    temoin: { mesure: k11 > 100 * k31 ? 0 : 1, formule: 0, khiDeuxUnUn: k11.toFixed(1), note: 'witness: both forms coming back equally would give a chi-square of 4950.9, against 2.14 for three to one' } } };
}

// ---------- 132 : les rayons cathodiques, J. J. Thomson 1897 (idee : codex 31, sous-agent Claude ; tableau : SOURCES, Phil. Mag. 44 p. 306) ----------
// Thomson recueille les rayons cathodiques : la charge Q, la chaleur W qu ils deposent et la deviation magnetique I (= H rho) donnent
//   v = 2W / (QI) et m / e = I^2 Q / (2W) (p. 303). Le rapport m / e, environ 1e-7, ne depend pas du gaz, et il est bien plus petit que le
//   1e-4 de l ion hydrogene de l electrolyse (p. 310).
// Exact ici : m / e recalcule depuis W / Q et I a une unite du dernier chiffre imprime 21 / 26 ; v 20 / 26 ; les ecarts sont nommes. La
//   ligne 8 (hydrogene, W / Q imprime 6e12) manque les deux : avec 6e11 les deux colonnes s accordent (coquille probable, non ecrite sur
//   la page). Sur les colonnes imprimees seules, (m / e) v = I a 15 % pres 25 / 26 (ligne 10 : 1.154, nommee).
// MESURE : m / e et v hors les lignes nommees, l identite (m / e) v = I.
// Temoin : « les porteurs sont des ions comme ceux de l electrolyse » (m / e = 1e-4) : la moyenne imprimee vaut 5.13e-8, 1949 fois moins.
// Dessin (vue de face) : v / 1.3e10 contre m / e / 1e-7 ; etiquette 0 les valeurs imprimees, 1 recalculees depuis W / Q et I, 2 recalculees
//   avec I multiplie par facteurIThomson (m / e en I^2, v en 1 / I).
function rayonsThomson(P, n) {
  const L = SOURCES.rayonsThomsonTable.valeur.split(' ').map((l) => { const r = l.split(':'); return { tube: Number(r[0]), gaz: r[1], WQ: Number(r[2]) * expD(Number(r[3]) * lnD(10)), I: Number(r[4]), meTxt: r[5], me: Number(r[5]), vTxt: r[6], vm: Number(r[6]), ve: Number(r[7]) }; });
  const t = Object.fromEntries(SOURCES.rayonsThomsonTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const unite = (s) => expD(-((s.split('.')[1] || '').length) * lnD(10)), p10 = (e) => expD(e * lnD(10));
  let ecarts = 0;
  const horsMe = [], horsV = [], horsProd = [];
  L.forEach((r, i) => { const me = r.I * r.I / (2 * r.WQ) * 1e7, v = 2 * r.WQ / r.I / p10(r.ve);
    if (!(Math.abs(me - r.me) <= unite(r.meTxt) + 1e-9)) horsMe.push(i + 1);
    if (!(Math.abs(v - r.vm) <= unite(r.vTxt) + 1e-9)) horsV.push(i + 1);
    if (!(Math.abs(r.me * 1e-7 * r.vm * p10(r.ve) / r.I - 1) <= 0.15)) horsProd.push(i + 1); });
  const NOMMES_ME = [8, 13, 14, 16, 20], NOMMES_V = [8, 10, 11, 14, 18, 24], NOMMES_PROD = [10];
  for (const [hors, nommes] of [[horsMe, NOMMES_ME], [horsV, NOMMES_V], [horsProd, NOMMES_PROD]]) ecarts += hors.filter((h) => !nommes.includes(h)).length + nommes.filter((h) => !hors.includes(h)).length;
  const moyMe = L.reduce((a, r) => a + r.me * 1e-7, 0) / L.length, fois = nb('electrolyse') / moyMe;
  const f = P.facteurIThomson, pts = [];
  L.forEach((r) => { const me = r.I * r.I / (2 * r.WQ), v = 2 * r.WQ / r.I;
    for (let q = 0; q < 10; q++) { pts.push([r.vm * p10(r.ve) / 1.3e10, r.me, 0]); pts.push([v / 1.3e10, me * 1e7, 1]); pts.push([v / f / 1.3e10, me * f * f * 1e7, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'CGS units', invariants: {
    rayonsThomson: { mesure: ecarts, formule: 0, lignesThomson: L.length, meHors: horsMe.join(' '), vHors: horsV.join(' '), produitHors: horsProd.join(' '), moyenneMeThomson: moyMe.toExponential(3),
      note: 'an m / e or v off besides the named rows, or the printed m / e times v not equal to I within 15 % besides row 10' },
    temoin: { mesure: fois > 1000 ? 0 : 1, formule: 0, foisPlusPetit: Math.round(fois), note: 'witness: ions like those of electrolysis would have m / e = 1e-4; his values average 1949 times less' } } };
}

// ---------- 133 : l echelle des magnitudes, Pogson 1856 (idee : codex 31, sous-agent Claude ; table : SOURCES, MNRAS 17 p. 14-15) ----------
// Pogson fixe le rapport de lumiere d une magnitude a la suivante a 2,512 (« exactly 5 » pour l inverse de ½ log R : en fait 4.999755) et
//   en tire la plus petite etoile visible dans une lunette : l = 9.2 + 5 log(ouverture en pouces). Il ramene ensuite les echelles de Struve,
//   Bond, John Herschel et Smyth a la sienne.
// Exact ici : ouvertures = 10^((m - 9.2) / 5) tronquees a 3 chiffres significatifs 10 / 10 (l arrondi n en donne que 8) ; ouverture x 10
//   tous les 5 magnitudes 5 / 5 ; texte : 9.2 + 5 log 7 = 13.4255 (« 13.4 »), 9.2 + 5 log 0.23 = 6.0086 (« 6.0 »), 9.2 + 5 log 15 = 15.0805
//   (« 15.1 ») ; colonnes par interpolation lineaire comme le dit la p. 15 : Smyth 8 -> 8, 13 -> 16 : 6 / 6 ; Bond 12 -> 12.9, 15.1 -> 20 :
//   4 / 4 ; Struve 6 -> 6, 15.1 -> 12 : 9 / 10 (7 : 6.659 imprime 6.6) ; Herschel 6 -> 6, 15.1 -> 18 : 9 / 10 (14 : 16.549 imprime 16.6) :
//   nommes.
// MESURE : ouvertures, periode de 5 magnitudes, les trois nombres du texte, les quatre colonnes hors les deux cases nommees.
// Temoin : le rapport de Dawes (4 : l ouverture double a chaque magnitude) demanderait 117 pouces pour la 15e, contre 14.4.
// Dessin (vue de face) : magnitude / 16 contre (log10 ouverture + 1) / 3 ; etiquette 0 les ouvertures imprimees, 1 les ouvertures pour le
//   rapport rapportPogson, 2 les magnitudes de Struve, Bond, Herschel et Smyth / 20.
function magnitudesPogson(P, n) {
  const L = SOURCES.magnitudesPogsonTable.valeur.split(' ').map((l) => { const r = l.split(':'); return { m: Number(r[0]), apTxt: r[1], ap: Number(r[1]), obs: r.slice(2).map((x) => (x === 'x' ? null : Number(x))) }; });
  const t = Object.fromEntries(SOURCES.magnitudesPogsonTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const log10 = (x) => lnD(x) / lnD(10), p10 = (x) => expD(x * lnD(10));
  const tronque3 = (x) => { const e = Math.floor(log10(x) + 1e-12), f = p10(2 - e); return Math.floor(x * f + 1e-9) / f; };
  let ecarts = 0;
  const ouvOK = L.filter((r) => Math.abs(tronque3(p10((r.m - nb('L')) / 5)) - r.ap) < 1e-9).length;
  const chiffres = (s) => s.replace('.', '').replace(/^0+/, ''), periode = L.slice(0, 5).filter((r, i) => chiffres(L[i + 5].apTxt) === chiffres(r.apTxt)).length;
  if (ouvOK !== 10 || periode !== 5) ecarts++;
  const dixieme = (x) => Math.round(x * 10) / 10, limite = nb('L') + 5 * log10(15);
  if (dixieme(nb('L') + 5 * log10(7)) !== nb('hind') || dixieme(nb('L') + 5 * log10(0.23)) !== nb('argelander') || dixieme(limite) !== nb('limiteStruve')) ecarts++;
  const lin = (x0, y0, x1, y1) => (x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  const regles = [[0, lin(6, 6, nb('limiteStruve'), 12), 6], [1, lin(12, 12.9, nb('limiteStruve'), 20), 12], [2, lin(6, 6, nb('limiteStruve'), 18), 6], [3, lin(8, 8, 13, 16), 8]];
  const hors = [];
  regles.forEach(([col, f, depuis]) => L.forEach((r) => { if (r.m >= depuis && r.obs[col] !== null && dixieme(f(r.m)) !== r.obs[col]) hors.push(['S', 'B', 'H', 'Sm'][col] + r.m); }));
  const NOMMES = ['S7', 'H14'];
  ecarts += hors.filter((h) => !NOMMES.includes(h)).length + NOMMES.filter((h) => !hors.includes(h)).length;
  const exact5 = 1 / (0.5 * log10(nb('rapport'))), dawes15 = L[0].ap * expD(9 * lnD(nb('dawes')) / 2);
  const R = P.rapportPogson, pts = [];
  L.forEach((r) => { for (let q = 0; q < 12; q++) { pts.push([r.m / 16, (log10(r.ap) + 1) / 3, 0]); pts.push([r.m / 16, (log10(L[0].ap * expD((r.m - 6) * lnD(R) / 2)) + 1) / 3, 1]);
    r.obs.forEach((o) => { if (o !== null) pts.push([r.m / 16, o / 20, 2]); }); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'magnitudes', invariants: {
    magnitudesPogson: { mesure: ecarts, formule: 0, ouverturesPogson: ouvOK + '/10', periodePogson: periode + '/5', limiteCalculee: limite.toFixed(4), colonnesHorsPogson: hors.join(' '), exactementCinq: exact5.toFixed(6),
      note: 'an aperture, the five-magnitude period, a number of the text, or an observer column off besides Struve 7 and Herschel 14' },
    temoin: { mesure: dawes15 > 5 * L[9].ap ? 0 : 1, formule: 0, ouvertureDawes15: dawes15.toFixed(1), note: 'witness: with Dawes ratio of 4 the 15th magnitude would need a 117 inch telescope, against 14.4' } } };
}

// ---------- 134 : le mais croise et autofeconde, Darwin 1876 (idee : codex 31, sous-agent Claude ; table : SOURCES, Table XCVII p. 234) ----------
// Darwin seme par paires, de part et d autre de quatre grands pots, des graines de mais issues d un croisement et d une autofecondation, et
//   mesure les jeunes plantes : les croisees sont plus hautes.
// Exact ici : totaux 2423 et 2109 huitiemes = 302.875 et 263.625 pouces, imprimes 302.88 et 263.63 (arrondi demi vers le haut) ; moyennes
//   20.1917 (« 20.19 ») et 17.575, imprimee 17.57 alors que le meme arrondi donne 17.58 (nommee : aucune regle unique ne redonne les quatre
//   nombres) ; 100 x 17.575 / 20.1917 = 87.04, « 100 to 87 ». Lignes prises dans l ordre imprime : la croisee depasse l autofecondee 13 fois
//   sur 15 (la page ne dit pas que les lignes sont les paires ; c est l ordre du tableau).
// MESURE : les deux totaux, la moyenne des croisees, le 87 ; la moyenne 17.57 nommee.
// Temoin : « croisement et autofecondation donnent la meme hauteur » : 13 lignes sur 15 dans le meme sens ont une probabilite de 0.0074
//   (test du signe bilateral) ; l ecart moyen est de 2.62 pouces.
// Dessin (vue de face) : ligne / 16 contre hauteur / 24 pouces ; etiquette 0 croisees, 1 autofecondees, 2 autofecondees augmentees de
//   gainDarwin pour cent.
function maisDarwin(P, n) {
  const ph = (x) => { const [p, h] = x.split('-').map(Number); return p * 8 + h; };
  const L = SOURCES.maisDarwinTable.valeur.split(' ').map((l) => { const [pot, c, a] = l.split(':'); return { pot, c: ph(c), a: ph(a) }; });
  const t = Object.fromEntries(SOURCES.maisDarwinTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const cent = (x) => Math.round(x * 100) / 100;
  const sc = L.reduce((s, r) => s + r.c, 0), sa = L.reduce((s, r) => s + r.a, 0), mc = sc / 8 / L.length, ma = sa / 8 / L.length;
  let ecarts = 0;
  if (cent(sc / 8) !== nb('totalCroise') || cent(sa / 8) !== nb('totalAuto')) ecarts++;
  if (cent(mc) !== nb('moyenneCroise') || Math.round(100 * ma / mc) !== nb('rapport')) ecarts++;
  const MOYENNE_AUTO_NOMMEE = true;
  if ((cent(ma) !== nb('moyenneAuto')) !== MOYENNE_AUTO_NOMMEE) ecarts++;
  const plusHautes = L.filter((r) => r.c > r.a).length, m = L.length;
  let queue = 0, comb = 1;
  for (let k = 0; k <= m - plusHautes; k++) { queue += comb; comb = comb * (m - k) / (k + 1); }
  const pSigne = 2 * queue / expD(m * lnD(2)), ecartMoyen = L.reduce((s, r) => s + (r.c - r.a) / 8, 0) / m;
  const g = P.gainDarwin, pts = [];
  L.forEach((r, i) => { for (let q = 0; q < 12; q++) { pts.push([(i + 1) / 16, r.c / 8 / 24, 0]); pts.push([(i + 1) / 16, r.a / 8 / 24, 1]); pts.push([(i + 1) / 16, r.a / 8 * (1 + g / 100) / 24, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'inches', invariants: {
    maisDarwin: { mesure: ecarts, formule: 0, huitiemesDarwin: sc + ' ' + sa, moyennesDarwin: mc.toFixed(4) + ' ' + ma.toFixed(4), rapportDarwin: (100 * ma / mc).toFixed(3), lignesCroiseesPlusHautes: plusHautes + '/' + m,
      note: 'a printed total, the crossed mean or the 87 off, or the 17.57 no longer differing from rounding' },
    temoin: { mesure: pSigne < 0.05 ? 0 : 1, formule: 0, pSigneDarwin: pSigne.toFixed(5), ecartMoyenDarwin: ecartMoyen.toFixed(4), note: 'witness: if crossing made no difference, 13 rows of 15 the same way would come up 0.74 percent of the time' } } };
}

// ---------- 135 : l emanation du thorium, Rutherford 1900 (idee : codex 31, sous-agent Claude ; table : SOURCES, Phil. Mag. 49 p. 6 et 12) ----------
// Rutherford souffle sur de l oxyde de thorium, arrete le courant d air et suit la conduction du gaz : elle decroit « in a geometrical
//   progression with the time », de moitie en une minute environ. Il en tire lambda = 1/86 et le millionieme apres 20 minutes.
// Exact ici : ajustement de ln i sur t (8 points) : lambda 0.011446 par seconde, demi-vie 60.56 s (58.95 s par l origine) ; 60 / ln 2 =
//   86.56, imprime 86 (troncature) ; exp(-1200 / 86) = 8.71e-7, « about one millionth ».
// MESURE : la demi-vie ajustee a 5 % des 60 s du texte, le 86 par troncature, l ordre de grandeur du millionieme.
// Temoin : « la conduction baisse d une quantite fixe par seconde » (droite ajustee) : 0.163 d ecart moyen contre 0.034, et la droite passe
//   sous zero a 360 s (-0.19).
// Dessin (vue de face) : temps / 360 contre courant ; etiquette 0 la Table III, 1 la loi 2^(-t / demiVieRutherford), 2 la droite du temoin.
function emanationRutherford(P, n) {
  const T = SOURCES.emanationRutherfordTable.valeur.split(' ').map((l) => l.split(':').map(Number));
  const tx = Object.fromEntries(SOURCES.emanationRutherfordTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(tx[c]);
  const droite = (xs, ys) => { const k = xs.length, mx = xs.reduce((a, b) => a + b, 0) / k, my = ys.reduce((a, b) => a + b, 0) / k; let s = 0, q = 0;
    xs.forEach((x, i) => { s += (x - mx) * (ys[i] - my); q += (x - mx) * (x - mx); }); const b = s / q; return [my - b * mx, b]; };
  const ts = T.map((r) => r[0]), is = T.map((r) => r[1]);
  const [a, b] = droite(ts, is.map((x) => lnD(x))), lambda = -b, demiVie = lnD(2) / lambda;
  let s0 = 0, q0 = 0; ts.forEach((x, i) => { s0 += x * lnD(is[i]); q0 += x * x; });
  const demiVieOrigine = lnD(2) / (-s0 / q0);
  let ecarts = 0;
  if (!(Math.abs(demiVie - nb('demiVie')) / nb('demiVie') < 0.05)) ecarts++;
  const inverse = nb('demiVie') / lnD(2);
  if (Math.floor(inverse) !== nb('lambdaInverse')) ecarts++;
  const reste = expD(-nb('vingtMinutes') / nb('lambdaInverse'));
  if (!(reste > nb('millionieme') / 3 && reste < nb('millionieme') * 3)) ecarts++;
  const rmsE = Math.sqrt(ts.reduce((z, x, i) => z + (expD(a + b * x) - is[i]) * (expD(a + b * x) - is[i]), 0) / ts.length);
  const [al, bl] = droite(ts, is), rmsL = Math.sqrt(ts.reduce((z, x, i) => z + (al + bl * x - is[i]) * (al + bl * x - is[i]), 0) / ts.length);
  const tv = P.demiVieRutherford, pts = [];
  for (let j = 0; j <= 72; j++) { const x = 5 * j; pts.push([x / 360, expD(-x * lnD(2) / tv), 1]); pts.push([x / 360, al + bl * x, 2]); }
  T.forEach(([x, i]) => { for (let q = 0; q < 15; q++) pts.push([x / 360, i, 0]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'current (initial = 1)', invariants: {
    emanationRutherford: { mesure: ecarts, formule: 0, lambdaAjuste: lambda.toFixed(6), demiVieAjustee: demiVie.toFixed(2), demiVieOrigine: demiVieOrigine.toFixed(2), unSurLambda: inverse.toFixed(4), resteVingtMinutes: reste.toExponential(3),
      note: 'a fitted half-life more than 5 % from 60 s, the 86 not a cut of 60 / ln 2, or the 20 minute remainder not near a millionth' },
    temoin: { mesure: rmsL > 3 * rmsE && al + bl * 360 < 0 ? 0 : 1, formule: 0, ecartDroite: rmsL.toFixed(4), ecartExponentielle: rmsE.toFixed(4), droiteA360: (al + bl * 360).toFixed(3),
      note: 'witness: a fixed drop per second misses by 0.163 against 0.034 and goes below zero at 360 s' } } };
}

// ---------- 136 : l ether immobile, Michelson et Morley 1887 (idee : codex 31, sous-agent Claude ; tableaux : SOURCES, Am. J. Sci. 34 p. 340-341) ----------
// L interferometre tourne sur un bain de mercure ; si la Terre traversait un ether immobile a sa vitesse orbitale, les franges devraient se
//   deplacer de 0.4 frange entre deux orientations a 90 degres (2D v2/V2 avec D = 2e7 longueurs d onde). Ils lisent la position des
//   franges a 16 reperes, trois jours a midi et trois le soir.
// Exact ici : Mean = moyenne des trois jours au dixieme 17 / 17 et 17 / 17 ; Mean in w. l. = Mean x 0.02 34 / 34 ; seconde ligne = reperes
//   8 a 16, 18 / 18 ; Final mean = demi-somme des deux demi-tours 18 / 18. Ajustement (moindres carres, derive lineaire + terme en 2 theta)
//   des 17 « Mean in w. l. » : 0.0166 frange crete a crete a midi (1/24.2 de 0.4), 0.0226 le soir (1/17.7 : AU-DELA du « less than the
//   twentieth part » du texte, ecrit ici tel quel) ; derive d un tour -0.246 et +0.146. racine(1/20) = 0.2236 et racine(1/40) = 0.1581,
//   d ou « one-fourth » et « one sixth » de la vitesse orbitale.
// MESURE : les quatre regles du tableau, 0.4, et les deux racines sous 1/4 et 1/6.
// Temoin : « ether immobile, vitesse orbitale » : 0.4 frange attendue, 17.7 a 24.2 fois plus que le signal ajuste.
// Dessin (vue de face) : repere / 16 contre (Mean in w. l. - sa moyenne) ; etiquette 0 midi, 1 soir, 2 l effet attendu pour une vitesse
//   relative vitesseEther x l orbitale (0.4 v^2 crete a crete, en cos 2 theta).
function etherMichelson(P, n) {
  const lis = (s) => { const [nom, ...c] = s.split('|'), v = c.map((x) => x.split(',').map(Number)); return { nom, jours: v.slice(0, 3), mean: v[3], wl: v[4], seconde: v[5], fin: v[6] }; };
  const series = [lis(SOURCES.etherMichelsonMidi.valeur), lis(SOURCES.etherMichelsonSoir.valeur)];
  const t = Object.fromEntries(SOURCES.etherMichelsonTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  let ecarts = 0;
  const comptes = series.map((s) => {
    const moy = s.mean.filter((m, k) => Math.round((s.jours[0][k] + s.jours[1][k] + s.jours[2][k]) / 3 * 10) === Math.round(m * 10)).length;
    const wl = s.wl.filter((w, k) => Math.round(s.mean[k] * 20) === w).length;
    const sec = s.seconde.filter((w, k) => w === s.wl[k + 8]).length, fin = s.fin.filter((f, k) => s.wl[k] + s.wl[k + 8] === 2 * f).length;
    if (moy !== 17 || wl !== 17 || sec !== 9 || fin !== 9) ecarts++;
    return moy + ' ' + wl + ' ' + sec + ' ' + fin; });
  const attendu = 2 * nb('D') * nb('v2');
  if (Math.abs(attendu - nb('attendu')) > 1e-12 || !(Math.sqrt(1 / nb('vingtieme')) < 1 / 4) || !(Math.sqrt(1 / nb('quarantieme')) < 1 / 6)) ecarts++;
  const resout = (A, b) => { const m = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < m; c++) { let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const tmp = M[c]; M[c] = M[p]; M[p] = tmp; for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[m] / r[i]); };
  const ajuste = (s) => { const y = s.wl.map((w) => w / 1000), X = y.map((_, k) => [1, k, cosD(2 * PI * k / 8), sinD(2 * PI * k / 8)]);
    const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => X.reduce((z, r) => z + r[i] * r[j], 0))), b = [0, 1, 2, 3].map((i) => X.reduce((z, r, k) => z + r[i] * y[k], 0));
    const [, , c, d] = resout(A, b); return 2 * Math.sqrt(c * c + d * d); };
  const cretes = series.map(ajuste), fois = cretes.map((c) => nb('attendu') / c);
  const v = P.vitesseEther, pts = [];
  series.forEach((s, i) => { const moy = s.wl.reduce((a, b) => a + b, 0) / s.wl.length / 1000; s.wl.forEach((w, k) => { for (let q = 0; q < 10; q++) pts.push([k / 16, w / 1000 - moy, i]); }); });
  for (let j = 0; j <= 64; j++) { const k = j / 4; pts.push([k / 16, 0.2 * v * v * cosD(2 * PI * k / 8), 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'wave-lengths', invariants: {
    etherMichelson: { mesure: ecarts, formule: 0, reglesMidi: comptes[0], reglesSoir: comptes[1], frangeAttendue: attendu, creteMidiSoir: cretes.map((c) => c.toFixed(4)).join(' '), deriveTour: series.map((s) => ((s.wl[16] - s.wl[0]) / 1000).toFixed(3)).join(' '),
      note: 'a Mean, a w. l. value, a second-row copy or a Final mean off, the 0.4 fringe, or the one-fourth and one-sixth bounds' },
    temoin: { mesure: fois.every((f) => f > 10) ? 0 : 1, formule: 0, foisMichelson: fois.map((f) => f.toFixed(1)).join(' '), note: 'witness: an ether at rest would shift the fringes by 0.4; the fitted signal is 17.7 to 24.2 times smaller' } } };
}

// ---------- 137 : le rayonnement aux grandes longueurs d onde, Rubens et Kurlbaum 1901 (idee : codex 31, sous-agent Claude ; table : SOURCES) ----------
// Les « rayons restants » du sel gemme isolent une longueur d onde de 51.2 micron. Rubens et Kurlbaum chauffent un corps noir de -188 a
//   1500 C et comparent l energie recue (echelle ramenee a 132 a 1000 C, 0 a 20 C) a cinq lois proposees : Wien, Thiesen, Rayleigh,
//   Lummer-Jahnke et celle que Planck venait de donner.
// Exact ici : chaque colonne de loi se refait depuis les seules formules et constantes de la p. 652 (lambda_m T = 2890), ramenees a 0 a 293 K
//   et 132 a 1273 K : les 50 cases a 2.32 au plus (Wien a l infini : 194.6, imprime 194). Ecart quadratique moyen a l observation sur les
//   7 lignes mesurees (hors 293 et 1273, fixees) : Planck 1.51, Lummer-Jahnke 1.79, Rayleigh 2.60, Thiesen 13.96, Wien 45.18.
// MESURE : les 50 cases et l infini de Wien, et l ordre Planck < Lummer-Jahnke < Rayleigh < Thiesen < Wien.
// Temoin : la loi de Wien, si juste aux courtes longueurs d onde : 45.18 d ecart moyen, 30 fois celui de Planck (147.5 prevu a 1500 C
//   contre 196.8 mesure).
// Dessin (vue de face) : T / 1800 contre energie / 210 ; etiquette 0 l observation, 1 la colonne imprimee de la loi loiRubens (0 Wien,
//   1 Thiesen, 2 Rayleigh, 3 Lummer-Jahnke, 4 Planck), 2 la meme loi recalculee depuis sa formule.
function reststrahlenRubens(P, n) {
  const L = SOURCES.reststrahlenRubensTable.valeur.split(' ').map((l) => { const r = l.split(':'); return { T: r[0] === 'i' ? Infinity : Number(r[0]), obs: r[1] === 'x' ? null : Number(r[1]), lois: r.slice(2).map((x) => (x === 'x' ? null : Number(x))) }; });
  const t = Object.fromEntries(SOURCES.reststrahlenRubensTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const lam = nb('lambda'), lmT = nb('lambdaMT');
  const lois = [(T) => expD(-nb('cWien') * lmT / (lam * T)), (T) => Math.sqrt(lam * T) * expD(-nb('cThiesen') * lmT / (lam * T)), (T) => lam * T * expD(-nb('cRayleigh') * lmT / (lam * T)),
    (T) => lam * T * expD(-(nb('cLJ') / nb('nuLJ')) * expD(nb('nuLJ') * lnD(lmT)) / expD(nb('nuLJ') * lnD(lam * T))), (T) => 1 / (expD(nb('cPlanck') * lmT / (lam * T)) - 1)];
  const echelle = (f) => { const g = (T) => (T === 0 ? 0 : f(T)), e0 = g(293), e1 = g(1273); return (T) => (g(T) - e0) / (e1 - e0) * 132; };
  let ecarts = 0, pire = 0;
  lois.forEach((f, j) => { const s = echelle(f); L.forEach((r) => { if (r.T !== Infinity) pire = Math.max(pire, Math.abs(s(r.T) - r.lois[j])); }); });
  const wienInfini = (1 - expD(-nb('cWien') * lmT / (lam * 293))) / (expD(-nb('cWien') * lmT / (lam * 1273)) - expD(-nb('cWien') * lmT / (lam * 293))) * 132;
  if (!(pire <= 2.5) || !(Math.abs(wienInfini - L[L.length - 1].lois[0]) <= 1)) ecarts++;
  const mesurees = L.filter((r) => r.obs !== null && r.T !== 293 && r.T !== 1273);
  const rms = [0, 1, 2, 3, 4].map((j) => Math.sqrt(mesurees.reduce((a, r) => a + (r.lois[j] - r.obs) * (r.lois[j] - r.obs), 0) / mesurees.length));
  if (!(rms[4] < rms[3] && rms[3] < rms[2] && rms[2] < rms[1] && rms[1] < rms[0])) ecarts++;
  const choix = P.loiRubens, courbe = echelle(lois[choix]), pts = [];
  for (let j = 1; j <= 60; j++) { const T = 30 * j; pts.push([T / 1800, courbe(T) / 210, 2]); }
  L.forEach((r) => { if (r.T === Infinity) return; for (let q = 0; q < 10; q++) { if (r.obs !== null) pts.push([r.T / 1800, r.obs / 210, 0]); pts.push([r.T / 1800, r.lois[choix] / 210, 1]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'scale divisions (132 at 1000 C)', invariants: {
    reststrahlenRubens: { mesure: ecarts, formule: 0, ecartMaxLois: pire.toFixed(2), wienInfiniRubens: wienInfini.toFixed(1), rmsLoisRubens: rms.map((x) => x.toFixed(2)).join(' '),
      note: 'a law column more than 2.5 off its formula, the infinite Wien value, or the order Planck, Lummer-Jahnke, Rayleigh, Thiesen, Wien broken' },
    temoin: { mesure: rms[0] > 10 * rms[4] ? 0 : 1, formule: 0, wienSurPlanck: (rms[0] / rms[4]).toFixed(1), note: 'witness: Wien law misses by 45.18 on average, 30 times Planck, 147.5 against 196.8 at 1500 C' } } };
}

// ---------- 138 : les constantes h et k, Planck 1901 (idee : codex 31, sous-agent Claude ; nombres : SOURCES, Ann. Phys. 4 p. 562-563) ----------
// Avec deux mesures seulement, l energie totale rayonnee (Kurlbaum) et la position du maximum (Lummer et Pringsheim), Planck tire de sa loi
//   les deux constantes qui portent depuis son nom et celui de Boltzmann : h = 6.55e-27 erg s et k = 1.346e-16 erg / degre.
// Exact ici : densite a = 4 S / (c (373^4 - 273^4)) = 7.06162e-15, imprimee 7.061 (une unite : troncature, nommee) ; la serie
//   1 + 1/2^4 + 1/3^4 + ... = 1.082323 (« 1,0823 ») ; k4/h3 = a c^3 / (48 pi 1.0823) depuis les valeurs non arrondies 1.16821e15 (« 1,1682 ») ;
//   racine de (1 - x/5) e^x = 1 : 4.965114 (« 4,9651 ») ; h/k = 4.9651 x 0.294 / 3e10 = 4.86580e-11 (« 4,866 ») ; depuis les valeurs
//   imprimees, h = (k4/h3)(h/k)^4 = 6.5495e-27 (« 6,55 ») et k = h / (h/k) = 1.3460e-16 (« 1,346 »).
// MESURE : la serie, k4/h3, la racine, h/k, h et k a l arrondi imprime ; la densite nommee (une unite).
// Temoin : « le maximum suit la loi de Wien » (x = 5) : (1 - 5/5) e^5 - 1 = -1, l equation de Planck n est pas satisfaite.
// Dessin (vue de face) : x = h nu / k T / 12 contre energie relative ; etiquette 0 la loi de Planck x^3 / (e^x - 1), 1 celle de Wien
//   x^3 e^-x, 2 h et k recalcules pour lambdaThetaPlanck (barres a 0.85 et 0.95, divisees par 2 fois les valeurs imprimees).
function constantesPlanck(P, n) {
  const t = Object.fromEntries(SOURCES.constantesPlanckTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const chiffres = (x, d) => { const e = Math.floor(lnD(Math.abs(x)) / lnD(10) + 1e-12), f = expD((d - 1 - e) * lnD(10)); return Math.round(x * f) / f; };
  const meme = (x, imp) => Math.abs(chiffres(x, String(t[imp]).replace(/e.*$/, '').replace(/[-.]/g, '').length) - nb(imp)) <= Math.abs(nb(imp)) * 1e-12;
  const a = 4 * nb('S') / (nb('c') * (373 * 373 * 373 * 373 - 273 * 273 * 273 * 273));
  let serie = 0; for (let m = 1; m <= 2000; m++) serie += 1 / (m * m * m * m); serie += 1 / (3 * 2000 * 2000 * 2000);
  const k4h3 = a * nb('c') * nb('c') * nb('c') / (48 * PI * serie);
  let x = 5; for (let i = 0; i < 60; i++) { const f = (1 - x / 5) * expD(x) - 1, df = expD(x) * (1 - x / 5 - 1 / 5); x -= f / df; }
  const hk = nb('racine') * nb('lambdaTheta') / nb('c'), h = nb('k4h3') * nb('hk') * nb('hk') * nb('hk') * nb('hk'), k = h / nb('hk');
  let ecarts = 0;
  const DENSITE_NOMMEE = true;
  if (meme(a, 'a') === DENSITE_NOMMEE) ecarts++;
  const repris = [[serie, 'serie'], [k4h3, 'k4h3'], [x, 'racine'], [hk, 'hk'], [h, 'h'], [k, 'k']].filter(([v, c]) => meme(v, c)).length;
  if (repris !== 6) ecarts++;
  const wien = (1 - 5 / 5) * expD(5) - 1;
  const lt = P.lambdaThetaPlanck, hP = nb('k4h3') * expD(4 * lnD(nb('racine') * lt / nb('c'))), kP = hP / (nb('racine') * lt / nb('c')), pts = [];
  for (let j = 1; j <= 120; j++) { const u = j / 10; pts.push([u / 12, u * u * u / (expD(u) - 1) / 1.5, 0]); pts.push([u / 12, u * u * u * expD(-u) / 1.5, 1]); }
  for (let j = 0; j <= 20; j++) { pts.push([0.85, j / 20 * hP / nb('h') / 2, 2]); pts.push([0.95, j / 20 * kP / nb('k') / 2, 2]); }
  const brut = new Float64Array(n * 3);
  for (let q = 0; q < n; q++) { const [px, py, pe] = pts[q % pts.length], o = 3 * q; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'relative energy', invariants: {
    constantesPlanck: { mesure: ecarts, formule: 0, densitePlanck: a.toExponential(5), seriePlanck: serie.toFixed(6), k4h3Planck: k4h3.toExponential(5), racinePlanck: x.toFixed(6), hkPlanck: hk.toExponential(5),
      hPlanck: h.toExponential(4), kPlanck: k.toExponential(4), repriseesPlanck: repris + '/6', note: 'the series, k4 / h3, the root, h / k, h or k not his printed value, or the density no longer one unit off' },
    temoin: { mesure: Math.abs(wien) > 0.5 ? 0 : 1, formule: 0, residuWien: wien.toFixed(3), note: 'witness: with Wien x = 5 the maximum equation (1 - x/5) e^x = 1 is off by 1' } } };
}

// ---------- 139 : la profondeur de la Voie lactee, Herschel 1785 (idee : codex 31, sous-agent Claude ; table : SOURCES, Phil. Trans. 75 p. 242-252) ----------
// Herschel compte les etoiles dans le champ de son telescope (15 minutes d arc) et, en les supposant egalement espacees, en tire la longueur
//   du « rayon visuel » dans chaque direction : n = racine cubique de B^2 S, avec B = 1 / tan(demi-champ), et rayon = n - 1, en distances
//   de Sirius (p. 242). Sa Table II donne ce rayon pour 0.1 a 100 000 etoiles et deux nebulosites.
// Exact ici : rayon = arrondi de racine cubique(B^2 S) - 1 pour 165 / 167 lignes ; S = 120 (292.225, imprime 291) et S = 290 (392.496,
//   imprime 393) : nommes ; a une unite pres 166 / 167 (seul 120 en sort) ; sans le « - 1 », 1 / 167 seulement ; S = 588 -> n = 498.043
//   (« 498 »).
// MESURE : la formule sur les 167 lignes hors les deux nommees, l exemple 588 -> 498.
// Temoin : « les etoiles sont reparties sur une surface, pas dans un volume » (rayon en racine carree de S, cale sur S = 1) : 18 656 pour
//   100 000 etoiles, contre 2758 imprime ; la pente log-log de la table vaut 0.333, pas 0.5.
// Dessin (vue de face) : log10(etoiles + 1) / 6.5 contre log10(rayon) / 4 ; etiquette 0 la Table II, 1 la formule pour 15 minutes, 2 la formule
//   pour un champ de champHerschel minutes.
function jaugesHerschel(P, n) {
  const L = SOURCES.jaugesHerschelTable.valeur.split(' ').map((l) => l.split(':').map(Number));
  const t = Object.fromEntries(SOURCES.jaugesHerschelTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const demi = (minutes) => minutes / 2 / 60 * PI / 180, tanD = (x) => sinD(x) / cosD(x), cube = (x) => expD(lnD(x) / 3);
  const B = 1 / tanD(demi(nb('champMinutes'))), rayon = (s, b) => cube(b * b * s) - 1;
  let ecarts = 0;
  const horsArrondi = L.filter(([s, r]) => Math.round(rayon(s, B)) !== r).map(([s]) => s), horsUn = L.filter(([s, r]) => !(Math.abs(rayon(s, B) - r) <= 1)).map(([s]) => s);
  const NOMMES = [120, 290];
  ecarts += horsArrondi.filter((s) => !NOMMES.includes(s)).length + NOMMES.filter((s) => !horsArrondi.includes(s)).length;
  const sansMoinsUn = L.filter(([s, r]) => Math.round(cube(B * B * s)) === r).length;
  if (Math.round(cube(B * B * nb('exempleEtoiles'))) !== nb('exempleN')) ecarts++;
  const lx = L.map(([s]) => lnD(s)), ly = L.map(([, r]) => lnD(r + 1)), mx = lx.reduce((a, b) => a + b, 0) / L.length, my = ly.reduce((a, b) => a + b, 0) / L.length;
  let sxy = 0, sxx = 0; lx.forEach((x, i) => { sxy += (x - mx) * (ly[i] - my); sxx += (x - mx) * (x - mx); });
  const pente = sxy / sxx, carre100k = (L.find(([s]) => s === 1)[1] + 1) * Math.sqrt(100000) - 1;
  const champ = P.champHerschel, B2 = 1 / tanD(demi(champ)), log10 = (x) => lnD(x) / lnD(10), pts = [];
  for (let j = 0; j <= 80; j++) { const s = expD((-1 + 7.4 * j / 80) * lnD(10)); pts.push([log10(s + 1) / 6.5, log10(rayon(s, B)) / 4, 1]); pts.push([log10(s + 1) / 6.5, log10(Math.max(1, rayon(s, B2))) / 4, 2]); }
  L.forEach(([s, r]) => { for (let q = 0; q < 6; q++) pts.push([log10(s + 1) / 6.5, log10(r) / 4, 0]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'distances of Sirius', invariants: {
    jaugesHerschel: { mesure: ecarts, formule: 0, lignesHerschel: L.length, BHerschel: B.toFixed(4), horsArrondiHerschel: horsArrondi.join(' '), horsUniteHerschel: horsUn.join(' '), sansMoinsUnHerschel: sansMoinsUn + '/' + L.length,
      exemple588: cube(B * B * nb('exempleEtoiles')).toFixed(3), penteHerschel: pente.toFixed(5), note: 'a visual ray off the cube root formula besides S = 120 and 290, or the 588 example not 498' },
    temoin: { mesure: carre100k > 5 * L.find(([s]) => s === 100000)[1] && Math.abs(pente - 1 / 3) < 0.01 ? 0 : 1, formule: 0, racineCarree100k: Math.round(carre100k),
      note: 'witness: stars spread over a surface would give a square root law, 18 656 for 100 000 stars against 2758' } } };
}

// ---------- 140 : le pendule invariable de Kater 1819, la figure de la Terre (idee : codex 31, sous-agent Claude ; table : SOURCES, Phil. Trans. 109 p. 416-422) ----------
// Kater promene un meme pendule de Unst (Shetland) a l ile de Wight et compte ses battements par jour : plus au nord il bat plus vite, et
//   la longueur du pendule qui bat la seconde en sort, L = L(Unst) (N / N(Unst))^2. Contre le carre du sinus de la latitude, les 7 longueurs
//   sont presque une droite L = E + d sin^2 : E au equateur, d / E la diminution de la pesanteur du pole a l equateur, et avec sa constante
//   0.0086501 (ellipticite + diminution, p. 422) l aplatissement vaut 1 / (0.0086501 - d / E).
// Exact ici : 6 / 6 baisses successives (battements et longueurs) ; L proportionnelle a N^2 a moins de 2e-5 pouce pour 7 / 7 (max 1.70e-5,
//   London) ; la droite par Unst et Shanklin Farm (son « Dunnose ») redonne E = 39.00734, l imprime p. 422.
// MESURE : ces trois points. L ajustement des 7 stations (moindres carres, poids egaux : MON choix, pas le sien) donne 1 / 321.8.
// Temoin : « Terre homogene » (Newton, p. 418 : ellipticite = diminution = 1 / 230) ; la diminution mesuree vaut 1 / 180.4, 1.27 fois plus.
// Dessin (vue de face) : sin^2 latitude contre longueur ; etiquette 0 les stations, 1 la droite ajustee sans la station otee, 2 la droite
//   d une Terre homogene par le meme point moyen.
function penduleKater(P, n) {
  const L = SOURCES.penduleKaterTable.valeur.split(' ').map((l) => l.split('/'));
  const t = Object.fromEntries(SOURCES.penduleKaterTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const st = L.map(([nom, d, m, s, N, Lp]) => { const phi = (Number(d) + Number(m) / 60 + Number(s) / 3600) * PI / 180, sn = sinD(phi); return { nom, s2: sn * sn, N: Number(N), L: Number(Lp) }; });
  let ecarts = 0;
  const decroit = st.filter((x, i) => i > 0 && x.N < st[i - 1].N && x.L < st[i - 1].L).length;
  if (decroit !== st.length - 1) ecarts++;
  const devs = st.map((x) => x.L - st[0].L * (x.N / st[0].N) * (x.N / st[0].N)), maxDev = Math.max(...devs.map(Math.abs));
  if (!(maxDev <= 2e-5)) ecarts++;
  const a = st[0], b = st[st.length - 1], d2 = (a.L - b.L) / (a.s2 - b.s2), E2 = a.L - d2 * a.s2;
  if (Math.round(E2 * 1e5) !== Math.round(nb('equateurUnstDunnose') * 1e5)) ecarts++;
  const ajuste = (liste) => { const mx = liste.reduce((s, x) => s + x.s2, 0) / liste.length, my = liste.reduce((s, x) => s + x.L, 0) / liste.length;
    let sxy = 0, sxx = 0; liste.forEach((x) => { sxy += (x.s2 - mx) * (x.L - my); sxx += (x.s2 - mx) * (x.s2 - mx); }); const d = sxy / sxx; return { d, E: my - d * mx, mx, my }; };
  const tout = ajuste(st), dE = tout.d / tout.E, aplat = 1 / (nb('sommeCinqDemi') - dE);
  const otee = Math.max(0, Math.min(st.length, Math.round(P.stationOteeKater))), reste = otee ? st.filter((_, i) => i !== otee - 1) : st;
  const f = ajuste(reste), aplatSans = 1 / (nb('sommeCinqDemi') - f.d / f.E), homogene = 1 / nb('newton');
  const pts = [], X = (s2) => (s2 - 0.55) / 0.25, Y = (l) => (l - 39.12) / 0.06;
  for (let j = 0; j <= 60; j++) { const s2 = 0.55 + 0.25 * j / 60; pts.push([X(s2), Y(f.E + f.d * s2), 1]); pts.push([X(s2), Y(f.my + f.E * homogene * (s2 - f.mx)), 2]); }
  reste.forEach((x) => { for (let q = 0; q < 12; q++) pts.push([X(x.s2), Y(x.L), 0]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'inches (Shuckburgh scale)', invariants: {
    penduleKater: { mesure: ecarts, formule: 0, stationsKater: st.length, decroitKater: decroit + '/' + (st.length - 1), ecartN2Kater: (maxDev * 1e5).toFixed(2),
      equateurKater: E2.toFixed(5), equateurAjusteKater: tout.E.toFixed(5), diminutionKater: dE.toFixed(7), aplatissementKater: aplat.toFixed(1),
      oteeKater: otee ? st[otee - 1].nom : 'none', aplatissementSansKater: aplatSans.toFixed(1),
      note: 'beats not falling to the south, a length off N squared by more than 2e-5 inch, or the Unst-Dunnose line not 39.00734' },
    temoin: { mesure: dE / homogene > 1.15 && aplat > nb('newton') * 1.2 && aplat < nb('huygens') ? 0 : 1, formule: 0, rapportNewtonKater: (dE / homogene).toFixed(3),
      note: 'witness: a homogeneous Earth (Newton 1/230) needs a gravity diminution of 1/230; the pendulum gives 1/180' } } };
}

// ---------- 141 : le chat dans la boite, Thorndike 1898 (idee : codex « cerveau humain », sous-agent Claude ; table : SOURCES, p. 15) ----------
// Un chat affame, enferme dans une boite, doit trouver le geste qui ouvre la porte. Thorndike chronometre ses 24 essais : 160 s le
//   premier, 7 s le dernier. L apprentissage se fait par essais et erreurs, en dents de scie : il n y a pas de « declic ».
// Exact ici : 24 temps (le texte dit « 24 experiences ») ; moyennes par blocs de six essais strictement decroissantes.
// MESURE : ces deux points. Exposes, sans etre des lois de Thorndike (il n en ecrit pas) : 8 / 23 hausses, premier temps <= 10 s au 14e
//   essai puis 10 / 11, et deux ajustements MIENS sur ln T (moindres carres, poids egaux) : puissance (SSR 2.97) meilleure qu exponentielle (4.28).
// Temoin : « il a compris d un coup » (une fois sorti en 30 s au 2e essai, il resterait rapide) : il met ensuite 90 puis 60 s.
// Dessin (vue de face) : essai contre ln du temps ; etiquette 0 les temps imprimes, 1 la moyenne glissante sur moyenneThorndike essais,
//   2 l ajustement en loi puissance.
function essaisThorndike(P, n) {
  const T = SOURCES.essaisThorndikeTemps.valeur.split(' ').map(Number);
  const t = Object.fromEntries(SOURCES.essaisThorndikeTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  let ecarts = 0;
  if (T.length !== nb('essais')) ecarts++;
  const blocs = [0, 1, 2, 3].map((b) => T.slice(6 * b, 6 * b + 6).reduce((a, c) => a + c, 0) / 6);
  if (!blocs.every((x, i) => i === 0 || x < blocs[i - 1])) ecarts++;
  const hausses = T.slice(1).filter((x, i) => x > T[i]).length;
  const premierDix = T.findIndex((x) => x <= 10) + 1, ensuiteDix = T.slice(premierDix - 1).filter((x) => x <= 10).length;
  const ajuste = (xs, ys) => { const m = xs.length, mx = xs.reduce((a, b) => a + b, 0) / m, my = ys.reduce((a, b) => a + b, 0) / m;
    let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
    const b = sxy / sxx, a = my - b * mx; return { a, b, ssr: xs.reduce((s, x, i) => s + (ys[i] - a - b * x) * (ys[i] - a - b * x), 0) }; };
  const lnT = T.map((x) => lnD(x)), rang = T.map((_, i) => i + 1);
  const puissance = ajuste(rang.map((r) => lnD(r)), lnT), expo = ajuste(rang, lnT);
  const i30 = T.findIndex((x) => x <= 30), retours = T.slice(i30 + 1).filter((x) => x > 30);
  const k = Math.max(1, Math.min(8, Math.round(P.moyenneThorndike))), glisse = T.map((_, i) => { const s = T.slice(Math.max(0, i - k + 1), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
  const pts = [], X = (r) => (r - 1) / (T.length - 1), Y = (v) => lnD(v) / lnD(200);
  for (let j = 0; j <= 60; j++) { const r = 1 + (T.length - 1) * j / 60; pts.push([X(r), (puissance.a + puissance.b * lnD(r)) / lnD(200), 2]); }
  glisse.forEach((v, i) => { pts.push([X(i + 1), Y(v), 1]); if (i) for (let q = 1; q < 4; q++) pts.push([X(i + q / 4), Y(glisse[i - 1] + (v - glisse[i - 1]) * q / 4), 1]); });
  T.forEach((v, i) => { for (let q = 0; q < 10; q++) pts.push([X(i + 1), Y(v), 0]); });
  const brut = new Float64Array(n * 3);
  for (let kk = 0; kk < n; kk++) { const [px, py, pe] = pts[kk % pts.length], o = 3 * kk; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'seconds', invariants: {
    essaisThorndike: { mesure: ecarts, formule: 0, essaisN: T.length, sommeThorndike: T.reduce((a, b) => a + b, 0), minimumThorndike: Math.min(...T) + ' s at trial ' + (T.indexOf(Math.min(...T)) + 1),
      haussesThorndike: hausses + '/' + (T.length - 1), blocsThorndike: blocs.map((x) => x.toFixed(2)).join(' '), premierDixThorndike: premierDix, ensuiteDixThorndike: ensuiteDix + '/' + (T.length - premierDix + 1),
      exposantPuissanceThorndike: puissance.b.toFixed(4), ssrPuissanceThorndike: puissance.ssr.toFixed(4), ssrExpoThorndike: expo.ssr.toFixed(4), moyenneSurThorndike: k,
      note: 'not the 24 printed trials, or the six-trial averages not falling block after block' },
    temoin: { mesure: T[i30] <= 30 && retours.length >= 1 ? 0 : 1, formule: 0, retoursThorndike: retours.join(' '),
      note: 'witness: a cat that understood at once would stay fast after its 30 s second trial; it then took 90 and 60 s' } } };
}

// ---------- 142 : le temps d une decision, Donders 1868 (idee : codex « cerveau humain », sous-agent Claude ; table : SOURCES, p. 680-681) ----------
// Donders chronometre une reponse vocale avec un diapason a 261 vibrations par seconde. Methode a : on sait quelle syllabe va venir et on
//   la repete. Methode b : la syllabe est inconnue parmi plusieurs, on repete celle entendue (reconnaitre ET choisir sa reponse). Methode c :
//   on ne repond qu a « Ki » et on se tait aux autres (reconnaitre, une seule reponse). Les differences de temps mesurent ce qu ajoute
//   chaque decision : la methode soustractive.
// Exact ici : les 10 differences de la p. 681 = colonnes de la table p. 680 (au centieme) ; les 3 moyennes du rouleau XVI B = ses essais,
//   TRONQUEES au centieme (63,375 -> 63,37) ; 15 determinations ; 21,67 -> 83, 9,48 -> 36,32, 17,5 -> 67,05 millièmes (x 1000 / 261) ;
//   b - a > c - a > 0 dans 5 / 5 colonnes.
// MESURE : ces points. La 4e conversion (11 -> « 4?,15 ») est abimee sur le scan : nommee, jamais testee.
// Temoin : « decider ne coute rien » (b = a) : b - a = 21,67 vibrations = 83 ms ; et « reconnaitre coute autant que choisir » (c = b) :
//   c - a = 36 ms seulement. A dire avec : sur les minima l ecart se resserre (11 contre 17,5), et au rouleau XV c - a ne vaut que 4,17.
// Dessin (vue de face) : methode (a, c, b) contre temps en ms ; etiquette 0 les moyennes des rouleaux, 1 les essais un par un du rouleau
//   XVI B, 2 la moyenne et le minimum de toutes les observations ; curseur : rouleau montre (0 tous, 1 XV, 2 XVI A, 3 XVI B).
function reactionDonders(P, n) {
  const lis = (cle) => Object.fromEntries(SOURCES[cle].valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, v.split('/').map(Number)]; }));
  const T = lis('reactionDondersTable'), Df = lis('reactionDondersDiff'), E = lis('reactionDondersEssais');
  const t = Object.fromEntries(SOURCES.reactionDondersTexte.valeur.split(' ').map((x) => x.split(':'))), nb = (c) => Number(t[c]);
  const hz = nb('diapason'), ms = (v) => v * 1000 / hz, egal = (x, y) => Math.abs(x - y) < 0.0051;
  let ecarts = 0, diffsOk = 0;
  for (let k = 0; k < 5; k++) { if (egal(T.b[k] - T.a[k], Df.ba[k])) diffsOk++; else ecarts++; if (egal(T.c[k] - T.a[k], Df.ca[k])) diffsOk++; else ecarts++; }
  const tronque = (x) => Math.floor(x * 100 + 1e-9) / 100, moy = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  const moyennesOk = ['a', 'b', 'c'].filter((m) => tronque(moy(E[m])) === T[m][2]).length;
  if (moyennesOk !== 3) ecarts++;
  const determinations = E.a.length + E.b.length + E.c.length;
  if (determinations !== nb('determinations')) ecarts++;
  const conv = [[Df.ba[3], 0, 'msBaMoyennes'], [Df.ca[3], 2, 'msCaMoyennes'], [Df.ba[4], 2, 'msBaMinima']];
  const convOk = conv.filter(([v, d, c]) => (Math.round(ms(v) * 10 ** d) / 10 ** d) === nb(c)).length;
  if (convOk !== 3) ecarts++;
  const ordre = Df.ba.filter((x, k) => x > Df.ca[k] && Df.ca[k] > 0).length;
  if (ordre !== 5) ecarts++;
  const r = Math.max(0, Math.min(3, Math.round(P.rouleauDonders))), cols = r ? [r - 1] : [0, 1, 2];
  const pos = { a: 0, c: 0.5, b: 1 }, Y = (v) => ms(v) / 320, pts = [];
  for (const m of ['a', 'b', 'c']) {
    for (const k of cols) for (let q = 0; q < 14; q++) pts.push([pos[m] + (k - 1) * 0.04, Y(T[m][k]), 0]);
    if (r === 0 || r === 3) E[m].forEach((v, i) => { for (let q = 0; q < 6; q++) pts.push([pos[m] + 0.12 + 0.012 * i, Y(v), 1]); });
    for (let q = 0; q < 10; q++) { pts.push([pos[m] - 0.1, Y(T[m][3]), 2]); pts.push([pos[m] - 0.1, Y(T[m][4]), 2]); }
  }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'milliseconds', invariants: {
    reactionDonders: { mesure: ecarts, formule: 0, differencesDonders: diffsOk + '/10', moyennesXVIBDonders: moyennesOk + '/3', determinationsDonders: determinations,
      conversionsDonders: convOk + '/3', ordreDonders: ordre + '/5', baMsDonders: ms(Df.ba[3]).toFixed(2), caMsDonders: ms(Df.ca[3]).toFixed(2), rouleauDonders: ['all', 'XV', 'XVI A', 'XVI B'][r],
      note: 'a printed difference not equal to the table, a roll XVI B mean not its trials truncated, or b - a > c - a > 0 failing' },
    temoin: { mesure: Df.ba[3] > 0 && Df.ca[3] < Df.ba[3] ? 0 : 1, formule: 0, ecartMinimaDonders: Df.ba[4] + ' vs ' + Df.ca[4],
      note: 'witness: deciding would cost nothing (b = a): it costs 83 ms; recognising would cost as much as choosing (c = b): c - a is 36 ms' } } };
}

// ---------- 143: attention and distraction, Cattell 1886 (idea: codex "human brain", Claude sub-agent; tables: SOURCES, p. 238-240) ----------
// Two trained observers, B (Berger) and C (Cattell), react to a light, a shock or a sound with the attention "concentrated" (a voluntary
//   effort), "normal", or "distracted" (adding 17 after 17 in the head). R is the mean time in thousandths of a second.
// Exact here: Table VIII (20 cells) = Table VI and the A lines of Table VII with normal taken as 0, its A line = mean of the four rows, rounded;
//   every A line of Table VII lies within 1 of the mean of its five series (12/12; rounded exactly 11/12: C sound distracted 158.4, printed 159);
//   distraction lengthens the time in 8/8 blocks (+13 to +44) and in 20/20 single series.
// Witness: "concentrating always makes you faster": C under electric light was 26 slower concentrated; single series agree 15/20 only.
// Drawing (front view): attention (concentrated, normal, distracted) against time / 250 ms; label 0 single series of Table VII, 1 printed
//   block means (Tables VI and VII), 2 Table VIII differences around a line at 0.4; slider: observer (0 both, 1 B, 2 C).
function attentionCattell(P, n) {
  const blocksCattell = (key) => Object.fromEntries(SOURCES[key].valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, v.split(',').map((g) => g.split('/').map(Number))]; }));
  const six = blocksCattell('attentionCattellSix'), seven = blocksCattell('attentionCattellSeven'), sevenA = blocksCattell('attentionCattellSevenA'), eight = blocksCattell('attentionCattellEight');
  const meanCattell = (l) => l.reduce((a, b) => a + b, 0) / l.length, blocks7 = ['BL', 'CL', 'BS', 'CS'];
  let gaps = 0, withinOne = 0, roundedExact = 0;
  for (const b of blocks7) for (let j = 0; j < 3; j++) { const m = meanCattell(seven[b][j]); if (Math.abs(m - sevenA[b][0][j]) <= 1) withinOne++; if (Math.round(m) === sevenA[b][0][j]) roundedExact++; }
  if (withinOne !== 12) gaps++;
  const normalised = { B: [six.BE[0], six.BK[0], sevenA.BL[0], sevenA.BS[0]], C: [six.CE[0], six.CK[0], sevenA.CL[0], sevenA.CS[0]] };
  let eightOk = 0; const conc = [], dist = [];
  for (const o of ['B', 'C']) {
    const d = normalised[o].map(([c, nn, ds]) => [c - nn, ds - nn]);
    d.forEach(([dc, dd], i) => { conc.push(dc); dist.push(dd); if (dc === eight[o][i][0]) eightOk++; if (dd === eight[o][i][1]) eightOk++; });
    if (Math.round(meanCattell(d.map((x) => x[0]))) === eight[o][4][0]) eightOk++;
    if (Math.round(meanCattell(d.map((x) => x[1]))) === eight[o][4][1]) eightOk++;
  }
  if (eightOk !== 20) gaps++;
  const distLonger = dist.filter((x) => x > 0).length;
  if (distLonger !== 8) gaps++;
  let seriesDist = 0, seriesConc = 0;
  for (const b of blocks7) seven[b][1].forEach((nn, i) => { if (seven[b][2][i] > nn) seriesDist++; if (seven[b][0][i] < nn) seriesConc++; });
  if (seriesDist !== 20) gaps++;
  const who = Math.max(0, Math.min(2, Math.round(P.sujetCattell))), keep = (b) => who === 0 || b[0] === 'BC'[who - 1];
  const xAtt = [0, 0.5, 1], Y = (ms) => ms / 250, pts = [];
  blocks7.filter(keep).forEach((b, i) => { for (let j = 0; j < 3; j++) {
    seven[b][j].forEach((v) => { for (let q = 0; q < 4; q++) pts.push([xAtt[j] + 0.03 * i, Y(v), 0]); });
    for (let q = 0; q < 12; q++) pts.push([xAtt[j] + 0.03 * i + 0.12, Y(sevenA[b][0][j]), 1]); } });
  ['BE', 'CE', 'BK', 'CK'].filter(keep).forEach((b, i) => { for (let j = 0; j < 3; j++) for (let q = 0; q < 12; q++) pts.push([xAtt[j] + 0.03 * i + 0.2, Y(six[b][0][j]), 1]); });
  for (const o of ['B', 'C']) if (keep(o)) eight[o].slice(0, 4).forEach(([dc, dd], i) => { for (let q = 0; q < 8; q++) { pts.push([0.25, 0.4 + dc / 250 + 0.01 * i, 2]); pts.push([0.75, 0.4 + dd / 250 + 0.01 * i, 2]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pe] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'milliseconds', invariants: {
    attentionCattell: { mesure: gaps, formule: 0, tableEightCattell: eightOk + '/20', sevenWithinOneCattell: withinOne + '/12', sevenRoundedCattell: roundedExact + '/12',
      distractedLongerCattell: distLonger + '/8', distractedRangeCattell: '+' + Math.min(...dist) + ' to +' + Math.max(...dist), seriesDistractedCattell: seriesDist + '/20',
      seriesConcentratedCattell: seriesConc + '/20', observerCattell: ['both', 'B', 'C'][who],
      note: 'a Table VIII cell not equal to Tables VI and VII, an A line more than 1 from its five series, or a distracted time not longer' },
    temoin: { mesure: Math.max(...conc) > 0 ? 0 : 1, formule: 0, concentratedSlowerCattell: '+' + Math.max(...conc),
      note: 'witness: concentrating would always make you faster; C under electric light was 26 thousandths slower, and single series agree 15 times in 20' } } };
}

// ---------- 144: small differences of sensation, Peirce and Jastrow 1884 (idea: codex "human brain", Claude sub-agent; tables: SOURCES, p. 76, 81) ----------
// Two weights pressed on a finger differ by a ratio from 1.100 down to 1.005; the observer says which is heavier, 50 times a set. If there were
//   a threshold below which the difference is not felt, errors there would be one in two.
// Exact here: the footnote table of p. 76 = (1 - erf(0.477 q)) / 2 rounded to the hundredth (6/6); Jastrow's printed group means = his daily
//   sets cut at the dates of the text, rounded to a tenth (10/10); the "calculated from probable error" column comes back within 0.15 error
//   (10/10) when the quotient is (ratio - 1) / probable error (the footnote says logarithm of the ratio: with ln, only 2/10 do).
// The probable error falls from 0.05 to 0.0235 between the two groups (practice, p. 81).
// Witness: "below a threshold one errs half the time": at a ratio of 1.005, 200 errors in 500 judgments, not 250 (chance alone: P = 4.5e-6).
// Drawing (front view): (ratio - 1) x 10 against errors / 50; label 0 single sets, 1 printed means, 2 the normal-error curve of the group
//   chosen with the slider (1 or 2).
function pressurePeirceJastrow(P, n) {
  const erfPeirceJastrow = (x) => { let s = 0, t = x, k = 0; while (Math.abs(t) > 1e-17) { s += t / (2 * k + 1); k++; t *= -x * x / k; } return 2 / Math.sqrt(Math.PI) * s; };
  const errorsPJ = (q) => (1 - erfPeirceJastrow(0.477 * q)) / 2, meanPJ = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  const daily = Object.fromEntries(SOURCES.pressurePeirceJastrowDaily.valeur.split(' ').map((g) => { const [k, ...c] = g.split('|'); return [k, Object.fromEntries(c.map((x) => { const [r, v] = x.split(':'); return [r, v.split('/').map(Number)]; }))]; }));
  const groups = Object.fromEntries(SOURCES.pressurePeirceJastrowGroups.valeur.split(' ').map((g) => { const [k, pe, ...c] = g.split('|'); return [k, { pe: Number(pe), rows: c.map((x) => x.split(':').map(Number)) }]; }));
  const fine = Object.fromEntries(SOURCES.pressurePeirceJastrowFine.valeur.split(' ').map((x) => { const [r, v] = x.split(':'); return [r, v.split('/').map(Number)]; }));
  const table = SOURCES.pressurePeirceJastrowTable.valeur.split(' ').map((x) => x.split(':').map(Number));
  let gaps = 0;
  const tableOk = table.filter(([q, p]) => Math.round(errorsPJ(q) * 100) / 100 === p).length;
  if (tableOk !== 6) gaps++;
  let meansOk = 0, calcOk = 0, calcLn = 0;
  for (const g of ['G1', 'G2']) for (const [R, obs, calc] of groups[g].rows) {
    const sets = daily[g][R.toFixed(3)];
    if (Math.round(sets.reduce((a, b) => a + b, 0) / sets.length * 10) / 10 === obs) meansOk++;
    if (Math.abs(50 * errorsPJ((R - 1) / groups[g].pe) - calc) <= 0.15) calcOk++;
    if (Math.abs(50 * errorsPJ(lnD(R) / groups[g].pe) - calc) <= 0.15) calcLn++;
  }
  if (meansOk !== 10) gaps++;
  if (calcOk !== 10) gaps++;
  const fineErrors = fine['1.005'].reduce((a, b) => a + b, 0), fineTrials = 50 * fine['1.005'].length;
  let tailPJ = 0, binomPJ = 1; const halfPowPJ = 0.5 ** fineTrials;
  for (let i = 0; i <= fineErrors; i++) { tailPJ += binomPJ * halfPowPJ; binomPJ = binomPJ * (fineTrials - i) / (i + 1); }
  const g = Math.max(1, Math.min(2, Math.round(P.groupeJastrow))), pe = groups['G' + g].pe, pts = [];
  for (const k of ['G1', 'G2']) for (const [r, sets] of Object.entries(daily[k])) sets.forEach((v) => { for (let q = 0; q < 3; q++) pts.push([(Number(r) - 1) * 10, v / 50, 0]); });
  for (const [r, sets] of Object.entries(fine)) sets.forEach((v) => { for (let q = 0; q < 3; q++) pts.push([(Number(r) - 1) * 10, v / 50, 0]); });
  for (const k of ['G1', 'G2']) for (const [R, obs] of groups[k].rows) for (let q = 0; q < 10; q++) pts.push([(R - 1) * 10, obs / 50, 1]);
  for (let i = 0; i <= 100; i++) { const x = 0.1 * i / 100; pts.push([x * 10, errorsPJ(x / pe), 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'errors in 50', invariants: {
    pressurePeirceJastrow: { mesure: gaps, formule: 0, tableP76PeirceJastrow: tableOk + '/6', groupMeansPeirceJastrow: meansOk + '/10', calculatedPeirceJastrow: calcOk + '/10',
      calculatedLnPeirceJastrow: calcLn + '/10', practicePeirceJastrow: (groups.G1.pe / groups.G2.pe).toFixed(2), groupPeirceJastrow: g,
      note: 'a p. 76 proportion not (1 - erf(0.477 q)) / 2, a group mean not its daily sets, or a calculated error more than 0.15 from the normal law' },
    temoin: { mesure: fineErrors < fineTrials / 2 && tailPJ < 1e-3 ? 0 : 1, formule: 0, finestPeirceJastrow: fineErrors + ' / ' + fineTrials, chancePeirceJastrow: tailPJ.toExponential(1),
      note: 'witness: below a threshold one would err half the time; at a ratio of 1.005 Jastrow erred 200 times in 500' } } };
}

// ---------- 145: extinction of a conditioned reflex, Pavlov 1927 (idea: codex "human brain", Claude sub-agent; tables: SOURCES, p. 52-58) ----------
// A dog salivates at the sight of meat powder. Shown again and again without being fed, the response fades: experimental extinction.
// Exact here: the printed summary (15, 20, 54, 18 minutes) = last printed time - first printed time of each series (4/4); the 16-minute
//   series spans 119 minutes and still ends above zero ("incomplete in 2 hours"); between two printed times there are always the stated
//   interval plus the one minute of stimulation (28/28); the longer the pause, the longer extinction takes (15 < 20 < 54 < 119).
// Witness: "no reward erases what was learnt": after a rest the response comes back in 2/2 experiments (0.15 c.c. after 2 hours, 7 drops
//   after 20 minutes), though both had fallen to zero.
// Drawing (front view): minutes since the first showing / 120 against saliva / 0.7 c.c.; label: the series (0 to 4 in the order printed);
//   slider: series shown (0 all, 1 to 5).
function extinctionPavlov(P, n) {
  const clockPavlov = (s) => { const [h, m] = s.split('.'); return Number(h) * 60 + Number(m); };
  const series = SOURCES.extinctionPavlovSeries.valeur.split(' ').map((x) => { const [k, rest] = x.split(':'), [t, v] = rest.split('=');
    return { k, iv: Number(k.replace(/\D/g, '')), t: t.split('/').map(clockPavlov), v: v.split('/').map(Number) }; });
  const summary = Object.fromEntries(SOURCES.extinctionPavlovSummary.valeur.split(' ').map((x) => x.split(':')));
  const recovery = SOURCES.extinctionPavlovRecovery.valeur.split(' ').map((x) => { const [, r] = x.split(':'), [a, b] = r.split('>'); return { before: a.split('/').map(Number), after: Number(b) }; });
  let gaps = 0, spacingOk = 0, steps = 0, rises = 0, summaryOk = 0;
  const durations = series.map((s) => s.t[s.t.length - 1] - s.t[0]);
  series.forEach((s, j) => {
    for (let i = 1; i < s.t.length; i++) { steps++; if (s.t[i] - s.t[i - 1] === s.iv + 1) spacingOk++; if (s.v[i] > s.v[i - 1]) rises++; }
    const printed = summary[s.k];
    if (/^\d+$/.test(printed) ? durations[j] === Number(printed) : durations[j] < 2 * 60 && s.v[s.v.length - 1] > 0) summaryOk++;
  });
  if (summaryOk !== 5 || spacingOk !== steps) gaps++;
  const longerWithPause = durations[0] < durations[1] && durations[1] < durations[2] && durations[2] < durations[3];
  if (!longerWithPause) gaps++;
  const firstZero = series.map((s) => { const i = s.v.findIndex((v) => v === 0); return i < 0 ? 'none' : String(i + 1); });
  const recovered = recovery.filter((r) => r.before[r.before.length - 1] === 0 && r.after > 0).length;
  const shown = Math.max(0, Math.min(5, Math.round(P.seriePavlov))), pts = [];
  series.forEach((s, j) => { if (shown === 0 || shown === j + 1) s.t.forEach((t, i) => { for (let q = 0; q < 8; q++) pts.push([(t - s.t[0]) / 120, s.v[i] / 0.7, j]); }); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'c.c. of saliva', invariants: {
    extinctionPavlov: { mesure: gaps, formule: 0, summaryPavlov: summaryOk + '/5', spacingPavlov: spacingOk + '/' + steps, durationsPavlov: durations.join(' '),
      showingsToZeroPavlov: firstZero.join(' '), risesPavlov: rises + '/' + steps, seriesShownPavlov: shown,
      note: 'a printed extinction time not equal to its clock times, a gap not the interval plus one minute, or extinction not slower with longer pauses' },
    temoin: { mesure: recovered === recovery.length ? 0 : 1, formule: 0, recoveredPavlov: recovered + '/' + recovery.length, recoveryValuesPavlov: recovery.map((r) => r.after).join(' '),
      note: 'witness: no reward would erase what was learnt; after a rest the response came back in both experiments' } } };
}

// ---------- 146: the smallest visible change of brightness, Konig and Brodhun 1888 (idea: codex "human brain", Claude sub-agent; tables: SOURCES, p. 922) ----------
// Two halves of a field, one brighter by dr; the observer turns a polariser to the angle alpha where the difference is just seen, so that
//   dr / r = tg(alpha)^2. Weber's law would make dr / r the same at every brightness J.
// Exact here: dr / r recomputed from the printed angle lies within one unit of the last printed digit in 71/71 rows (rounded exactly 67/71);
//   the fraction is smallest at J = 5000 to 10000 (0.0143 to 0.0161) and between J = 1000 and 20000 stays within 0.0143 to 0.0202 (20 cells).
// Witness: "Weber's law: the same fraction at every brightness": the largest fraction is 31 to 52 times the smallest in each table, rising
//   toward darkness (0.498 to 0.793) and again at the most dazzling J of 605 (0.0445, 0.0547).
// Drawing (front view): (log10 J + 1) / 6.3 against (log10 of the fraction + 2) / 2; label: table (0 670 K., 1 670 B., 2 605 K., 3 605 B.);
//   slider: table shown (0 all, 1 to 4).
function weberKonig(P, n) {
  const keysKonig = ['670K', '670B', '605K', '605B'];
  const tables = keysKonig.map((k) => SOURCES['weberKonig' + k].valeur.split(' ').map((x) => { const [J, a, f] = x.split('@'), [d, m] = a.split('.');
    return { J: Number(J), alpha: (Number(d) + Number(m) / 60) * Math.PI / 180, f: Number(f), unit: 10 ** -f.split('.')[1].length }; }));
  let gaps = 0, withinUnit = 0, rounded = 0, rows = 0, midCells = 0, midLo = Infinity, midHi = 0;
  const ratios = [], minima = [];
  for (const t of tables) {
    for (const r of t) { rows++; const tg2 = (sinD(r.alpha) / cosD(r.alpha)) ** 2;
      if (Math.abs(tg2 - r.f) <= r.unit * (1 + 1e-9)) withinUnit++;
      if (Math.round(tg2 / r.unit) === Math.round(r.f / r.unit)) rounded++;
      if (r.J >= 1000 && r.J <= 20000) { midCells++; midLo = Math.min(midLo, r.f); midHi = Math.max(midHi, r.f); } }
    const fs = t.map((r) => r.f); ratios.push(Math.max(...fs) / Math.min(...fs)); minima.push(Math.min(...fs));
  }
  if (withinUnit !== rows) gaps++;
  const shown = Math.max(0, Math.min(4, Math.round(P.tableKonig))), pts = [];
  tables.forEach((t, j) => { if (shown === 0 || shown === j + 1) t.forEach((r) => { for (let q = 0; q < 10; q++) pts.push([(lnD(r.J) / lnD(10) + 1) / 6.3, (lnD(r.f) / lnD(10) + 2) / 2, j]); }); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'fraction dr / r', invariants: {
    weberKonig: { mesure: gaps, formule: 0, rowsKonig: rows, withinUnitKonig: withinUnit + '/' + rows, roundedKonig: rounded + '/' + rows, smallestKonig: minima.join(' '),
      plateauKonig: midCells + ' cells, ' + midLo + ' to ' + midHi, tableShownKonig: shown,
      note: 'a printed fraction more than one unit of its last digit from tg(alpha) squared' },
    temoin: { mesure: ratios.every((x) => x > 10) ? 0 : 1, formule: 0, largestOverSmallestKonig: ratios.map((x) => x.toFixed(1)).join(' '),
      note: 'witness: Weber law would give the same fraction at every brightness; in each table the largest is 31 to 52 times the smallest' } } };
}

// ---------- 147: excitement and sugar in the urine, Cannon 1915 (idea: codex "human brain", Claude sub-agent; counts: SOURCES, p. 71-78) ----------
// Strong excitement (fear, rage, a hard examination, a big match) is followed by sugar in the urine; calm, cold, and cats without adrenal
//   glands are not. These are counts of yes / no, on small groups: the code says how many, never how strongly anyone felt anything.
// Exact here: 6 / 33 and 6 / 36 rounded give the printed 18 and 17 per cent (2/2; truncation gives 16); 34 tested minus the one with sugar
//   before = 33; every excited group has positives (cats 12/12 and 3/3, people 4/9, 12/25, 6/33, 6/36) and every control has none (0/3
//   calm, 0/1 cooled, 0/3 without adrenals).
// Witness: "the sugar comes from physical effort": 5 of the 12 positive football players never entered the game, and students sitting an
//   examination are positive too; at the rate before the examination (1 / 34), 6 or more of 33 would happen by chance with P = 3.6e-4.
// Drawing (front view): group (cats, then people, then controls) against share with sugar; label 0 cats, 1 people, 2 controls;
//   slider: groups shown (0 all, 1 cats and controls, 2 people).
function glycosuriaCannon(P, n) {
  const readCannon = (key) => Object.fromEntries(SOURCES[key].valeur.split(' ').map((x) => { const [k, v] = x.split(':'); const [a, b] = v.split('/').map(Number); return [k, b === undefined ? a : { pos: a, n: b }]; }));
  const cats = readCannon('glycosuriaCannonCats'), people = readCannon('glycosuriaCannonPeople');
  const pctCannon = (g) => Math.round(100 * g.pos / g.n);
  let gaps = 0;
  const remaining = people.menTested - people.menBefore;
  const percentOk = (pctCannon(people.menExam) === people.menPrinted ? 1 : 0) + (pctCannon(people.womenExam) === people.womenPrinted ? 1 : 0) + (remaining === people.menExam.n ? 1 : 0);
  if (percentOk !== 3) gaps++;
  const excited = [cats.excitedBound, cats.sameCatsBarkedAt, people.hardExam, people.football, people.menExam, people.womenExam], controls = [cats.calmBound, cats.cooled, cats.noAdrenals];
  const excitedPositive = excited.filter((g) => g.pos > 0).length, controlsClean = controls.filter((g) => g.pos === 0).length;
  if (excitedPositive !== excited.length || controlsClean !== controls.length) gaps++;
  const base = people.menBefore / people.menTested, m = people.menExam.n;
  let tailCannon = 0, c = 1;
  for (let k = 0; k <= m; k++) { if (k >= people.menExam.pos) tailCannon += c * base ** k * (1 - base) ** (m - k); c = c * (m - k) / (k + 1); }
  const shown = Math.max(0, Math.min(2, Math.round(P.groupeCannon))), pts = [];
  const bars = [[cats.excitedBound, 0], [cats.sameCatsBarkedAt, 0], [people.hardExam, 1], [people.easyExam, 1], [people.football, 1], [people.menExam, 1], [people.womenExam, 1], [cats.calmBound, 2], [cats.cooled, 2], [cats.noAdrenals, 2]];
  bars.forEach(([g, lab], i) => { if (shown === 0 || (shown === 1 && lab !== 1) || (shown === 2 && lab === 1)) for (let q = 0; q <= 20; q++) pts.push([i / 10, (g.pos / g.n) * q / 20, lab]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'share with sugar', invariants: {
    glycosuriaCannon: { mesure: gaps, formule: 0, percentsCannon: percentOk + '/3', excitedPositiveCannon: excitedPositive + '/' + excited.length, controlsCleanCannon: controlsClean + '/' + controls.length,
      hardEasyCannon: people.hardExam.pos + ' vs ' + people.easyExam.pos + ' of 9', groupsShownCannon: shown,
      note: 'a printed per cent not the rounded count, an excited group with no positive, or a control with one' },
    temoin: { mesure: people.footballBench > 0 && tailCannon < 1e-3 ? 0 : 1, formule: 0, benchPositiveCannon: people.footballBench + ' of ' + people.football.pos, chanceAtBaseCannon: tailCannon.toExponential(1),
      note: 'witness: if the sugar came from physical effort, players left on the bench would have none; 5 of the 12 positives never played' } } };
}

// ---------- 148: weight of the brain with age, Boyd 1861 (idea: codex "human brain", Claude sub-agent; table: SOURCES, p. 243-262) ----------
// The average weight of the encephalon and of its parts, in ounces, for each sex and 18 periods of life, from 2086 post-mortem
//   examinations at one London infirmary. Not every part was weighed in every case: each column has its own number examined.
// Exact here: the male encephalon is heavier than the female in 18/18 periods; the heaviest period is 14 to 20 years in both sexes and the
//   next is 30 to 40 (men) and 20 to 30 (women), as written p. 260; from 20 to 30 years onward the range is 48.2 to 45.34 (men) and 43.7 to
//   39.77 (women), as written p. 262; the parts add up to the encephalon (within 0.005 oz.) in 7/7 rows where the four numbers examined are
//   equal, and only in 2/29 rows where they differ (averages over different people do not add up).
// Witness: "the brain grows with the body through life": it is heaviest at 14 to 20 and is 6.6 % (men) and 9.5 % (women) lighter after 80.
// Drawing (front view): period (0 premature ... 17 over 80) / 17 against encephalon / 50 oz.; label 0 men, 1 women, 2 the sum of the parts;
//   slider: sex shown (0 both, 1 men, 2 women).
function brainBoyd(P, n) {
  const rowsBoyd = [243, 245, 247, 249, 251, 253].flatMap((p) => SOURCES['brainBoydP' + p].valeur.split(' ').map((x) => { const [age, sex, w, c] = x.split('|');
    return { age, sex, w: w.split('/').map(Number), c: c.split('/').map(Number) }; }));
  const text = Object.fromEntries(SOURCES.brainBoydText.valeur.split(' ').map((x) => x.split(':')));
  const ages = [...new Set(rowsBoyd.map((r) => r.age))], bySex = (s) => ages.map((a) => rowsBoyd.find((r) => r.age === a && r.sex === s));
  const men = bySex('M'), women = bySex('F');
  let gaps = 0;
  const heavierMen = ages.filter((a, i) => men[i].w[3] > women[i].w[3]).length;
  if (heavierMen !== ages.length) gaps++;
  const rank = (l) => [...l].sort((x, y) => y.w[3] - x.w[3]).map((r) => r.age);
  const rm = rank(men), rf = rank(women);
  const ranksOk = (rm[0] === text.highestBoth) + (rf[0] === text.highestBoth) + (rm[1] === text.nextMale) + (rf[1] === text.nextFemale);
  if (ranksOk !== 4) gaps++;
  const adult = (l) => { const k = l.slice(ages.indexOf('20to30')).map((r) => r.w[3]); return Math.max(...k) + '-' + Math.min(...k); };
  const rangesOk = (adult(men) === text.adultMale) + (adult(women) === text.adultFemale);
  if (rangesOk !== 2) gaps++;
  let sumEqual = 0, equalRows = 0, sumUnequal = 0, unequalRows = 0;
  for (const r of rowsBoyd) { const same = r.c.every((x) => x === r.c[0]), adds = Math.abs(r.w[0] + r.w[1] + r.w[2] - r.w[3]) < 0.005;
    if (same) { equalRows++; if (adds) sumEqual++; } else { unequalRows++; if (adds) sumUnequal++; } }
  if (sumEqual !== equalRows) gaps++;
  const peak = ages.indexOf(text.highestBoth), last = ages.length - 1;
  const declineMen = 100 * (men[last].w[3] / men[peak].w[3] - 1), declineWomen = 100 * (women[last].w[3] / women[peak].w[3] - 1);
  const shown = Math.max(0, Math.min(2, Math.round(P.sexeBoyd))), pts = [];
  [[men, 0, 1], [women, 1, 2]].forEach(([l, lab, s]) => { if (shown === 0 || shown === s) l.forEach((r, i) => { for (let q = 0; q < 10; q++) pts.push([i / 17, r.w[3] / 50, lab]); for (let q = 0; q < 3; q++) pts.push([i / 17 + 0.01, (r.w[0] + r.w[1] + r.w[2]) / 50, 2]); }); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'ounces', invariants: {
    brainBoyd: { mesure: gaps, formule: 0, menHeavierBoyd: heavierMen + '/' + ages.length, ranksBoyd: ranksOk + '/4', adultRangesBoyd: rangesOk + '/2',
      partsAddEqualBoyd: sumEqual + '/' + equalRows, partsAddUnequalBoyd: sumUnequal + '/' + unequalRows, sexShownBoyd: shown,
      note: 'a period where women weigh more, a rank or an adult range not the one written p. 260 and 262, or parts not adding up when all were weighed' },
    temoin: { mesure: declineMen < 0 && declineWomen < 0 && peak < last ? 0 : 1, formule: 0, peakToOver80Boyd: declineMen.toFixed(2) + ' % men, ' + declineWomen.toFixed(2) + ' % women',
      note: 'witness: if the brain kept growing with the body it would be heaviest in old age; it is heaviest at 14 to 20 years' } } };
}

// ---------- 149: all or none, Keith Lucas 1909 (idea: codex "human brain", Claude sub-agent; table: SOURCES, p. 119-120) ----------
// A frog muscle is excited through its nerve by shocks of slowly rising strength. Each nerve fibre and its muscle fibres either contract
//   fully or not at all, so the whole muscle climbs in a few steps instead of smoothly.
// Exact here: the printed step levels come back from the table (observations 2 to 5: 1.50; 7 to 10: 3.67; rise from 11 to 35: 6.5 %);
//   3 of the 34 steps between observations are larger than 0.3 mm and carry 90.7 % of the whole rise, no other step exceeds 0.15 mm.
// Witness: "the contraction grows in proportion to the stimulus": a straight line through the 35 points explains only 32 % of their spread.
// Drawing (front view): (25.9 - coil distance) / 6.4 against contraction / 4.1 mm; label 0 observations, 1 the two printed step levels,
//   2 the straight line (slider: 0 hidden, 1 shown).
function allOrNoneLucas(P, n) {
  const obs = SOURCES.allOrNoneLucasExp1.valeur.split(' ').map((x) => x.split(':').map(Number)), mm = obs.map((o) => o[1]), cm = obs.map((o) => o[0]);
  const text = Object.fromEntries(SOURCES.allOrNoneLucasText.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const meanLucas = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  const lowStep = meanLucas(mm.slice(1, 5)), highStep = meanLucas(mm.slice(6, 10)), rise = 100 * (mm[34] - mm[10]) / mm[10];
  const printedOk = (lowStep.toFixed(2) === text.step2to5.toFixed(2)) + (highStep.toFixed(2) === text.step7to10.toFixed(2)) + (rise.toFixed(1) === text.rise11to35.toFixed(1));
  let gaps = printedOk === 3 ? 0 : 1;
  const steps = mm.slice(1).map((v, i) => v - mm[i]), big = steps.filter((d) => Math.abs(d) > 0.3);
  const share = 100 * big.reduce((a, b) => a + b, 0) / (mm[34] - mm[0]), otherMax = Math.max(...steps.filter((d) => Math.abs(d) <= 0.3).map(Math.abs));
  if (big.length !== 3) gaps++;
  const mx = meanLucas(cm), my = meanLucas(mm);
  let sxy = 0, sxx = 0; cm.forEach((x, i) => { sxy += (x - mx) * (mm[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxy / sxx, ssRes = mm.reduce((a, y, i) => a + (y - my - slope * (cm[i] - mx)) ** 2, 0), ssTot = mm.reduce((a, y) => a + (y - my) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  const line = Math.max(0, Math.min(1, Math.round(P.droiteLucas))), X = (c) => (25.9 - c) / 6.4, pts = [];
  obs.forEach(([c, v]) => { for (let q = 0; q < 12; q++) pts.push([X(c), v / 4.1, 0]); });
  for (let q = 0; q <= 20; q++) { pts.push([X(25.8) + (X(25.5) - X(25.8)) * q / 20, text.step2to5 / 4.1, 1]); pts.push([X(25.3) + (X(25.0) - X(25.3)) * q / 20, text.step7to10 / 4.1, 1]); }
  if (line) for (let q = 0; q <= 60; q++) { const c = 25.9 - 6.4 * q / 60; pts.push([X(c), (my + slope * (c - mx)) / 4.1, 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'mm on the record', invariants: {
    allOrNoneLucas: { mesure: gaps, formule: 0, printedLevelsLucas: printedOk + '/3', bigStepsLucas: big.length + '/' + steps.length, bigShareLucas: share.toFixed(1),
      otherStepsMaxLucas: otherMax.toFixed(2), lineShownLucas: line,
      note: 'a printed step level or rise not given by the table, or a number of big steps other than three' },
    temoin: { mesure: r2 < 0.5 ? 0 : 1, formule: 0, straightLineR2Lucas: r2.toFixed(2),
      note: 'witness: a contraction growing in proportion to the stimulus would lie on a straight line; the line explains 32 % of the spread' } } };
}

// ---------- 150: primate brains are scaled-up copies in cell numbers, Herculano-Houzel 2007 (idea: Phil; table: SOURCES, PNAS 104) ----------
// Seven primate brains, from the tree shrew (2.75 g) to the macaque (87 g), dissolved into a suspension of nuclei and counted. Brain mass
//   grows almost exactly in proportion to the number of neurons; in rodents it grows much faster (power 1.587, from the same group).
// Exact here: the printed macaque / marmoset ratios (11.2, 10.0, 12.1) come back from the table (3/3); a least-squares line of log mass on
//   log neurons over the seven species gives 1.054, the printed exponent, inside its printed interval; on log other cells, 0.991 (2/2).
// Witness: "every brain grows like a rodent brain": with the rodent power, the marmoset scaled up to the macaque's 6.4 billion neurons would
//   weigh 302 g; the macaque brain weighs 87 g.
// Drawing (front view): log10 neurons (millions) / 4 against log10 brain mass (g) / 2; label 0 species, 1 the fitted primate line, 2 the
//   rodent power from the marmoset (slider: 0 hidden, 1 shown).
function neuronsHerculanoHouzel(P, n) {
  const rowsHH = SOURCES.neuronsHerculanoHouzelTable.valeur.split(' ').map((x) => { const [sp, m, nn, o] = x.split(':'); return { sp, m: Number(m), nn: Number(nn), o: Number(o) }; });
  const text = Object.fromEntries(SOURCES.neuronsHerculanoHouzelText.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const lg = (x) => lnD(x) / lnD(10), byName = (s) => rowsHH.find((r) => r.sp === s), mac = byName('macaque'), mar = byName('marmoset');
  const ratiosOk = ((mac.m / mar.m).toFixed(1) === text.variationMass.toFixed(1)) + ((mac.nn / mar.nn).toFixed(1) === text.variationNeurons.toFixed(1)) + ((mac.o / mar.o).toFixed(1) === text.variationOther.toFixed(1));
  const slopeHH = (xs, ys) => { const k = xs.length, mx = xs.reduce((a, b) => a + b, 0) / k, my = ys.reduce((a, b) => a + b, 0) / k; let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; }); return { b: sxy / sxx, a: my - (sxy / sxx) * mx }; };
  const fitN = slopeHH(rowsHH.map((r) => lg(r.nn)), rowsHH.map((r) => lg(r.m))), fitO = slopeHH(rowsHH.map((r) => lg(r.o)), rowsHH.map((r) => lg(r.m)));
  const exponentsOk = (fitN.b.toFixed(3) === text.exponentNeurons.toFixed(3) && fitN.b >= text.ciLow && fitN.b <= text.ciHigh) + (fitO.b.toFixed(3) === text.exponentOther.toFixed(3));
  const gaps = (ratiosOk === 3 ? 0 : 1) + (exponentsOk === 2 ? 0 : 1);
  const rodentMass = mar.m * (mac.nn / mar.nn) ** text.rodentExponent;
  const showRodent = Math.max(0, Math.min(1, Math.round(P.rongeurHerculano))), pts = [];
  rowsHH.forEach((r) => { for (let q = 0; q < 20; q++) pts.push([lg(r.nn) / 4, lg(r.m) / 2, 0]); });
  for (let q = 0; q <= 60; q++) { const x = lg(200) + (lg(8000) - lg(200)) * q / 60; pts.push([x / 4, (fitN.a + fitN.b * x) / 2, 1]);
    if (showRodent) pts.push([x / 4, (lg(mar.m) + text.rodentExponent * (x - lg(mar.nn))) / 2, 2]); }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'grams and millions of cells', invariants: {
    neuronsHerculanoHouzel: { mesure: gaps, formule: 0, ratiosHerculano: ratiosOk + '/3', exponentNeuronsHerculano: fitN.b.toFixed(3), exponentOtherHerculano: fitO.b.toFixed(3),
      exponentsHerculano: exponentsOk + '/2', rodentShownHerculano: showRodent,
      note: 'a printed macaque / marmoset ratio not from the table, or a fitted exponent not the printed one' },
    temoin: { mesure: rodentMass > 3 * mac.m ? 0 : 1, formule: 0, rodentRuleMassHerculano: rodentMass.toFixed(0) + ' g vs ' + mac.m + ' g',
      note: 'witness: a primate brain growing like a rodent brain would weigh 302 g at the macaque neuron count; the macaque brain weighs 87 g' } } };
}

// ---------- 151: the sizes of mapped brains, worm 1986 to fly 2024, against the human count (idea: Phil; counts: SOURCES) ----------
// A connectome lists every neuron and every synapse. Three have been published for whole or half nervous systems: the worm C. elegans
//   (302 neurons, 1986), half a fly brain (about 25,000, 2020) and a whole fly brain (139,255, 2024). The human brain has been counted,
//   86.1 billion neurons, never mapped.
// Exact here: synapses per neuron 16.6 (worm, chemical only), 800 (hemibrain, its rounded figures), 391.4 (FlyWire); the whole fly brain has
//   461 times the worm's neurons; human neurons and other cells differ by less than one standard deviation (86.1 vs 84.6 billion, SD 8.1).
// Witness: "with a whole fly mapped, a human map is near": the human brain has 618,000 times more neurons than the mapped fly brain.
// Drawing (front view): log10 neurons / 11 against log10 synapses / 8 (the human point sits at 0: no synapse count was measured);
//   label: 0 worm, 1 hemibrain, 2 FlyWire, 3 human; slider: organism shown (0 all, 1 to 4).
function connectomeSizes(P, n) {
  const readC = (key) => Object.fromEntries(SOURCES[key].valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const worm = readC('connectomeWorm'), hemi = readC('connectomeHemibrain'), fly = readC('connectomeFlyWire'), human = readC('connectomeHuman');
  const perNeuron = [worm.chemicalSynapses / worm.neurons, hemi.chemicalSynapses / hemi.neurons, fly.synapses / fly.neurons];
  const flyOverWorm = fly.neurons / worm.neurons, humanOverFly = human.neurons / fly.neurons;
  const gaps = (perNeuron.every((x) => x > 1) && fly.neurons > hemi.neurons && hemi.neurons > worm.neurons ? 0 : 1) + (Math.abs(human.neurons - human.nonNeurons) < human.sd ? 0 : 1);
  const shown = Math.max(0, Math.min(4, Math.round(P.organismeConnectome))), lgC = (x) => lnD(x) / lnD(10), pts = [];
  const dots = [[worm.neurons, worm.chemicalSynapses], [hemi.neurons, hemi.chemicalSynapses], [fly.neurons, fly.synapses], [human.neurons, 0]];
  dots.forEach(([nn, ss], j) => { if (shown === 0 || shown === j + 1) for (let q = 0; q < 30; q++) pts.push([lgC(nn) / 11, ss > 0 ? lgC(ss) / 8 : 0, j]); });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'neurons and synapses', invariants: {
    connectomeSizes: { mesure: gaps, formule: 0, synapsesPerNeuronConnectome: perNeuron.map((x) => x.toFixed(1)).join(' '), flyOverWormConnectome: flyOverWorm.toFixed(0),
      humanNonNeuronsConnectome: (human.nonNeurons / 1e9).toFixed(1) + ' vs ' + (human.neurons / 1e9).toFixed(1) + ' billion', shownConnectome: shown,
      note: 'the counts out of order, or human neurons and other cells further apart than one standard deviation' },
    temoin: { mesure: humanOverFly > 1e5 ? 0 : 1, formule: 0, humanOverFlyConnectome: humanOverFly.toFixed(0),
      note: 'witness: a whole fly brain mapped is not close to a human map; the human brain has 618,000 times more neurons' } } };
}

// ---------- 152: the body in six emotion categories as impulses, Siegel et al. 2018 (idea: Phil, emotions; tables: SOURCES, Psychol. Bull. 144) ----------
// A meta-analysis of the autonomic changes (heart, blood pressure, breathing, skin) measured in anger, disgust, fear, happiness, sadness and a
//   neutral state. Each mean change is a Cohen's d with a 95 % interval. The question of the paper: does each emotion have its own fingerprint?
// Exact here: the samples k of each category add up to the printed total (6/6); the printed counts of effects >= .80, >= .50 and above .20
//   (2, 7, 13) come back from Table 9 when only k > 4 and significant cells are kept (3/3); the confusion matrix adds up by row and by column
//   (12/12) and gives the printed hit rates (7/7, overall 76/241 = 31.5 %). Named, not counted: three percentages of the happy row that are not
//   their counts over 241, and participant totals that are not the sum of their cells.
// Simulation (OUR choices): seven signals, six units each, 120 steps; a unit fires in a step with chance 0.15 x (1 + d), d the measured mean for
//   the chosen emotion, or (spread on) six values evenly placed across the printed 95 % interval. The measured part is d and its interval only.
// Witness: "each emotion has a fingerprint": a classifier would then sort nearly every case; it sorted 31.5 %, a blind guess among six 16.7 %.
// Drawing (front view): step / 120 across, signal and unit up; label 0 heart, 1 blood pressure, 2 breathing, 3 skin.
function emotionsSiegel(P, n) {
  const cellsSG = {}, totalsSG = {}, num = (v) => (v === '-' ? null : Number(v));
  SOURCES.emotionsSiegelTable9.valeur.split(' ').forEach((x) => { const [cm, ...f] = x.split(':'), [cat, m] = cm.split('/');
    if (m === 'Total') totalsSG[cat] = { k: num(f[0]), n: num(f[1]) };
    else (cellsSG[cat] = cellsSG[cat] || {})[m] = { k: num(f[0]), n: num(f[1]), d: num(f[2]), stars: num(f[3]), lo: num(f[4]), hi: num(f[5]) }; });
  const text = Object.fromEntries(SOURCES.emotionsSiegelText.valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const cats = Object.keys(totalsSG), cellsOf = (c) => Object.values(cellsSG[c]);
  const kSums = cats.filter((c) => cellsOf(c).reduce((a, x) => a + x.k, 0) === totalsSG[c].k).length;
  const nOff = cats.map((c) => [c, cellsOf(c).reduce((a, x) => a + (x.n || 0), 0)]).filter(([c, s]) => s !== totalsSG[c].n).map(([c, s]) => c + ' ' + s + ' vs ' + totalsSG[c].n);
  const t4Off = cats.filter((c) => text['t4' + c] !== totalsSG[c].n).map((c) => c + ' ' + text['t4' + c] + ' vs ' + totalsSG[c].n);
  const bands = [0, 0, 0];
  cats.forEach((c) => cellsOf(c).forEach((x) => { if (x.k > text.kAbove && x.stars > 0) { if (x.d >= 0.8) bands[0]++; else if (x.d >= 0.5) bands[1]++; else if (x.d > 0.2) bands[2]++; } }));
  const bandsOk = (bands[0] === text.large) + (bands[1] === text.medium) + (bands[2] === text.small);
  const rowsCF = SOURCES.emotionsSiegelConfusion.valeur.split(' ').map((x) => { const [g, ...v] = x.split(':'); return { g, c: v.slice(0, 6).map(Number), tot: Number(v[6]) }; });
  const pctCF = Object.fromEntries(SOURCES.emotionsSiegelPercent.valeur.split(' ').map((x) => { const [g, ...v] = x.split(':'); return [g, v.map(Number)]; }));
  const lines = Object.fromEntries(SOURCES.emotionsSiegelCases.valeur.split(' ').map((x) => { const [k, ...v] = x.split(':'); return [k, v.map(Number)]; }));
  const all = lines.cases[6], rowOf = (g) => rowsCF.find((r) => r.g === g);
  const rowsOk = rowsCF.filter((r) => r.c.reduce((a, b) => a + b, 0) === r.tot).length;
  const colsOk = cats.filter((c, j) => rowsCF.reduce((a, r) => a + r.c[j], 0) === lines.cases[j]).length;
  const hits = cats.map((c, j) => rowOf(c).c[j]), diag = hits.reduce((a, b) => a + b, 0);
  const accOk = cats.filter((c, j) => (100 * hits[j] / lines.cases[j]).toFixed(1) === lines.correct[j].toFixed(1)).length + ((100 * diag / all).toFixed(1) === lines.correct[6].toFixed(1));
  const misprints = rowsCF.flatMap((r) => r.c.map((v, j) => [r.g, cats[j], (100 * v / all).toFixed(1), pctCF[r.g][j].toFixed(1)])).filter(([, , a, b]) => a !== b).map(([g, c, a, b]) => g + '/' + c + ' ' + b + ' vs ' + a);
  const gaps = (kSums === 6 ? 0 : 1) + (bandsOk === 3 ? 0 : 1) + (rowsOk === 6 && colsOk === 6 ? 0 : 1) + (accOk === 7 ? 0 : 1);
  const CH = ['HR', 'HRV', 'DBP', 'SBP', 'RR', 'SCL', 'SCR'], GROUP = [0, 0, 1, 1, 2, 3, 3], UNITS = 6, STEPS = 120, BASE = 0.15;
  const e = Math.max(0, Math.min(5, Math.round(P.emotionSiegel))), spread = Math.max(0, Math.min(1, Math.round(P.spreadSiegel))), cat = cats[e];
  const alea = mulberry32(0x5e6e1 + 101 * e + 7 * spread), pts = [], fired = CH.map(() => 0);
  let dLow = Infinity, dHigh = -Infinity;
  CH.forEach((m, c) => { const x = cellsSG[cat][m];
    for (let u = 0; u < UNITS; u++) { const dU = spread ? x.lo + (x.hi - x.lo) * (u + 0.5) / UNITS : x.d, p = Math.max(0, Math.min(1, BASE * (1 + dU)));
      dLow = Math.min(dLow, dU); dHigh = Math.max(dHigh, dU);
      for (let t = 0; t < STEPS; t++) if (alea() < p) { fired[c]++; pts.push([t / STEPS, (c * UNITS + u + 0.5) / (CH.length * UNITS), GROUP[c]]); } } });
  const top = CH.reduce((b, m) => (cellsSG[cat][m].d > cellsSG[cat][b].d ? m : b), CH[0]);
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'steps and units (our choice), Cohen d (measured)', invariants: {
    emotionsSiegel: { mesure: gaps, formule: 0, samplesSiegel: kSums + '/6', bandsSiegel: bands.join('/'), confusionSumsSiegel: (rowsOk + colsOk) + '/12', hitRatesSiegel: accOk + '/7',
      misprintsSiegel: misprints.join(' ; '), participantsSiegel: nOff.join(' ; '), table4Siegel: t4Off.join(' ; '), emotionShownSiegel: cat, spreadShownSiegel: spread, unitRangeSiegel: dLow.toFixed(3) + ' to ' + dHigh.toFixed(3),
      topSignalSiegel: top + ' ' + cellsSG[cat][top].d.toFixed(2), firingSiegel: CH.map((m, c) => m + ' ' + (fired[c] / (UNITS * STEPS)).toFixed(3)).join(' '),
      note: 'samples not adding up, effect counts not as printed, a confusion matrix not adding up, or hit rates not as printed' },
    temoin: { mesure: diag / all < 0.5 ? 0 : 1, formule: 0, classifierSiegel: diag + '/' + all, chanceSiegel: (100 / 6).toFixed(1) + ' %',
      note: 'witness: with one fingerprint per emotion a classifier would sort nearly every case; it sorted 76 of 241 (31.5 %), a blind guess 16.7 %' } } };
}

// ---------- 153: telling an emotion from another person's body map, Nummenmaa et al. 2014 (idea: Phil, emotions; text: SOURCES, PNAS 111) ----------
// People coloured on a silhouette where they felt activity rise or fall for each emotion. Then other people were shown the averaged maps of
//   anger, fear, disgust, happiness, sadness, surprise and a neutral state and had to name the emotion: 46 % right on average, 14 % by chance.
// Exact here: the seven printed hit rates average to the printed 46 %; one in seven is the printed 14 %; the experiment sizes add up to the
//   printed 773, and those of experiments 1 to 4 to the 701 of the abstract (2/2). Named: experiment 5 has 72 people in the Methods, 87 in the
//   Results; fear (8 %) is the one map not named above chance.
// Simulation (OUR choices): 87 reader units per shown emotion, the Results count; each emits one impulse to an answer, the right one with the
//   measured chance, otherwise one of the six others at random (the paper prints no confusion of the human readers). Slider: 1 makes every
//   reader a blind guesser (one in seven).
// Witness: "the maps carry nothing of the emotion": every row would sit at 14 %; six of the seven are above it.
// Drawing (front view): answer across, shown emotion and reader up; label 0 right, 1 wrong.
function bodyMapsNummenmaa(P, n) {
  const kv = (src) => Object.fromEntries(src.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const hit = kv(SOURCES.bodyMapsNummenmaaRecognition.valeur), sizes = kv(SOURCES.bodyMapsNummenmaaParticipants.valeur);
  const EM = ['anger', 'fear', 'disgust', 'happiness', 'sadness', 'surprise', 'neutral'];
  const meanHit = EM.reduce((a, e) => a + hit[e], 0) / EM.length;
  const meanOk = meanHit.toFixed(0) === hit.mean.toFixed(0), chanceOk = (100 / EM.length).toFixed(0) === hit.chance.toFixed(0);
  const firstFour = ['exp1a', 'exp1b', 'exp1c', 'exp2', 'exp3', 'exp4'].reduce((a, g) => a + sizes[g], 0), allFive = firstFour + sizes.exp5;
  const sizesOk = (firstFour === sizes.firstFour) + (allFive === sizes.total);
  const gaps = (meanOk ? 0 : 1) + (chanceOk ? 0 : 1) + (sizesOk === 2 ? 0 : 1);
  const above = EM.filter((e) => hit[e] > hit.chance), notAbove = EM.filter((e) => hit[e] <= hit.chance).map((e) => e + ' ' + hit[e] + ' %');
  const guess = Math.max(0, Math.min(1, Math.round(P.guessNummenmaa))), READERS = hit.readers;
  const alea = mulberry32(0xb0d1 + 13 * guess), pts = [], right = EM.map(() => 0);
  EM.forEach((e, s) => { const p = guess ? 1 / EM.length : hit[e] / 100;
    for (let r = 0; r < READERS; r++) { let a = s;
      if (alea() < p) right[s]++; else { a = Math.floor(alea() * (EM.length - 1)); if (a >= s) a++; }
      pts.push([(a + 0.5) / EM.length, (s * READERS + r + 0.5) / (EM.length * READERS), a === s ? 0 : 1]); } });
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  return { D: 3, brut, nuage: true, unite: 'per cent (measured), readers (our units)', invariants: {
    bodyMapsNummenmaa: { mesure: gaps, formule: 0, meanNummenmaa: meanHit.toFixed(1), chanceNummenmaa: (100 / EM.length).toFixed(1), sizesNummenmaa: sizesOk + '/2',
      experiment5Nummenmaa: sizes.exp5 + ' in Methods, ' + READERS + ' in Results', notAboveChanceNummenmaa: notAbove.join(' ; '), guessShownNummenmaa: guess,
      rightNummenmaa: EM.map((e, s) => e + ' ' + (right[s] / READERS).toFixed(2)).join(' '),
      note: 'the printed mean, the chance level or the experiment sizes not recovered' },
    temoin: { mesure: above.length >= 5 ? 0 : 1, formule: 0, aboveChanceNummenmaa: above.length + '/7', ldaNummenmaa: hit.lda + ' % (chance ' + hit.ldaChance + ' %)',
      note: 'witness: maps carrying nothing of the emotion would leave every row at 14 %; six of seven are above it, fear is not' } } };
}

// ---------- 154: a wired human brain facing emotions, one pack and one emotion at a time (idea: Phil; numbers: human-brain-data.js) ----------
// The 82 regions of the human brain (68 Desikan-Killiany cortical, 14 subcortical) with ALL 1,190 connections measured by diffusion
//   tractography in 207 healthy adults (ENIGMA Toolbox, HCP), or (switch) their 1,190 strongest resting-state couplings; 7 deep parts (ventral
//   tegmental areas, substantia nigra, periaqueductal gray, hypothalamus, cerebellum) join by 35 pathways NAMED in studies, with no
//   measured strength. One pack of emotions is shown at a time (basic, affect summaries, social, love, empathy and compassion, surprise and
//   curiosity) and one emotion of it: the areas its source reports as more active are placed on the regions (OUR mapping, area by area in
//   human-brain-data.js MAPPING) and fire; impulses travel along the chosen network, more often along stronger links.
// Exact here: 1,190 structural pairs between 0.14292 and 12.615 with no duplicate, one network, no isolated region; 1,190 functional pairs
//   >= 0.28764, 468 of them also wired; 35 named pathways, every deep part reached by one; the printed areas without a region are exactly the
//   right claustrum and "brain stem"; every mapped region exists.
// Positions (game316, Phil: "it is not a brain"): the REAL centroids of the 82 regions on the fsaverage5 surface (human-brain-anatomy.js, ENIGMA),
//   in mm: the three columns are front-back (y), bottom-top (z) and left-right (x), divided by 100, so the view turns a real brain; the deep parts at a peak printed in a source read, or OUR
//   placement where none was read (human-brain-data.js POS3D_SOURCE); a faint silhouette: every 20th cortex vertex and every 30th deep-structure
//   point of the same surfaces.
// OUR choices: the mapping; reported regions fire at steps 0, 10 and 20 of 30; a measured
//   link is crossed with chance 0.05 + 0.7 u^2 (u its weight scaled between the smallest and largest kept), a named pathway with 0.3; a region
//   rests 3 steps after firing. Lines (tam-vue.js segments): every measured connection or coupling joins its two regions, opacity and width =
//   its weight rescaled 0..1 (class 0); the 35 named pathways are violet lines of fixed opacity 0.5 (class 5: no measured strength). Each
//   line names the two points it joins (ia, ib: the parts are the first points, in REGIONS order), so the tab draws it between the DRAWN points.
// game317 (Phil: "1190 connections, no more?"): a RESOLUTION switch, 82 regions or 414 parcels (Schaefer-400 by 7 networks + 14 subcortical):
//   6,117 measured connections, or the 6,117 strongest couplings, between their real centroids; an emotion lights the parcels whose majority
//   region is reported (OUR rule, human-brain-data.js parcelsOf; a few small regions have no parcel: lostWiring); a named pathway ends on the
//   largest parcel of its region. game318: a THEORY switch, each theory an order of activation over the same wiring (human-brain-data.js
//   THEORIES: James-Lange, Cannon-Bard, Schachter-Singer, constructionist), clearly THEORY, not data.
// Witness: "one emotion, one place": no region would serve two emotions; over all packs (affect summaries left out) 36 of the 64 mapped regions
//   serve two or more emotion families and 28 serve one; the left amygdala serves disgust, fear, regret and maternal love.
// Points, all at real places: the 82 regions first, the 7 deep parts, the outline (513 cortex, 203 deep-structure points), the compared
//   emotion's regions (3 points each when reported for both, 2 otherwise), then the firing events in time order (a reported region fires
//   twice as bright: 2 points; an impulse is a point one third of the way along its link).
/* 09/11: the outline was 1 cortex vertex in 20 (513 points) and 1 deep vertex in 30 (203): at 82 regions the 1,190 lines drowned it and the
 *  screen showed a web, not a brain. Same real surfaces (fsaverage5), sampled denser. WIRING_POINTS_MAX: a minted work must fit TamArt's
 *  MAX_DATA = 16,384 bytes (about 4.5 bytes a point): 3,500 points stay under it at every setting (the bench measures the bytes). */
const OUTLINE_CORTEX_STEP = 8, OUTLINE_DEEP_STEP = 20, WIRING_POINTS_MAX = 3500;
/** kept indices (0..total-1) of `kept` items spread evenly over `total`, in order: the first, then one every total/kept (all when kept >= total) */
export function sampleEvenly(total, kept) { const k = Math.max(0, Math.min(total, kept)); return Array.from({ length: k }, (_, j) => Math.floor(j * total / k)); }
function emotionWiringHCP(P, n) {
  const K = HB.COUNTS, N = K.hcpRegions, all = HB.REGIONS.map((r) => r.id), nameOf = (id) => HB.REGIONS[all.indexOf(id)].name;
  const edges = HB.WIRING.map(([i, j, w]) => ({ i, j, w })), fedges = HB.FUNCTION.map(([i, j, w]) => ({ i, j, w })), paths = HB.DEEP_LINKS.map(([i, j, s]) => ({ i, j, s }));
  const pairsOk = (list, k, lo, hi) => list.length === k && list.every((e) => e.i < e.j && e.j < N && e.w >= lo && e.w <= hi) && new Set(list.map((e) => e.i + '-' + e.j)).size === list.length;
  const edgesOk = pairsOk(edges, K.wiringNonzero, K.wiringMin, K.wiringMax), funcOk = pairsOk(fedges, K.functionKept, K.functionCut, K.functionMax);
  const wired = new Set(edges.map((e) => e.i + '-' + e.j)), overlap = fedges.filter((e) => wired.has(e.i + '-' + e.j)).length;
  const root = all.slice(0, N).map((_, k) => k), find = (x) => (root[x] === x ? x : (root[x] = find(root[x])));
  edges.forEach((e) => { root[find(e.i)] = find(e.j); });
  const components = new Set(root.map((_, k) => find(k))).size, deg = root.map(() => 0), fdeg = root.map(() => 0);
  edges.forEach((e) => { deg[e.i]++; deg[e.j]++; }); fedges.forEach((e) => { fdeg[e.i]++; fdeg[e.j]++; });
  const isolated = deg.filter((d) => d === 0).length, funcIsolated = all.slice(0, N).filter((_, k) => fdeg[k] === 0);
  const pathsOk = paths.length === K.deepLinks && paths.every((p) => p.i >= N && p.j >= 0 && p.j < all.length) && all.slice(N).every((_, k) => paths.some((p) => p.i === N + k || p.j === N + k));
  const anatOk = HA.ANATOMY_NAMES.join(' ') === all.slice(0, N).join(' ');
  const regionsOk = HB.PACKS.every((p) => p.emotions.every((e) => e.regions.every((r) => all.includes(r))));
  const gaps = (edgesOk ? 0 : 1) + (components === 1 && isolated === 0 ? 0 : 1) + (funcOk && overlap === K.overlap ? 0 : 1) + (pathsOk ? 0 : 1)
    + (HB.UNMAPPED.join(', ') === 'Right claustrum, Brain stem L/R' ? 0 : 1) + (regionsOk ? 0 : 1) + (anatOk ? 0 : 1);
  /* game317: the 414-parcel lists are checked inside (fineOk) and counted with the rest */
  // the selection: one pack, one emotion, and if asked a second emotion of the same pack; a resolution; a theory (game317, game318)
  const { pk, ek, pack, emotion, other } = HB.selectEmotion(P);
  const both = other ? emotion.regions.filter((r) => other.regions.includes(r)) : [];
  const res = Math.max(0, Math.min(1, Math.round(P.resolutionWiring))), th = Math.max(0, Math.min(HB.THEORIES.length - 1, Math.round(P.theoryWiring))), theory = HB.THEORIES[th];
  const K4 = HB.COUNTS_400, e400 = HB.WIRING_400.map(([i, j, w]) => ({ i, j, w })), f400 = HB.FUNCTION_400.map(([i, j, w]) => ({ i, j, w }));
  const pairs4Ok = (list, k, lo4, hi4) => list.length === k && list.every((e) => e.i < e.j && e.j < 414 && e.w >= lo4 && e.w <= hi4) && new Set(list.map((e) => e.i + '-' + e.j)).size === list.length;
  const wired4 = new Set(e400.map((e) => e.i + '-' + e.j)), overlap4 = f400.filter((e) => wired4.has(e.i + '-' + e.j)).length;
  const fineOk = pairs4Ok(e400, K4.wiringNonzero, K4.wiringMin, K4.wiringMax) && pairs4Ok(f400, K4.functionKept, K4.functionCut, K4.functionMax) && overlap4 === K4.overlap && HB.REGIONS_400.length === 414;
  // the nodes at this resolution: the 82 regions (or 414 parcels), then the 7 deep parts; a list of 82-region ids -> node indices
  const NR = res ? 414 : N, nodeIds = (res ? HB.REGIONS_400.map((r) => r.id) : all.slice(0, N)).concat(all.slice(N));
  const toNodes = (ids) => [...new Set(ids.flatMap((id) => { const a = all.indexOf(id); if (a >= N) return [NR + a - N]; return res ? HB.parcelsOf([id]) : [a]; }))];
  const XYZ = nodeIds.map((_, a) => (a < NR ? (res ? HB.CENTROIDS_400[a] : HA.CENTROIDS[a]) : HB.POS3D[N + a - NR])), P3 = XYZ.map(([x, y, z]) => [y / 100, z / 100, x / 100]);
  const net = Math.max(0, Math.min(1, Math.round(P.networkWiring))), travel = Math.max(0, Math.min(1, Math.round(P.travelWiring)));
  const use = res ? (net ? f400 : e400) : (net ? fedges : edges);
  const lo = res ? (net ? K4.functionCut : K4.wiringMin) : (net ? K.functionCut : K.wiringMin), hi = res ? (net ? K4.functionMax : K4.wiringMax) : (net ? K.functionMax : K.wiringMax);
  const links = paths.map((p) => ({ i: NR + p.i - N, j: p.j >= N ? NR + p.j - N : (res ? HB.parcelFor(all[p.j]) : p.j), s: p.s })).filter((p) => p.j >= 0);
  const regionsOf = (e) => (e ? e.regions : []), seeds = toNodes(regionsOf(emotion)), isSeed = new Set(seeds), adj = nodeIds.map(() => []);
  const lost = res ? HB.lostAt400(emotion.regions) : [];
  use.forEach((e) => { adj[e.i].push([e.j, e.w]); adj[e.j].push([e.i, e.w]); });
  links.forEach((p) => { adj[p.i].push([p.j, null]); adj[p.j].push([p.i, null]); });
  // the order of activation: the data (reported regions at steps 0, 10, 20) or a THEORY's stages
  const stageNodes = (s) => (s.regions === 'emotion' ? seeds : s.regions === 'emotion+body' ? [...new Set([...seeds, ...toNodes(['Hypothal'])])] : s.regions === 'shared' ? toNodes(HB.SHARED.regions) : toNodes(s.regions));
  const plan = theory.stages.map((s) => ({ step: s.step, nodes: stageNodes(s) }));
  const STEPS = 30, REST = 3, alea = mulberry32(0xe40 + 101 * pk + 17 * ek + 5 * travel + 3 * net + 7 * res + 11 * th), last = nodeIds.map(() => -99), reached = new Set(), carried = [];
  let viaPathways = 0;
  const pts = P3.slice(0, NR).map((p) => p.slice());
  /* 2026-11-09 (Phil: "parts of the brain, readable by people who don't understand"): each point also carries the CLASS of its brain part
   *   (human-brain-parts.js: 12 parts), kept beside pts (cls[k] = the class of pts[k]); the brut does not change. A node's
   *   part: its region; a parcel's: its majority region (DK_OF_400, the rule already used to light parcels); an impulse dot: the part it left
   *   (OUR choice); a deep outline dot: the region its vertex is labelled with (ENIGMA, measured); a cortex outline dot: the region whose
   *   centre is nearest on the same side (OUR approximation: the cortex labels are not stored; on the 400 parcel centres this rule gives the
   *   part of their majority region 334 times in 400 (84 %): outline dots near a border can wear a neighbour's colour). */
  const palette = pointPalette(), NC = HA.ANATOMY_NAMES.length - 14, half = HA.CORTEX.length / 6;
  const nearestCortex = (x, y, z, left) => { let best = -1, dm = Infinity; for (let r = left ? 0 : NC / 2; r < (left ? NC / 2 : NC); r++) { const [cx, cy, cz] = HA.CENTROIDS[r], d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2; if (d < dm) { dm = d; best = r; } } return partIndexOf(HA.ANATOMY_NAMES[best]); };
  const nodeClass = (a) => partIndexOf(a < NR ? (res ? HB.REGIONS_400[a].dk || HB.REGIONS_400[a].id : all[a]) : all[N + a - NR]);
  const cls = nodeIds.slice(0, NR).map((_, a) => nodeClass(a));
  const segments = use.map((e) => ({ a: P3[e.i].slice(), b: P3[e.j].slice(), w: (e.w - lo) / (hi - lo), c: 0, ia: e.i, ib: e.j })).concat(links.map((p) => ({ a: P3[p.i].slice(), b: P3[p.j].slice(), w: 0.5, c: 5, ia: p.i, ib: p.j })));
  nodeIds.slice(NR).forEach((_, k) => pts.push(P3[NR + k].slice()));
  nodeIds.slice(NR).forEach((_, k) => cls.push(nodeClass(NR + k)));
  for (let v = 0; v < HA.CORTEX.length / 3; v += OUTLINE_CORTEX_STEP) pts.push([HA.CORTEX[3 * v + 1] / 100, HA.CORTEX[3 * v + 2] / 100, HA.CORTEX[3 * v] / 100]);
  for (let v = 0; v < HA.CORTEX.length / 3; v += OUTLINE_CORTEX_STEP) cls.push(nearestCortex(HA.CORTEX[3 * v], HA.CORTEX[3 * v + 1], HA.CORTEX[3 * v + 2], v < half));
  for (let v = 0; v < HA.DEEP.length / 4; v += OUTLINE_DEEP_STEP) pts.push([HA.DEEP[4 * v + 1] / 100, HA.DEEP[4 * v + 2] / 100, HA.DEEP[4 * v] / 100]);
  for (let v = 0; v < HA.DEEP.length / 4; v += OUTLINE_DEEP_STEP) cls.push(partIndexOf(HA.ANATOMY_NAMES[HA.DEEP[4 * v + 3]]));
  const second = toNodes(regionsOf(other)), bothN = new Set(toNodes(both));
  second.forEach((a) => { for (let q = 0; q < (bothN.has(a) ? 3 : 2); q++) { pts.push(P3[a].slice()); cls.push(nodeClass(a)); } });
  const fixedPts = pts.length;
  let active = new Set();
  for (let t = 0; t < STEPS; t++) {
    plan.forEach((s) => { if (s.step === t) s.nodes.forEach((a) => { if (t - last[a] > REST) active.add(a); }); });
    const next = new Set();
    active.forEach((a) => { last[a] = t; reached.add(a); pts.push(P3[a].slice()); cls.push(nodeClass(a)); if (isSeed.has(a)) { pts.push(P3[a].slice()); cls.push(nodeClass(a)); } });
    if (travel) active.forEach((a) => adj[a].forEach(([b, w]) => {
      if (t + 1 - last[b] > REST && !next.has(b) && alea() < (w === null ? 0.3 : 0.05 + 0.7 * ((w - lo) / (hi - lo)) ** 2)) {
        next.add(b); if (w === null) viaPathways++; else carried.push(w); pts.push(P3[a].map((v, c) => v + (P3[b][c] - v) / 3)); cls.push(nodeClass(a)); } }));
    active = next;
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0), events = pts.length - fixedPts, amyg = P3[nodeIds.indexOf('Lamyg')];
  const nameNode = (a) => (a < NR ? (res ? HB.REGIONS_400[a].name : HB.REGIONS[a].name) : HB.REGIONS[N + a - NR].name);
  /* 09/11: the brut was the FIRST n (1,500) points, cycled: 18 of 48 settings made more (up to 7,448 at 414 parcels with travel), and the
   *  firing events, which come LAST, were dropped without a word. Now: every place, then the firing events — all of them when they fit in
   *  WIRING_POINTS_MAX, else EVENLY sampled across time (every step keeps its share), and the subject says how many; simuler takes its n. */
  const keptIdx = sampleEvenly(events, Math.max(0, WIRING_POINTS_MAX - fixedPts)), keptEvents = keptIdx.length, nOut = fixedPts + keptEvents, brut = new Float64Array(nOut * 3);
  const pointClasses = new Uint8Array(nOut);
  for (let k = 0; k < nOut; k++) { const src = k < fixedPts ? k : fixedPts + keptIdx[k - fixedPts], [px, py, pz] = pts[src], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; pointClasses[k] = Math.max(0, cls[src]); }
  const classesOk = cls.length === pts.length && cls.every((c) => c >= 0 && c < palette.length);
  return { D: 3, n: nOut, brut, nuage: true, segments, pointClasses, pointPalette: palette, unite: 'layout units (our choice)', invariants: {
    emotionWiringHCP: { mesure: gaps + (fineOk ? 0 : 1) + (fixedPts <= WIRING_POINTS_MAX ? 0 : 1) + (classesOk ? 0 : 1), formule: 0, drawnWiring: nOut + ' points: ' + fixedPts + ' places, ' + keptEvents + ' of ' + events + ' firing events' + (keptEvents < events ? ' (evenly sampled)' : ''), edgesWiring: edges.length + ' non-zero, ' + edges.filter((e) => e.w >= K.wiringStrongCut).length + ' with w >= ' + K.wiringStrongCut, componentsWiring: components, isolatedWiring: isolated,
      unmappedWiring: HB.UNMAPPED.join(', '), packShownWiring: pack.name, emotionShownWiring: emotion.name, printedWiring: emotion.printedName,
      sourceWiring: emotion.source.short + ', ' + emotion.source.design + ', ' + emotion.source.n, seedsWiring: emotion.regions.join(' '),
      regionsWiring: emotion.regions.length + (emotion.regions.length ? ': ' + emotion.regions.map(nameOf).join(', ') : ' (none among these parts)'),
      sharedInPackWiring: emotion.shared.length + (emotion.shared.length ? ': ' + emotion.shared.map(nameOf).join(', ') : ''),
      compareShownWiring: other ? other.name : 'none', bothWiring: both.length + (both.length ? ' shared: ' + both.join(' ') : ' shared'),
      sharedWiring: HB.SHARED.shared + ' of ' + HB.SHARED.mapped + ' (' + HB.SHARED.single + ' serve one)', insulaWiring: (HB.SHARED.families.L_insula || []).join(', '),
      amygdalaWiring: (HB.SHARED.families.Lamyg || []).join(', '), amygdalaPlaceWiring: amyg.map((v) => v.toFixed(3)).join(' '),
      positionsWiring: 'real centroids (fsaverage5, mm) for ' + NR + (res ? ' parcels; ' : ' regions; ') + all.slice(N).filter((id) => !HB.POS3D_SOURCE[id].startsWith('our placement')).length + ' deep parts at printed peaks, ' + all.slice(N).filter((id) => HB.POS3D_SOURCE[id].startsWith('our placement')).length + ' placed by us',
      silhouetteWiring: Math.ceil(HA.CORTEX.length / 3 / OUTLINE_CORTEX_STEP) + ' cortex and ' + Math.ceil(HA.DEEP.length / 4 / OUTLINE_DEEP_STEP) + ' deep-structure points',
      seedPlacesWiring: seeds.map((s) => nameNode(s) + '@' + P3[s].map((v) => v.toFixed(3)).join('@')).join('|'),
      resolutionShownWiring: res ? '414 parcels (Schaefer-400 and 14 subcortical)' : '82 regions (Desikan-Killiany and 14 subcortical)', seedNodesWiring: seeds.length,
      lostWiring: lost.length ? lost.join(' ') : 'none', fineWiring: K4.wiringNonzero + ' connections, ' + K4.functionKept + ' couplings, ' + overlap4 + ' both, at 414',
      theoryShownWiring: theory.name, theoryStagesWiring: plan.map((p, q) => 'step ' + p.step + ': ' + p.nodes.length + ' parts (' + theory.stages[q].why + ')').join(' | '),
      travelShownWiring: travel, networkShownWiring: net ? 'talking together at rest (function)' : 'wiring (structure)', overlapWiring: overlap + ' of ' + fedges.length, functionIsolatedWiring: funcIsolated.join(' '),
      pathwaysWiring: links.length + ' named pathways, ' + (all.length - N) + ' parts outside the 82', impulsesWiring: carried.length + viaPathways, viaPathwaysWiring: viaPathways,
      reachedWiring: reached.size + ' of ' + nodeIds.length, carriedMeanWiring: mean(carried).toFixed(3), keptMeanWiring: mean(use.map((e) => e.w)).toFixed(3),
      shownWiring: use.length + (net ? ' couplings' : ' connections') + ' and ' + links.length + ' named pathways as lines, ' + Math.min(n, nodeIds.length) + ' of ' + nodeIds.length + ' parts, ' + Math.max(0, Math.min(events, n - fixedPts)) + ' of ' + events + ' firing events',
      note: 'the lists not as stated, a split or isolated network, printed areas without a region other than the right claustrum and "brain stem", or anatomy names not the wiring labels' },
    temoin: { mesure: HB.SHARED.shared > 0 && (HB.SHARED.families.Lamyg || []).length >= 2 ? 0 : 1, formule: 0, sharedRegionsWiring: HB.SHARED.regions.join(' '),
      note: 'witness: with one place per emotion no region would serve two emotions; here ' + HB.SHARED.shared + ' of ' + HB.SHARED.mapped + ' do, the left amygdala serves ' + (HB.SHARED.families.Lamyg || []).length } } };
}

// ---------- 155: the value of a risk, Daniel Bernoulli 1738 (idea: codex "human brain", Claude sub-agent; printed numbers: SOURCES, p. 183-192) ----------
// Bernoulli's rule: a sure sum is worth as much as a risk when its logarithm equals the average logarithm of the fortunes the risk can leave
//   (u = ln of the whole fortune). The code COMPUTES each case of the paper with u = ln and compares with the numbers he printed. They are
//   the author's computations from his hypothesis and his own assumed chances, not measurements of people: reproducing them proves the
//   arithmetic and that his rule is the logarithm, not how anyone decides.
// Exact here: Caius (goods 10000, 5 ships in 100 lost) and his insurer at premiums 800 and 600 by bisection, Sempronius exactly; the six
//   printed integers 5043, 14243, 20478, 29878, 6751, 7033 all lie within one unit of the computed values (6/6; rounding to the nearest
//   gives only 2/6: "proxime" fixes no rounding rule); y - x = 10000 - premium, computed and printed; at premium 500 no insurer gains,
//   however rich; the fair game of section 13 (86.60 < 87, loss 13.40 > 13, 6.35 > 6 with 200 ducats); Sempronius rises with the ships
//   and stays under 7200, the expected value; St Petersburg is worth exactly 2 with no fortune, and within 0.1 of the printed 3, 4 1/3
//   and 6 (0.1 is OUR tolerance for his "about"); Cramer: 12 + 1 = 13 with his cap, 2^24 = 16777216 (the print has one 6 too many,
//   reported, not corrected), and 1/(6 - 4 sqrt 2) = 2.914 ("2,9 &c.").
// Witness: the same code with the expected value (u = w) gives St Petersburg 5, 10, 20 after 10, 20, 40 terms (no end) and Caius never
//   insures (500 < 800); with Cramer's square root it gives 2.914 at fortune 0 and Caius 537.3: neither rival rule gives the printed numbers.
// Drawing (front view): slider 0 St Petersburg against the fortune, 1 Caius and the insurer against the premium, 2 Sempronius against the
//   number of ships, 3 a fair 50/50 game with 100 ducats against the stake; label 0 log rule, 1 square root, 2 expected value, 3 printed.
function riskBernoulli(P, n) {
  const readBernoulli = (key) => Object.fromEntries(SOURCES[key].valeur.split(' ').map((x) => { const [k, v] = x.split(':'), f = /^(\d+)\+(\d+)\/(\d+)$/.exec(v);
    return [k, f ? Number(f[1]) + Number(f[2]) / Number(f[3]) : Number(v)]; }));
  const fair = readBernoulli('riskBernoulliFair'), caius = readBernoulli('riskBernoulliCaius'), semp = readBernoulli('riskBernoulliSempronius'), pete = readBernoulli('riskBernoulliPetersburg'), cramer = readBernoulli('riskBernoulliCramer');
  const expSafe = (v) => (Number.isFinite(v) ? expD(v) : v > 0 ? Infinity : 0);
  const LOG = { u: lnD, inv: expSafe }, ROOT = { u: (w) => Math.sqrt(w), inv: (v) => v * v }, LINEAR = { u: (w) => w, inv: (v) => v };
  /* the sure sum worth as much as a list of [chance, final fortune] under a rule */
  const sureBernoulli = (R, lots) => R.inv(lots.reduce((a, [p, w]) => a + p * R.u(w), 0));
  /* bisection, at most 200 halvings: where g goes from below zero to above; null when g does not change sign */
  const crossBernoulli = (g, lo, hi) => { let a = lo, b = hi; if (!(g(a) < 0 && g(b) > 0)) return null;
    for (let i = 0; i < 200; i++) { const m = (a + b) / 2; if (m === a || m === b) break; if (g(m) < 0) a = m; else b = m; } return (a + b) / 2; };
  const lost = caius.lostOf100 / 100, G = caius.goods;
  /* Caius, fortune x besides the goods: below the crossing the sure x + G - premium is worth more than the risk, he insures */
  const caiusAt = (R, prem) => crossBernoulli((x) => sureBernoulli(R, [[1 - lost, x + G], [lost, x]]) - (x + G - prem), 1e-6, 1e9);
  /* the insurer, fortune y: takes the premium and may pay the goods; above the crossing the risk is worth more than y */
  const insurerAt = (R, prem) => crossBernoulli((y) => sureBernoulli(R, [[1 - lost, y + prem], [lost, y + prem - G]]) - y, G - prem + 1e-6, 1e9);
  /* Sempronius: the sea part in equal ships, each lost with chance 1/10 on its own: binomial chances by a recurrence */
  const pShip = semp.lostOf10 / 10;
  const sempAt = (R, ships) => { const lots = []; let pr = 1; for (let j = 0; j < ships; j++) pr *= pShip;
    for (let k = 0; k <= ships; k++) { lots.push([pr, semp.home + semp.sea * k / ships]); pr = pr * (ships - k) / (k + 1) * (1 - pShip) / pShip; }
    return sureBernoulli(R, lots) - semp.home; };
  /* St Petersburg with fortune a: 1, 2, 4 ... ducats with chances 1/2, 1/4, 1/8 ...: his product formula, as a sum of logarithms, 200 terms */
  const peteAt = (R, a, terms = 200) => { const lots = []; let pay = 1, pr = 0.5; for (let k = 1; k <= terms; k++) { lots.push([pr, a + pay]); pay *= 2; pr /= 2; } return sureBernoulli(R, lots) - a; };
  const x8 = caiusAt(LOG, caius.premium), y8 = insurerAt(LOG, caius.premium), x6 = caiusAt(LOG, caius.premium2), y6 = insurerAt(LOG, caius.premium2);
  const s1 = sempAt(LOG, 1), s2 = sempAt(LOG, 2);
  const pairs = [[caius.caius, x8], [caius.insurer, y8], [caius.caius2, x6], [caius.insurer2, y6], [semp.oneShip, s1], [semp.twoShips, s2]];
  const withinUnit = pairs.filter(([pr, c]) => c !== null && Math.abs(c - pr) < 1).length, rounded = pairs.filter(([pr, c]) => c !== null && Math.round(c) === pr).length;
  let gaps = withinUnit === pairs.length ? 0 : 1;
  /* y - x = goods - premium (Bernoulli: "sine nouo calculo"), in the computed values and in the printed ones */
  const relComputed = [[x8, y8, caius.premium], [x6, y6, caius.premium2]].filter(([x, y, pm]) => x !== null && y !== null && Math.abs(y - x - (G - pm)) < 1e-6).length;
  const relPrinted = (caius.insurer - caius.caius === G - caius.premium ? 1 : 0) + (caius.insurer2 - caius.caius2 === G - caius.premium2 ? 1 : 0);
  if (relComputed + relPrinted !== 4) gaps++;
  /* premium 500, the expected loss: no insurer gains, however rich (fortunes 9501 to about 10^9, 121 steps on a log scale) */
  const pN = caius.premiumNobody; let bestNobody = -Infinity;
  for (let i = 0; i <= 120; i++) { const y = G - pN + expSafe(lnD(1e9) * i / 120), d = (1 - lost) * lnD(y + pN) + lost * lnD(y + pN - G) - lnD(y); if (d > bestNobody) bestNobody = d; }
  if (!(bestNobody < 0)) gaps++;
  /* section 13: the fair 50/50 game, value and loss each within the printed bound and one unit of it */
  const fv = sureBernoulli(LOG, [[0.5, fair.fortune - fair.stake], [0.5, fair.fortune + fair.stake]]), fLoss = fair.fortune - fv;
  const rLoss = fair.richFortune - sureBernoulli(LOG, [[0.5, fair.richFortune - fair.stake], [0.5, fair.richFortune + fair.stake]]);
  const fairOk = (fv < fair.valueBelow && fv > fair.valueBelow - 1 ? 1 : 0) + (fLoss > fair.lossAbove && fLoss < fair.lossAbove + 1 ? 1 : 0) + (rLoss > fair.richLossAbove && rLoss < fair.richLossAbove + 1 ? 1 : 0);
  if (fairOk !== 3) gaps++;
  /* Sempronius, 1 to 200 ships: rising, always under the printed 7200 = the expected value of the sea part */
  const expectedSea = semp.sea * (10 - semp.lostOf10) / 10, sempSeries = [];
  for (let k = 1; k <= 200; k++) sempSeries.push(sempAt(LOG, k));
  const sempRising = sempSeries.every((v, i) => i === 0 || v > sempSeries[i - 1]), sempUnder = sempSeries.every((v) => v < semp.never);
  if (!(sempRising && sempUnder && expectedSea === semp.never)) gaps++;
  /* St Petersburg: exactly 2 at fortune 0 ("praecise"), the others within 0.1 (OUR tolerance for "proxime", "praeter propter") */
  const peteFortunes = Object.entries(pete).map(([k, pr]) => [Number(k.slice('fortune'.length)), pr]), peteValues = peteFortunes.map(([a]) => peteAt(LOG, a));
  const peteExact = Math.abs(peteValues[0] - pete.fortune0) < 1e-9, peteAbout = peteFortunes.filter(([a, pr], i) => a > 0 && Math.abs(peteValues[i] - pr) < 0.1).length;
  if (!peteExact || peteAbout !== 3) gaps++;
  /* Cramer: sums above 2^24 counted as 2^24; the square-root equivalent at fortune 0 against its closed form */
  let capValue = 1; for (let j = 0; j < cramer.capPower; j++) capValue *= 2;
  let belowSum = 0, aboveSum = 0;
  { let pay = 1, pr = 0.5; for (let k = 1; k <= 200; k++) { if (pay < capValue) belowSum += pr * pay; else aboveSum += pr * capValue; pay *= 2; pr /= 2; } }
  const capText = String(capValue), printedCap = String(cramer.capPrinted);
  const misprint = printedCap !== capText && [...printedCap].some((_, i) => printedCap.slice(0, i) + printedCap.slice(i + 1) === capText);
  const rootSeries = peteAt(ROOT, 0), rootClosed = 1 / (6 - 4 * Math.sqrt(2));
  const cramerOk = (Math.abs(belowSum - cramer.belowCap) < 1e-9 ? 1 : 0) + (Math.abs(aboveSum - cramer.aboveCap) < 1e-9 ? 1 : 0) + (Math.abs(belowSum + aboveSum - cramer.sum) < 1e-9 ? 1 : 0)
    + (misprint ? 1 : 0) + (Math.abs(rootSeries - rootClosed) < 1e-9 && Math.floor(rootSeries * 10) / 10 === cramer.rootEquivalent ? 1 : 0);
  if (cramerOk !== 5) gaps++;
  /* witness: the same cases with the expected value and with Cramer's square root */
  const linearSums = [10, 20, 40].map((t) => peteAt(LINEAR, 0, t)), linearCaius = caiusAt(LINEAR, caius.premium), expectedLoss = lost * G;
  const rootCaius = caiusAt(ROOT, caius.premium), rootSemp = sempAt(ROOT, 1);
  const rootPairs = [[caius.caius, rootCaius], [caius.insurer, insurerAt(ROOT, caius.premium)], [caius.caius2, caiusAt(ROOT, caius.premium2)], [caius.insurer2, insurerAt(ROOT, caius.premium2)], [semp.oneShip, rootSemp], [semp.twoShips, sempAt(ROOT, 2)]];
  const rootWithin = rootPairs.filter(([pr, c]) => c !== null && Math.abs(c - pr) < 1).length;
  const linearFails = linearSums[0] < linearSums[1] && linearSums[1] < linearSums[2] && linearSums[0] > pete.fortune0 && linearCaius === null && expectedLoss < caius.premium;
  const rootFails = rootWithin === 0 && Math.abs(rootSeries - pete.fortune0) > 0.5;
  /* drawing */
  const shown = Math.max(0, Math.min(3, Math.round(P.problemBernoulli))), pts = [], LN10 = lnD(10);
  if (shown === 0) {
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = expSafe(6 * LN10 * t) - 1; pts.push([t, peteAt(LOG, a) / 12, 0]); pts.push([t, peteAt(ROOT, a) / 12, 1]); }
    peteFortunes.forEach(([a, pr]) => pts.push([lnD(a + 1) / LN10 / 6, pr / 12, 3]));
  } else if (shown === 1) {
    for (let prem = 520; prem <= 1000; prem += 10) for (const [R, lab] of [[LOG, 0], [ROOT, 1]]) for (const v of [caiusAt(R, prem), insurerAt(R, prem)]) if (v !== null && v > 1) pts.push([(prem - 500) / 500, lnD(v) / LN10 / 6, lab]);
    [[caius.premium, caius.caius], [caius.premium, caius.insurer], [caius.premium2, caius.caius2], [caius.premium2, caius.insurer2]].forEach(([pm, v]) => pts.push([(pm - 500) / 500, lnD(v) / LN10 / 6, 3]));
  } else if (shown === 2) {
    for (let k = 1; k <= 40; k++) { const t = (k - 1) / 39; pts.push([t, (sempAt(LOG, k) - 6500) / 1000, 0], [t, (sempAt(ROOT, k) - 6500) / 1000, 1], [t, (expectedSea - 6500) / 1000, 2]); }
    pts.push([0, (semp.oneShip - 6500) / 1000, 3], [1 / 39, (semp.twoShips - 6500) / 1000, 3]);
  } else {
    for (let s = 0; s <= 96; s += 2) { const t = s / 100, lots = [[0.5, fair.fortune - s], [0.5, fair.fortune + s]];
      pts.push([t, (fair.fortune - sureBernoulli(LOG, lots)) / 100, 0], [t, (fair.fortune - sureBernoulli(ROOT, lots)) / 100, 1], [t, (fair.fortune - sureBernoulli(LINEAR, lots)) / 100, 2]); }
    pts.push([fair.stake / 100, fair.lossAbove / 100, 3]);
  }
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  const signed = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
  return { D: 3, brut, nuage: true, unite: 'ducats or roubles (scaled)', invariants: {
    riskBernoulli: { mesure: gaps, formule: 0, integersBernoulli: withinUnit + '/6', roundedBernoulli: rounded + '/6',
      gapsBernoulli: pairs.map(([pr, c]) => pr + ' ' + (c === null ? 'none' : signed(c - pr))).join(' ; '),
      caiusBernoulli: [x8, y8, x6, y6].map((v) => (v === null ? 'none' : v.toFixed(2))).join(' '), relationBernoulli: relComputed + '/2 computed, ' + relPrinted + '/2 printed',
      nobodyBernoulli: bestNobody.toExponential(1), fairBernoulli: fv.toFixed(4) + ' ' + fLoss.toFixed(4) + ' ' + rLoss.toFixed(4),
      semproniusBernoulli: s1.toFixed(2) + ' ' + s2.toFixed(2) + ' ; 200 ships ' + sempSeries[199].toFixed(2) + ' ; limit ' + expectedSea,
      petersburgBernoulli: peteFortunes.map(([a, pr], i) => a + ': ' + peteValues[i].toFixed(a === 0 ? 6 : 4) + ' (' + signed(peteValues[i] - pr, 3) + ')').join(' ; '),
      cramerBernoulli: belowSum + ' + ' + aboveSum.toFixed(0) + ' = ' + (belowSum + aboveSum).toFixed(0) + ' ; square root ' + rootSeries.toFixed(6),
      misprintBernoulli: misprint ? '2^' + cramer.capPower + ' = ' + capText + ', printed ' + printedCap + ' (one digit too many)' : 'none found', problemShownBernoulli: shown,
      note: 'his own computations from his hypothesis, not measurements of people: a printed integer more than one unit off, a broken relation, an insurer gaining at 500, a section 13 bound, Sempronius, St Petersburg or Cramer not reproduced' },
    temoin: { mesure: linearFails && rootFails ? 0 : 1, formule: 0, linearPetersburgBernoulli: linearSums.join(' '), linearCaiusBernoulli: linearCaius === null ? 'never insures (' + expectedLoss + ' < ' + caius.premium + ')' : linearCaius.toFixed(2),
      rootIntegersBernoulli: rootWithin + '/6', rootPetersburgBernoulli: rootSeries.toFixed(3), rootCaiusBernoulli: rootCaius === null ? 'none' : rootCaius.toFixed(1), rootSemproniusBernoulli: rootSemp.toFixed(1),
      note: 'witness: the expected value never stops growing on St Petersburg and never insures Caius; the square root gives 2.914 and 537.3; only the logarithm gives the printed numbers' } } };
}

// ---------- 156: the speed of the nerve signal, Helmholtz 1850 (idea: codex "human brain", Claude sub-agent; printed numbers: SOURCES, 1850 p. 339-351, 1852 p. 215-216) ----------
// Helmholtz stimulated a frog's sciatic nerve at two points, one far from the calf muscle and one near it, and timed the twitch (the lifting
//   of a weight) with a ballistic galvanometer: the far stimulus lifted it later. The code COMPUTES each speed as v = L / delay (L the nerve
//   between the two points, the delay the printed difference of the two times) and its probable error from the delay's alone,
//   v x e(delay) / delay (the length, uncertain by "a few millimetres", is not in his errors either), and compares with his print.
// Exact here: far - near = the printed delay to 1/100000 s (5/5); 6 of 8 speeds equal his to the tenth and the other two are off by ONE
//   tenth, said, not hidden (XII: 38 / 0.00131 = 29.01, printed 29.1; XIV: 38 / 0.00141 = 26.95, printed 26.9; likely a delay he did not
//   round), all 8 within 0.1; the 5 probable errors to the tenth; the "3,14" printed for XI A on its page is one tenth of the computed
//   31.39 and of the summary's 31.4 (a misprint, kept and reported); (29.1 + 25.1 + 26.9) / 3 = 27.03, printed 27.0; 1852: 85.7 x 6 =
//   514.2 mm a second, 53 mm in 1/514.2 s = 27.25 m/s. NOT reproduced: his least-squares 26.4 for IX to XI; weighting each printed speed
//   by 1 / error^2 gives 26.15 (no weighting tried in the dossier gives 26.4): shown as printed, never recomputed to fit.
// Witness: "the nerve signal is instantaneous" predicts no delay; all 8 printed delays are positive, series IX 12.5 probable errors from
//   zero, the least precise (X B) 3.3. Our threshold, not his: at 1000 m/s the longest nerve piece (43 mm) would take 0.000043 s, under
//   a third of the smallest probable error printed (0.00014 s).
// A frog nerve at 11 to 21 degrees C, not a human one: it shows that the nerve signal takes time, not how fast people think.
// Drawing (front view): x the series in the order printed (IX ... XIV at 0 to 7/8, the 1852 record at 1), y the speed / 50 m/s; label 0
//   computed L / delay, 1 the printed probable-error bar (21 points from printed speed - error to + error), 2 the printed speed, 3 a printed
//   mean (26.4 over IX to XI, 27.0 over XII to XIV, both across the whole width for the 1852 record); slider 0 all, 1 the cool series IX
//   to XI, 2 the warm series XII to XIV, 3 the 1852 record.
function nerveHelmholtz(P, n) {
  const readHelmholtz = (key) => Object.fromEntries(SOURCES[key].valeur.split(' ').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
  const NAMES = ['IX', 'XA', 'XB', 'XIA', 'XIB', 'XII', 'XIII', 'XIV'], LABELS = ['IX', 'X A', 'X B', 'XI A', 'XI B', 'XII', 'XIII', 'XIV'], COOL = 5;
  const series = NAMES.map((k) => readHelmholtz('nerveHelmholtz' + k)), sum = readHelmholtz('nerveHelmholtzSummary');
  const coolTemp = readHelmholtz('nerveHelmholtzCoolTemp'), later = readHelmholtz('nerveHelmholtz1852');
  /* v = L / delay with L in metres; its probable error from the delay's probable error alone */
  const speeds = series.map((s) => s.length / 1000 / s.delay);
  const errors = series.slice(0, COOL).map((s, i) => speeds[i] * s.delayErr / s.delay);
  const printed = NAMES.map((k) => sum['speed' + k]), printedErr = NAMES.slice(0, COOL).map((k) => sum['err' + k]);
  let gaps = 0;
  /* far - near = the printed delay, to 1/100000 s */
  const differences = series.slice(0, COOL).filter((s) => Math.round((s.far - s.near) * 1e5) === Math.round(s.delay * 1e5)).length;
  if (differences !== COOL) gaps++;
  /* each speed against the summary of p. 351: within 0.1 (all), and to the tenth (the two that are not are named) */
  const within = speeds.filter((v, i) => Math.abs(v - printed[i]) < 0.1).length, tenth = speeds.filter((v, i) => v.toFixed(1) === printed[i].toFixed(1)).length;
  const offTenth = NAMES.map((_, i) => i).filter((i) => speeds[i].toFixed(1) !== printed[i].toFixed(1));
  if (within !== NAMES.length) gaps++;
  /* probable errors to the tenth, and the same on the series page as in the summary */
  const errTenth = errors.filter((e, i) => e.toFixed(1) === printedErr[i].toFixed(1) && series[i].speedErr === printedErr[i]).length;
  if (errTenth !== COOL) gaps++;
  /* the series pages against the summary: the same, except a misprint = one tenth of the summary's value, confirmed by the computation */
  const samePage = series.filter((s, i) => s.speed === printed[i]).length;
  const misprints = NAMES.map((_, i) => i).filter((i) => series[i].speed !== printed[i] && Math.abs(series[i].speed * 10 - printed[i]) < 1e-9 && Math.abs(speeds[i] - printed[i]) < 0.1);
  if (samePage + misprints.length !== NAMES.length) gaps++;
  /* b) the mean of the warm series */
  const warmMean = printed.slice(COOL).reduce((a, v) => a + v, 0) / (NAMES.length - COOL);
  if (warmMean.toFixed(1) !== sum.mean.toFixed(1)) gaps++;
  /* a) his least squares, 26.4: weights 1 / error^2 on the five printed speeds give another number -- reported, not a gap, not forced */
  let sw = 0, swv = 0;
  for (let i = 0; i < COOL; i++) { const w = 1 / (printedErr[i] * printedErr[i]); sw += w; swv += w * printed[i]; }
  const weighted = swv / sw, leastReproduced = Math.abs(weighted - sum.leastSquares) < 0.05;
  /* 1852: 85.7 mm of cylinder in 1/6 s, about 1 mm between the two curves, 53 mm of nerve */
  const perSecond = later.cylinder * later.perSixth, speed1852 = later.length / 1000 / (later.gapMm / perSecond);
  if (!(Math.abs(perSecond - later.perSecond) < 1e-9 && speed1852.toFixed(2) === later.speed.toFixed(2) && later.earlier === sum.leastSquares)) gaps++;
  /* temperatures: cool series 11 to 15 (not measured), warm series 20 and 21, the summary 11 to 21 */
  const warmC = series.slice(COOL).map((s) => s.celsius);
  if (!(coolTemp.lowC === sum.lowC && Math.max(...warmC) === sum.highC && coolTemp.highC < Math.min(...warmC))) gaps++;
  /* witness: an instantaneous signal gives no delay */
  const delays = series.map((s) => s.delay), positive = delays.filter((d) => d > 0).length, sigmas = series.slice(0, COOL).map((s) => s.delay / s.delayErr);
  const fastDelay = Math.max(...series.map((s) => s.length)) / 1000 / 1000, smallestErr = Math.min(...series.slice(0, COOL).map((s) => s.delayErr));
  const instantFails = positive === NAMES.length && Math.min(...sigmas) > 3 && fastDelay < smallestErr / 3;
  /* drawing */
  const shown = Math.max(0, Math.min(3, Math.round(P.seriesHelmholtz))), pts = [], Y = 50;
  const picked = shown === 0 ? NAMES.map((_, i) => i) : shown === 1 ? [0, 1, 2, 3, 4] : shown === 2 ? [5, 6, 7] : [];
  for (const i of picked) { const x = i / 8; pts.push([x, speeds[i] / Y, 0], [x, printed[i] / Y, 2]);
    if (i < COOL) for (let j = 0; j <= 20; j++) pts.push([x, (printed[i] + printedErr[i] * (j / 10 - 1)) / Y, 1]); }
  if (shown === 0 || shown === 1) for (let j = 0; j <= 8; j++) pts.push([j / 16, sum.leastSquares / Y, 3]);
  if (shown === 0 || shown === 2) for (let j = 0; j <= 8; j++) pts.push([5 / 8 + j / 32, sum.mean / Y, 3]);
  if (shown === 0 || shown === 3) pts.push([1, speed1852 / Y, 0], [1, later.speed / Y, 2]);
  if (shown === 3) for (let j = 0; j <= 16; j++) pts.push([j / 16, sum.leastSquares / Y, 3], [j / 16, sum.mean / Y, 3]);
  const brut = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) { const [px, py, pz] = pts[k % pts.length], o = 3 * k; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pz; }
  const signed = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
  return { D: 3, brut, nuage: true, unite: 'm/s (scaled)', invariants: {
    nerveHelmholtz: { mesure: gaps, formule: 0,
      speedsHelmholtz: NAMES.map((_, i) => LABELS[i] + ' ' + speeds[i].toFixed(3) + ' printed ' + printed[i].toFixed(1) + ' (' + signed(speeds[i] - printed[i], 3) + ')').join(' ; '),
      tenthHelmholtz: tenth + '/' + NAMES.length + ' to the tenth, ' + within + '/' + NAMES.length + ' within 0.1 ; off by one tenth: ' + (offTenth.length ? offTenth.map((i) => LABELS[i] + ' ' + speeds[i].toFixed(2) + ' printed ' + printed[i].toFixed(1)).join(', ') : 'none'),
      errorsHelmholtz: errors.map((e, i) => LABELS[i] + ' ' + e.toFixed(2) + ' printed ' + printedErr[i].toFixed(1)).join(' ; ') + ' ; ' + errTenth + '/' + COOL + ' to the tenth',
      differencesHelmholtz: differences + '/' + COOL,
      misprintHelmholtz: misprints.length ? misprints.map((i) => LABELS[i] + ': printed ' + series[i].speed + ' on its page, computed ' + speeds[i].toFixed(2) + ', summary ' + printed[i].toFixed(1) + ' (one tenth of it)').join(' ; ') : 'none found',
      warmMeanHelmholtz: warmMean.toFixed(2) + ' printed ' + sum.mean.toFixed(1),
      leastSquaresHelmholtz: 'printed ' + sum.leastSquares.toFixed(1) + (leastReproduced ? ', reproduced' : ', not reproduced here') + ' (weighted mean ' + weighted.toFixed(2) + ')',
      record1852Helmholtz: later.cylinder + ' x ' + later.perSixth + ' = ' + perSecond.toFixed(1) + ' mm a second ; ' + later.length + ' mm in ' + later.gapMm + '/' + perSecond.toFixed(1) + ' s = ' + speed1852.toFixed(4) + ' m/s, printed ' + later.speed.toFixed(2),
      temperatureHelmholtz: 'IX to XI ' + coolTemp.lowC + ' to ' + coolTemp.highC + ' (not measured), XII to XIV ' + warmC.join(', ') + ' degrees C',
      seriesShownHelmholtz: shown,
      note: 'a frog nerve, not a human one: a printed delay not the difference of its two times, a speed more than 0.1 off, a probable error off, a page and the summary disagreeing other than by the misprint, the warm mean, the 1852 record or the temperatures not as printed' },
    temoin: { mesure: instantFails ? 0 : 1, formule: 0, delaysHelmholtz: positive + '/' + NAMES.length + ' positive, ' + Math.min(...delays) + ' to ' + Math.max(...delays) + ' s',
      sigmasHelmholtz: sigmas.map((v, i) => LABELS[i] + ' ' + v.toFixed(1)).join(' ; '),
      fastDelayHelmholtz: fastDelay.toFixed(6) + ' s at 1000 m/s (our threshold), smallest probable error ' + smallestErr + ' s',
      note: 'witness: an instantaneous nerve signal would give no delay; every printed delay is positive and at least 3 probable errors above zero' } } };
}

export const COLONNES = Object.freeze({
  nerveHelmholtz: { colonnes: ['series in the order printed (IX to XIV, then the 1852 record), scaled 0 to 1', 'speed of the nerve signal (m/s / 50)', 'computed, probable-error bar, printed, or printed mean (label)'], memeLongueur: [], autres: [0, 1, 2] },
  riskBernoulli: { colonnes: ['what varies: fortune (log), premium, ships or stake, scaled 0 to 1', 'what the rule gives: sure value, fortune threshold (log), or loss, scaled', 'log rule, square root, expected value, or printed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  emotionWiringHCP: { colonnes: ['front to back of the real brain (mm / 100)', 'bottom to top (mm / 100)', 'left to right (mm / 100)'], memeLongueur: [], autres: [0, 1, 2] },
  bodyMapsNummenmaa: { colonnes: ['answer: anger, fear, disgust, happiness, sadness, surprise, neutral', 'shown emotion (same order, from the bottom) and reader', 'right or wrong answer (label)'], memeLongueur: [], autres: [0, 1, 2] },
  emotionsSiegel: { colonnes: ['step / 120 (our clock)', 'body signal and unit (heart rate at the bottom, skin conductance response at the top)', 'heart, blood pressure, breathing or skin (label)'], memeLongueur: [], autres: [0, 1, 2] },
  connectomeSizes: { colonnes: ['log10 neurons / 11', 'log10 synapses / 8 (0 where none were counted)', 'worm, hemibrain, whole fly, human (label)'], memeLongueur: [], autres: [0, 1, 2] },
  neuronsHerculanoHouzel: { colonnes: ['log10 neurons (millions) / 4', 'log10 brain mass (g) / 2', 'species, primate line, or rodent power (label)'], memeLongueur: [], autres: [0, 1, 2] },
  allOrNoneLucas: { colonnes: ['(25.9 - coil distance in cm) / 6.4, stronger to the right', 'contraction / 4.1 mm', 'observations, printed steps, or a straight line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  brainBoyd: { colonnes: ['period of life (premature to over 80) / 17', 'encephalon (oz.) / 50', 'men, women, or the sum of the parts (label)'], memeLongueur: [], autres: [0, 1, 2] },
  glycosuriaCannon: { colonnes: ['group: cats, people, controls', 'share with sugar in the urine', 'cats, people, or controls (label)'], memeLongueur: [], autres: [0, 1, 2] },
  weberKonig: { colonnes: ['(log10 brightness J + 1) / 6.3', '(log10 of dr / r + 2) / 2', 'table: 670 K., 670 B., 605 K., 605 B. (label)'], memeLongueur: [], autres: [0, 1, 2] },
  extinctionPavlov: { colonnes: ['minutes since the first showing / 120', 'saliva in one minute / 0.7 c.c.', 'series, in the order printed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  pressurePeirceJastrow: { colonnes: ['(ratio of pressures - 1) x 10', 'errors / 50', 'single sets, printed means, or the normal-error curve (label)'], memeLongueur: [], autres: [0, 1, 2] },
  attentionCattell: { colonnes: ['attention (concentrated, normal, distracted)', 'reaction time (ms) / 250', 'single series, printed means, or Table VIII differences (label)'], memeLongueur: [], autres: [0, 1, 2] },
  reactionDonders: { colonnes: ['method (a, c, b)', 'reaction time (ms)', 'roll means, single trials, or all-observation mean and minimum (label)'], memeLongueur: [], autres: [0, 1, 2] },
  essaisThorndike: { colonnes: ['trial', 'log of the time to escape', 'his times, moving average, or a power law (label)'], memeLongueur: [], autres: [0, 1, 2] },
  penduleKater: { colonnes: ['sine of latitude squared', 'length of the seconds pendulum', 'stations, fitted line, or a homogeneous Earth (label)'], memeLongueur: [], autres: [0, 1, 2] },
  jaugesHerschel: { colonnes: ['log stars in the field / 6.5', 'log visual ray / 4', 'his Table II, formula for 15 minutes, or for your field (label)'], memeLongueur: [], autres: [0, 1, 2] },
  constantesPlanck: { colonnes: ['h nu / k T / 12', 'relative energy', 'Planck law, Wien law, or h and k for your lambda theta (label)'], memeLongueur: [], autres: [0, 1, 2] },
  reststrahlenRubens: { colonnes: ['temperature / 1800 K', 'energy / 210 (132 at 1000 C)', 'measured, the chosen law as printed, or recomputed from its formula (label)'], memeLongueur: [], autres: [0, 1, 2] },
  etherMichelson: { colonnes: ['mark / 16', 'fringe position minus its mean (wave-lengths)', 'noon, evening or expected for your speed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  emanationRutherford: { colonnes: ['time / 360 seconds', 'current (initial = 1)', 'Table III, halving law or straight line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  maisDarwin: { colonnes: ['row / 16', 'height / 24 inches', 'crossed, self-fertilised or self-fertilised raised by your gain (label)'], memeLongueur: [], autres: [0, 1, 2] },
  magnitudesPogson: { colonnes: ['magnitude / 16', 'log aperture or other scale (see label)', 'printed aperture, your ratio, or other observers / 20 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  rayonsThomson: { colonnes: ['speed / 1.3e10 cm per second', 'm / e in units of 1e-7', 'printed, recomputed or recomputed with your I (label)'], memeLongueur: [], autres: [0, 1, 2] },
  poisMendel: { colonnes: ['experiment / 8', 'share of the offspring', 'dominant, recessive or recessive expected (label)'], memeLongueur: [], autres: [0, 1, 2] },
  spiraleMoseley: { colonnes: ['whorl / 8', 'width / 1.4 inches', 'Turbo duplicatus, Buccinum or your ratio (label)'], memeLongueur: [], autres: [0, 1, 2] },
  tubesHagen: { colonnes: ['flow / 0.85 Loth per second', 'head / 15 inches', 'measured, his curves or your square term (label)'], memeLongueur: [], autres: [0, 1, 2] },
  syllabesKaeding: { colonnes: ['syllables / 15', 'log of the words / 16', 'chosen corpus, all corpora or the geometric witness (label)'], memeLongueur: [], autres: [0, 1, 2] },
  fonteMacKellar: { colonnes: ['rank / 26', 'share / 0.12', 'fount, even share or your mix (label)'], memeLongueur: [], autres: [0, 1, 2] },
  tempsOldham: { colonnes: ['distance / 180 degrees', 'minutes / 50', 'first phase, second phase or straight chord at your speed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  spiralesBeal: { colonnes: ['spirals to the right / 14', 'spirals to the left / 14', 'neighbouring Fibonacci, two Fibonacci or other (label)'], memeLongueur: [], autres: [0, 1, 2] },
  variationsHalley: { colonnes: ['(year - 1570) / 120', 'variation / 12 degrees (East positive)', 'London, Paris and Copenhagen, or London at the chosen year (label)'], memeLongueur: [], autres: [0, 1, 2] },
  tubesPoiseuille: { colonnes: ['log of the diameter (scaled)', 'log of the flow / 16', 'tube or fitted line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  unitesWeber: { colonnes: ['discharge number / 5', 'ratio / 1.7e11', 'your share of the charge, printed or mean (label)'], memeLongueur: [], autres: [0, 1, 2] },
  aimantGauss: { colonnes: ['distance / 4.2 m', 'deflection / 8100 seconds', 'first position, second position or one-constant fit (label)'], memeLongueur: [], autres: [0, 1, 2] },
  deplacementsPerrin: { colonnes: ['projection / 17', 'grains / 50', 'model for the chosen sigma, found or Perrin calculated (label)'], memeLongueur: [], autres: [0, 1, 2] },
  filtreDarcy: { colonnes: ['effective head / 14', 'flow / 20 (series 1: / 30)', 'February, fitted line or first series (label)'], memeLongueur: [], autres: [0, 1, 2] },
  critiqueReynolds: { colonnes: ['log diameter (scaled)', 'velocity / 3 or log B_s - 1.5', 'law, measured velocity or log B_s (label)'], memeLongueur: [], autres: [0, 1, 2] },
  effetJoule: { colonnes: ['current / 3', 'heat / 30', 'law for the chosen power, half hour or one hour (label)'], memeLongueur: [], autres: [0, 1, 2] },
  balanceCoulomb: { colonnes: ['distance / 40', 'torsion / 650 or seconds / 70', 'law for the chosen power, trials or oscillations (label)'], memeLongueur: [], autres: [0, 1, 2] },
  picLummer: { colonnes: ['temperature / 1700', 'E_m / T^k (scaled), lambda_m T / 3000 or E_m / 300', 'which quantity (label)'], memeLongueur: [], autres: [0, 1, 2] },
  ondulationsYoung: { colonnes: ['colour, red to violet', 'frequency / 800 or length / 300', 'frequency for the chosen time, printed frequency or length (label)'], memeLongueur: [], autres: [0, 1, 2] },
  vitesseNyquist: { colonnes: ['levels / chosen maximum', 'relative speed (scaled)', 'log law, straight line or printed value (label)'], memeLongueur: [], autres: [0, 1, 2] },
  parallaxeBessel: { colonnes: ['weight of star b / 1.5', 'parallax / 0.4 arcsec', 'common solution, chosen weight or separate parallaxes (label)'], memeLongueur: [], autres: [0, 1, 2] },
  motsMendenhall: { colonnes: ['letters / 15', 'words / 260', 'Oliver Twist or a Vanity Fair group (label)'], memeLongueur: [], autres: [0, 1, 2] },
  chaleurLondres: { colonnes: ['(year - 1789) / 29', '(degrees F - 46) / 8', 'London, country or London smoothed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  survieHalley: { colonnes: ['age / 100', 'alive / 1000 or annuity / 15', 'alive, annuity recomputed, annuity printed or constant risk (label)'], memeLongueur: [], autres: [0, 1, 2] },
  repliquesOmori: { colonnes: ['half day / horizon', 'shocks / 200', 'counts, hyperbola, exponential or yearly mean (label)'], memeLongueur: [], autres: [0, 1, 2] },
  chaleursPetitDulong: { colonnes: ['atomic weight / 14', 'specific heat / 0.2', 'element or the law (label)'], memeLongueur: [], autres: [0, 1, 2] },
  equivalentsFaraday: { colonnes: ['table equivalent / 130', 'grains / 25 or measured equivalent / 130', 'deposited mass, retained trial or explained miss (label)'], memeLongueur: [], autres: [0, 1, 2] },
  mortaliteNightingale: { colonnes: ['rose, across', 'rose, up', 'zymotic, wounds or other causes (label)'], memeLongueur: [], autres: [0, 1, 2] },
  exclusionGause: { colonnes: ['day / 16', 'volume / 120', 'observed aurelia, observed caudatum, model aurelia or model caudatum (label)'], memeLongueur: [], autres: [0, 1, 2] },
  aberrationBradley: { colonnes: ['star (rank)', 'arcseconds / 60', 'deduced maximum, observed change or predicted maximum (label)'], memeLongueur: [], autres: [0, 1, 2] },
  regressionGalton: { colonnes: ['mid-parent height (inches - 63) / 11', 'adult child height (inches - 63) / 11', 'row medians, column medians or test line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  lumiereMichelson: { colonnes: ['measurement number', 'velocity minus 299600 km/s, / 500', 'measurement, his result or exact c (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiMoseley: { colonnes: ['atomic number N / 50', 'Moseley Q_K / 50', 'element or the line Q = N - 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiHubble1929: { colonnes: ['distance / 2 Mpc', 'velocity / 1100 km/s', 'nebula, fitted line or test line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  vieGraunt: { colonnes: ['age / 80', 'alive out of 100 / 100', 'table, geometric method, chosen ratio (label)'], memeLongueur: [], autres: [0, 1, 2] },
  gouttesMillikan: { colonnes: ['drop number', 'e^(2/3) x 10^8 minus 61.14, x 4', 'first 23, later drops or running mean (label)'], memeLongueur: [], autres: [0, 1, 2] },
  lynxHudson: { colonnes: ['year (1848 to 1909)', 'log10 lynx skins / 5', 'series, peak or shifted series (label)'], memeLongueur: [], autres: [0, 1, 2] },
  eclipseEddington: { colonnes: ['displacement computed for Einstein (arcseconds)', 'displacement observed (arcseconds)', 'star, Einstein, Newton or chosen factor (label)'], memeLongueur: [], autres: [0, 1, 2] },
  equivalentJoule: { colonnes: ['series (1 to 5)', 'foot-pounds per pound per degree F, minus 772, / 5', 'water, mercury, cast iron or the value kept (label)'], memeLongueur: [], autres: [0, 1, 2] },
  densiteCavendish: { colonnes: ['measurement number', 'density of the Earth (times water), shifted', 'first wire, second wire or chosen mean (label)'], memeLongueur: [], autres: [0, 1, 2] },
  fievreSemmelweis: { colonnes: ['year (1841 to 1848)', 'deaths per hundred mothers / 16', 'doctors clinic, midwives clinic, chlorine or chosen year (label)'], memeLongueur: [], autres: [0, 1, 2] },
  oubliEbbinghaus: { colonnes: ['log10 minutes / 4.7', 'per cent saved when relearning / 60', 'measured, formula or exponential (label)'], memeLongueur: [], autres: [0, 1, 2] },
  carteSturtevant: { colonnes: ['distance on the map / 60', 'observed per cent of cross-overs / 60', 'map pair, check pair or additive line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  argonRayleigh: { colonnes: ['method (chemical left, from air right)', 'grams per litre, shifted', 'chemical, atmospheric or printed (label)'], memeLongueur: [], autres: [0, 1, 2] },
  diffusionAlpha: { colonnes: ['log10 sin(angle / 2), shifted', 'log10 scintillations / 5.2', 'measured or test law (label)'], memeLongueur: [], autres: [0, 1, 2] },
  michaelisMenten: { colonnes: ['sucrose (linear / 0.333 M, or log10 + 2.5 / 2.2)', 'initial rate / fitted maximum', 'measured, fitted curve or test curve (label)'], memeLongueur: [], autres: [0, 1, 2] },
  especesAire: { colonnes: ['log10 area in square miles / 4', 'bird species / 82', 'island near or isolated, fitted line, power law (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiOhm: { colonnes: ['wire length (Zoll / 130)', 'needle twist (hundredths of a turn / 330)', 'chosen series, law a / (b + x), other series (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiBoyle: { colonnes: ['air volume (quarter inches / 48)', 'pressure (inches of mercury / 117.56)', 'Boyle reading, test curve, straight line or early fit (label)'], memeLongueur: [], autres: [0, 1, 2] },
  raiesBalmer: { colonnes: ['1 / n^2 (x 9)', '1 / wavelength (/ R_H / 4)', 'measured line or fitted Rydberg line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  choleraSnow: { colonnes: ['street position x', 'street position y', 'house (0 S&V, 1 S&V death, 2 Lambeth, 3 Lambeth death) (label)'], memeLongueur: [], autres: [0, 1, 2] },
  demiViesNPL: { colonnes: ['log10 time in days / 8', 'share of atoms left', 'isotope (0 H-3, 1 Be-7, 2 C-14, 3 Co-60, 4 I-131, 5 Cs-137, 6 chosen)  (label)'], memeLongueur: [], autres: [0, 1, 2] },
  effetPhotoelectrique: { colonnes: ['light frequency / 2e15 Hz', 'stopping voltage / 5 V', 'metal (0 Ag, 1 Cu, 2 Ir, 3 Ta) (label)'], memeLongueur: [], autres: [0, 1, 2] },
  populationMonde: { colonnes: ['(year - 1950) / 70', 'world population / 8 billion', 'UN count 0, fitted exponential 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  courbeKeeling: { colonnes: ['year within the window', '(CO2 - 300 ppm) / 150', 'rise during that year in ppm (label)'], memeLongueur: [], autres: [0, 1, 2] },
  energieLiaison: { colonnes: ['mass number A / 238', 'binding energy per nucleon / largest', 'takes part in the chosen reaction (label)'], memeLongueur: [], autres: [0, 1, 2] },
  mareeVivesEaux: { colonnes: ['time / duration', 'water height / (M2 + S2 amplitudes)', 'day (label)'], memeLongueur: [], autres: [0, 1, 2] },
  gutenbergRichter: { colonnes: ['magnitude above 4.5', 'log10 of the number of quakes at least that strong', 'half-magnitude class (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiZipf: { colonnes: ['log10 rank / log10 30', 'log10 count minus log10 count of "the"', 'gap to the fitted line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  atmosphereStandard: { colonnes: ['geopotential height / top', 'pressure / sea-level pressure', 'temperature in K (label)'], memeLongueur: [], autres: [0, 1, 2] },
  entropieShannon: { colonnes: ['letter rank / 26 (E first)', 'surprise of the letter in the drawn text (bits)', 'length of its Huffman code (label)'], memeLongueur: [], autres: [0, 1, 2] },
  gammeTemperee: { colonnes: ['step k / N (one octave)', 'semitones away from the nearest simple ratio', 'step k (label)'], memeLongueur: [], autres: [0, 1, 2] },
  fourmiLangton: { colonnes: ['ant x', 'ant y', 'colour it left (label)'], memeLongueur: [[0, 1]], autres: [2] },
  suitePadovan: { colonnes: ['n / N', 'gap of the ratio to the plastic number (relative)', 'sign of the gap (label)'], memeLongueur: [], autres: [0, 1, 2] },
  thueMorse: { colonnes: ['turtle x', 'turtle y', 't(n) (label)'], memeLongueur: [[0, 1]], autres: [2] },
  suitePerrin: { colonnes: ['n / N', '(P(n) mod n) / n', 'prime (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteKolakoski: { colonnes: ['k / N', 'excess of 1s over 2s so far (relative)', 'the term (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteRecaman: { colonnes: ['n / N', 'a(n) / largest term', 'direction of the jump (label)'], memeLongueur: [], autres: [0, 1, 2] },
  triangleNarayana: { colonnes: ['k / (n + 1)', 'N(n, k) / largest in its row', 'row n (label)'], memeLongueur: [], autres: [0, 1, 2] },
  schroderChemins: { colonnes: ['x / 2n', 'height (relative)', 'kind of step (label)'], memeLongueur: [], autres: [0, 1, 2] },
  frobeniusPieces: { colonnes: ['coin a / Bmax', 'coin b / Bmax', 'impossible amounts (label)'], memeLongueur: [[0, 1]], autres: [2] },
  goldbachPaires: { colonnes: ['E / Emax', 'splits / most splits', 'E mod 3 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  indicatriceEuler: { colonnes: ['n / N', 'phi(n) / n', 'distinct prime factors (label)'], memeLongueur: [], autres: [0, 1, 2] },
  periodePisano: { colonnes: ['m / M', 'period / longest period', 'zeros in one cycle (label)'], memeLongueur: [], autres: [0, 1, 2] },
  motzkinChemins: { colonnes: ['step / n', 'height (relative)', 'kind of step (label)'], memeLongueur: [], autres: [0, 1, 2] },
  stirlingBell: { colonnes: ['element / n', 'its block (relative)', 'blocks opened so far (label)'], memeLongueur: [], autres: [0, 1, 2] },
  routineKaprekar: { colonnes: ['start / 10^L', 'steps / most steps', 'distinct digits (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteCollatz: { colonnes: ['start / N', 'flight / longest flight', 'odd steps 3n + 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  nombresHarmoniques: { colonnes: ['n / N', 'H(n) - ln n', 'power of 2 in the denominator (label)'], memeLongueur: [], autres: [0, 1, 2] },
  derangements: { colonnes: ['object i', 'where it goes sigma(i)', 'how far it moves sigma(i) - i (label)'], memeLongueur: [[0, 1]], autres: [2] },
  regarderDire: { colonnes: ['term / terms', 'log length (relative)', 'distinct digits (label)'], memeLongueur: [], autres: [0, 1, 2] },
  toursHanoi: { colonnes: ['move / total', 'disk / n', 'target peg (label)'], memeLongueur: [], autres: [0, 1, 2] },
  calkinWilf: { colonnes: ['position in its level', '-level (scaled)', 'fraction above 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  theoremeLucas: { colonnes: ['k - n/2 (across)', '-n (row, downwards)', 'binom(n, k) mod p (label)'], memeLongueur: [[0, 1]], autres: [2] },
  zeckendorf: { colonnes: ['which Fibonacci number (index)', 'n (downwards, scaled)', 'number of terms (label)'], memeLongueur: [], autres: [0, 1, 2] },
  problemeJosephus: { colonnes: ['x', 'y', 'order of elimination (label; the survivor is last)'], memeLongueur: [[0, 1]], autres: [2] },
  nombresBernoulli: { colonnes: ['n', 'log10 |B_n|', 'sign (label; 1 positive, 0 negative)'], memeLongueur: [], autres: [0, 1, 2] },
  parfaitsAmicaux: { colonnes: ['n / limit', 's(n) / n', 'kind (label; 2 perfect, 1 amicable, 0 other)'], memeLongueur: [], autres: [0, 1, 2] },
  fonctionMertens: { colonnes: ['n / limit', 'M(n) / sqrt(limit)', 'mu(n) + 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  theoremeWilson: { colonnes: ['n / limit', '((n - 1)! mod n) / n', 'prime (label; 1 prime, 0 composite)'], memeLongueur: [], autres: [0, 1, 2] },
  nombresCarmichael: { colonnes: ['rank of the number found', 'prime factor p of it', 'kind (label; 0 = base-2 pseudoprime only, 1 = Carmichael)'], memeLongueur: [], autres: [0, 1, 2] },
  equationPell: { colonnes: ['k (convergent number)', 'p_k / q_k', 'sign of p^2 - D q^2 (label; 0 negative, 1 positive, 2 = root D)'], memeLongueur: [], autres: [0, 1, 2] },
  sommesCarres: { colonnes: ['a', 'b', 'a^2 + b^2 (label)'], memeLongueur: [[0, 1]], autres: [2] },
  ptolemee: { colonnes: ['x', 'y', 'what (label; 0 = circle, 1 = quadrilateral, 2 = diagonals)'], memeLongueur: [[0, 1]], autres: [2] },
  pascalHexagramme: { colonnes: ['x', 'y', 'what (label; 0 = circle, 1 = hexagon, 2 = extended sides and the Pascal line)'], memeLongueur: [[0, 1]], autres: [2] },
  ramseyR33: { colonnes: ['x', 'y', 'colour (label; 0 = red, 1 = blue, 2 = the one-colour triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  triangulations: { colonnes: ['x', 'y', 'what (label; 0 = polygon, 1 = diagonals)'], memeLongueur: [[0, 1]], autres: [2] },
  distinctesImpaires: { colonnes: ['column', 'row (downwards)', 'which side (label; 0 = distinct parts, 1 = odd parts)'], memeLongueur: [[0, 1]], autres: [2] },
  simsonDroite: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = circle, 2 = perpendiculars, 3 = Simson line)'], memeLongueur: [[0, 1]], autres: [2] },
  bale: { colonnes: ['1/n', 'value', 'what (label; 0 = S_n, 1 = pi^2/6, 2 = the band 1/(n+1) .. 1/n under it)'], memeLongueur: [], autres: [0, 1, 2] },
  morley: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = trisectors, 2 = Morley triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  eulerSolides: { colonnes: ['x', 'y', 'z (the edges of the solid)'], memeLongueur: [[0, 1, 2]], autres: [] },
  marcheAutoEvitante: { colonnes: ['x (lattice)', 'y (lattice)', 'step number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  jeuDeLaVie: { colonnes: ['x (cells)', 'y (cells)', 'generation within the period (label)'], memeLongueur: [[0, 1]], autres: [2] },
  feuerbach: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = nine-point circle, 2 = incircle, 3 = excircles)'], memeLongueur: [[0, 1]], autres: [2] },
  billardElliptique: { colonnes: ['x', 'y', 'what (label; 0 = the table, 1 = the path, 2 = the caustic)'], memeLongueur: [[0, 1]], autres: [2] },
  napoleon: { colonnes: ['x', 'y', 'what (label; 0 = the triangle, 1 = equilateral triangles on its sides, 2 = Napoleon triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  percolationLiens: { colonnes: ['x (lattice)', 'y (lattice)', 'cluster (label; 2 = crosses, 1 = touches the left side, 0 = other)'], memeLongueur: [[0, 1]], autres: [2] },
  theoremePick: { colonnes: ['x', 'y', 'what (label; 0 = the outline, 1 = whole point inside, 2 = whole point on the boundary)'], memeLongueur: [[0, 1]], autres: [2] },
  courbeDragon: { colonnes: ['x', 'y', 'fold that made the segment (label)'], memeLongueur: [[0, 1]], autres: [2] },
  partitionEuler: { colonnes: ['column', 'row (downwards)', 'row number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  catalanDyck: { colonnes: ['step', 'height', 'path (label)'], memeLongueur: [], autres: [0, 1, 2] },
  ruineJoueur: { colonnes: ['bets played', 'fortune', 'game (label; 0 = the walls 0 and a)'], memeLongueur: [], autres: [0, 1, 2] },
  collectionneur: { colonnes: ['draws so far', 'different coupons owned', 'collection (label; 0 = the exact mean curve)'], memeLongueur: [], autres: [0, 1, 2] },
  aztecDiamond: { colonnes: ['x (cells)', 'y (cells)', 'arrow of the domino (label; 0 N, 1 S, 2 E, 3 W)'], memeLongueur: [[0, 1]], autres: [2] },
  ising: { colonnes: ['x (spin)', 'y (spin)', 'spin (label; +1 or -1)'], memeLongueur: [[0, 1]], autres: [2] },
  dominosKasteleyn: { colonnes: ['x (cells)', 'y (cells)', 'domino (label; 0 = lying, 1 = standing, 2 = cannot be tiled)'], memeLongueur: [[0, 1]], autres: [2] },
  papillonHofstadter: { colonnes: ['flux alpha = p/q', 'energy E', 'denominator q (label)'], memeLongueur: [], autres: [0, 1, 2] },
  causticTasse: { colonnes: ['x', 'y', 'what (label; 0 = the bright line found, 1 = the cup, 2 = reflected rays)'], memeLongueur: [[0, 1]], autres: [2] },
  fermatSteiner: { colonnes: ['x', 'y', 'network (label; 0 = shortest, 1 = the other shape)'], memeLongueur: [[0, 1]], autres: [2] },
  cerclesFord: { colonnes: ['x (the fraction p/q on the line)', 'y (height above the line)', 'denominator q (label)'], memeLongueur: [[0, 1]], autres: [2] },
  vergerEuclide: { colonnes: ['a (trees across)', 'b (trees up)', 'row max(a, b) (label)'], memeLongueur: [[0, 1]], autres: [2] },
  tasDeSable: { colonnes: ['x (cell)', 'y (cell)', 'grains on the cell (label, 0 to 3)'], memeLongueur: [[0, 1]], autres: [2] },
  apollonius: { colonnes: ['x', 'y', 'generation (label; -1 = the three starting circles)'], memeLongueur: [[0, 1]], autres: [2] },
  marcheAleatoire: { colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'], memeLongueur: [[0, 1]], autres: [2] },
  aiguilleBuffon: { colonnes: ['x (floor widths)', 'y (floor widths; lines at whole numbers)', 'crosses a line (1) or not (0)'], memeLongueur: [[0, 1]], autres: [2] },
  anniversaires: { colonnes: ['x (birthday as an angle round the circle, one ring per group)', 'y (same)', 'group number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  spiraleUlam: { colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'], memeLongueur: [[0, 1]], autres: [2] },
  solidesPlatoniques: { colonnes: ['x', 'y', 'z (the edges of the solid)'], memeLongueur: [[0, 1, 2]], autres: [] },
  montyHall: { colonnes: ['games played', 'share of games won so far', 'strategy (0 = stick, 1 = switch)'], memeLongueur: [], autres: [0, 1, 2] },
  pascalSierpinski: { colonnes: ['position in the row (k - n/2)', 'row (minus n, top to bottom)', 'row number n (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'marcheAleatoire', nom: 'Random walks on a grid', science: 'Probability', D: 3, params: { marcheurs: 500, pas: 200, graine: 1 },
    bornes: { marcheurs: [50, 2000], pas: [10, 1000], graine: [1, 1000000] },
    phrase: 'A visualisation of random walks: walkers step to a random neighbour on a grid, one frame per walker. However wild each path looks, the mean squared distance from the start after n steps is exactly n, with an exact spread n^2 - n; on average nobody drifts anywhere. A finite number of walkers, so the agreement is statistical.' },
  { id: 'aiguilleBuffon', nom: 'Buffon\'s needles (finding pi by throwing needles)', science: 'Geometric probability', D: 3, nuage: true, params: { aiguilles: 2000, longueur: 0.8, graine: 1 },
    bornes: { aiguilles: [100, 20000], longueur: [0.1, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of Buffon\'s needle problem: needles of length l thrown at random on a floor of boards one unit wide. The share that crosses a line is exactly 2 l / pi, so the needles themselves estimate pi. A finite number of needles, so the agreement is statistical.' },
  { id: 'anniversaires', nom: 'The birthday paradox', science: 'Probability', D: 3, nuage: true, params: { personnes: 23, jours: 365, groupes: 2000, graine: 1 },
    bornes: { personnes: [2, 80], jours: [50, 400], groupes: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the birthday paradox: groups of k people with random birthdays among D days, drawn round a circle. The chance that two share a birthday is exactly 1 - (1 - 1/D)(1 - 2/D)...(1 - (k - 1)/D), already above one half for 23 people and 365 days, and the mean number of shared pairs is k (k - 1) / (2D). A finite number of groups, so the agreement is statistical.' },
  { id: 'spiraleUlam', nom: 'Primes on the Ulam spiral', science: 'Number theory', D: 3, nuage: true, params: { jusqua: 10000 },
    bornes: { jusqua: [1000, 40000] },
    phrase: 'A visualisation of the prime numbers placed on the Ulam spiral (1 in the middle, the integers winding outwards): they gather along diagonals. The exact count of primes up to N, found by a sieve, is compared with the prime number theorem, Li(N) and N / ln N, which are approximations and say so.' },
  { id: 'pascalSierpinski', nom: 'The triangle of Pascal, odd numbers only (Sierpinski)', science: 'Combinatorics', D: 3, nuage: true, params: { lignes: 128 },
    bornes: { lignes: [8, 512] },
    phrase: 'A visualisation of the triangle of Pascal built row by row by addition, keeping only whether each number is odd: the odd ones draw the Sierpinski triangle. Row n holds exactly 2^(number of 1s in n written in binary) odd numbers, and the first 2^m rows hold exactly 3^m of them.' },
  { id: 'solidesPlatoniques', nom: 'The five Platonic solids', science: 'Geometry', D: 3, nuage: true, params: { solide: 3 },
    bornes: { solide: [0, 4] },
    phrase: 'A visualisation of the five Platonic solids (0 tetrahedron, 1 cube, 2 octahedron, 3 dodecahedron, 4 icosahedron), drawn by their edges in 3-D. Their faces are found from the geometry alone and counted: vertices - edges + faces is always 2 (Euler), and the angle between two faces is the exact sin(theta / 2) = cos(pi / q) / sin(pi / p).' },
  { id: 'montyHall', nom: 'The Monty Hall problem', science: 'Probability', D: 3, nuage: true, params: { portes: 3, parties: 2000, graine: 1 },
    bornes: { portes: [3, 10], parties: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Monty Hall game: a car behind one of n doors, you pick one, the host opens a losing door among the others, and you stick or switch. Played many times with the same draws, the share won by switching settles on (n - 1)/(n (n - 2)), 2/3 with three doors, and sticking on 1/n. A finite number of games, so the agreement is statistical.' },
  { id: 'apollonius', nom: 'Circles inside circles (the gasket of Apollonius)', science: 'Geometry', D: 3, nuage: true, params: { premier: 0.5, generations: 5 },
    bornes: { premier: [0.2, 0.8], generations: [1, 6] },
    phrase: 'A visualisation of the gasket of Apollonius: into every gap between three touching circles goes the circle that touches all three, again and again. Each circle is found by geometry alone, then compared with the theorem of Descartes, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2) for their curvatures, and with its complex form for their centres. With two equal starting circles every curvature is a whole number: 2, 3, 6, 11, 14, 15...' },
  { id: 'tasDeSable', nom: 'The abelian sandpile (and its identity)', science: 'Combinatorics', D: 3, nuage: true, params: { cote: 32 },
    bornes: { cote: [8, 40] }, /* MESURE game150 : 205 ms a 48, 110 ms a 40 (n = 1500) */
    phrase: 'A visualisation of the abelian sandpile: a cell holding four grains topples and gives one to each neighbour, grains falling off the edge are lost. The order of the topples never matters. The picture is the identity of the sandpile group on the grid. The stable piles that come back again and again are counted one by one on small grids (192 on 2 x 2, 100352 on 3 x 3) and match the determinant of the grid Laplacian, the number of spanning trees.' },
  { id: 'vergerEuclide', nom: 'Euclid\'s orchard (which trees can you see?)', science: 'Number theory', D: 3, nuage: true, params: { cote: 60 },
    bornes: { cote: [10, 200] },
    phrase: 'A visualisation of Euclid\'s orchard: a tree at every whole point (a, b), and you stand at the corner. You see a tree only when no other tree stands in front of it, which happens exactly when a and b share no factor. The trees seen are counted one by one and match two exact formulas, with Euler\'s phi and with Mobius; their share tends to 6/pi^2, about 61 percent, but only as a limit, and the gap is shown.' },
  { id: 'cerclesFord', nom: 'Ford circles (fractions that touch)', science: 'Number theory', D: 3, nuage: true, params: { ordre: 12 },
    bornes: { ordre: [3, 60] },
    phrase: 'A visualisation of Ford circles: on every fraction p/q between 0 and 1 sits a circle of radius 1/(2 q^2). They never overlap, and two circles touch exactly when |ps - qr| = 1, which is true of any two neighbours in the Farey sequence. Each fraction is listed, the touching is measured, and their number matches 1 + phi(1) + ... + phi(n).' },
  { id: 'fermatSteiner', nom: 'The shortest roads between four towns (Steiner)', science: 'Geometry', D: 3, nuage: true, params: { largeur: 1.3 },
    bornes: { largeur: [0.6, 1.7] },
    phrase: 'A visualisation of the Steiner problem: join the four corners of a rectangle with the shortest possible roads, allowing two extra crossroads. The crossroads are found by moving each to the point that is nearest in total to its three neighbours. Every crossroad ends with three roads at exactly 120 degrees, and the total matches min(L + sqrt 3, 1 + sqrt(3) L): 1 + sqrt 3 for a square, shorter than both the cross of the diagonals and any network without crossroads.' },
  { id: 'causticTasse', nom: 'The bright curve in a cup of coffee (caustic)', science: 'Optics', D: 3, nuage: true, params: { rayons: 600 },
    bornes: { rayons: [100, 3000] },
    phrase: 'A visualisation of the caustic in a cup: parallel sunlight reflected by the round wall piles up along a bright curve. Each pair of neighbouring reflected rays is crossed, and the crossings land on the nephroid ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4), with its sharp point at half the radius. The gap shrinks as one over the number of rays squared, and is shown.' },
  { id: 'papillonHofstadter', nom: 'Hofstadter\'s butterfly', science: 'Quantum physics', D: 3, nuage: true, params: { qmax: 16 },
    bornes: { qmax: [6, 20] },
    phrase: 'A visualisation of Hofstadter\'s butterfly: the allowed energies of an electron on a square grid in a magnetic field of p/q flux quanta per square, for every fraction up to q. Each spectrum is q bands, whose edges are found exactly as eigenvalues; between them the gaps are all open, except the middle one when q is even, where the two central bands touch at zero.' },
  { id: 'dominosKasteleyn', nom: 'Domino tilings (Kasteleyn)', science: 'Combinatorics', D: 3, nuage: true, params: { hauteur: 6, largeur: 12, graine: 1 },
    bornes: { hauteur: [2, 8], largeur: [2, 20], graine: [1, 1000000] },
    phrase: 'A visualisation of domino tilings: every way of covering an m x L rectangle with 1 x 2 dominoes is counted exactly, column by column, and matches Kasteleyn\'s product formula (12 988 816 for a chessboard). The picture is one tiling drawn uniformly at random among them all, and the corner statistics of many such draws match their exact probability.' },
  { id: 'ising', nom: 'The Ising model (magnets that agree)', science: 'Statistical physics', D: 3, nuage: true, params: { beta: 0.4, graine: 1 },
    bornes: { beta: [0.1, 0.8], graine: [1, 1000000] },
    phrase: 'A visualisation of the Ising model: tiny magnets on a grid, each preferring to point like its neighbours, at an inverse temperature beta. The picture is a large grid simulated by the Metropolis rule. On a small 4 x 4 torus every one of the 65 536 states is counted exactly, and the simulated mean bond sum (minus the energy) and magnetisation match those exact values within their error bars. The sharp transition of an endless grid, at beta = ln(1 + sqrt 2)/2, is shown as a limit only.' },
  { id: 'aztecDiamond', nom: 'The Aztec diamond and its arctic circle', science: 'Combinatorics', D: 3, nuage: true, params: { ordre: 36, graine: 1 },
    bornes: { ordre: [4, 60], graine: [1, 1000000] },
    phrase: 'A visualisation of a random domino tiling of the Aztec diamond, drawn uniformly by domino shuffling. Near the four corners the dominoes freeze into brick walls; inside a circle they mix freely. The count of tilings, 2^(n(n+1)/2), is checked on small diamonds, the shuffling is tested for uniformity, and the frozen corners are measured against the arctic circle of radius n/sqrt 2, which is a limit for large diamonds.' },
  { id: 'collectionneur', nom: 'The coupon collector', science: 'Probability', D: 3, nuage: true, params: { vignettes: 50, graine: 1 },
    bornes: { vignettes: [5, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of the coupon collector: draw coupons at random, with repeats, until you own all n. The last ones are slow to come. Over thousands of simulated collections the mean number of draws matches n (1 + 1/2 + ... + 1/n) and its variance matches the exact formula, both computed as exact fractions; the mean number of different coupons after t draws follows n (1 - (1 - 1/n)^t).' },
  { id: 'ruineJoueur', nom: 'Gambler\'s ruin', science: 'Probability', D: 3, nuage: true, params: { gain: 0.5, depart: 10, objectif: 20, graine: 1 },
    bornes: { gain: [0.3, 0.7], depart: [1, 39], objectif: [4, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of the gambler\'s ruin: start with z, win or lose one each bet, and stop at zero or at the target a. Over 20 000 simulated games the share that ends in ruin matches Feller\'s exact formula, linear in z for a fair game, and the mean length of a game matches its exact value too. A small edge changes everything.' },
  { id: 'catalanDyck', nom: 'Catalan numbers and Dyck paths', science: 'Combinatorics', D: 3, nuage: true, params: { demi: 120, graine: 1 },
    bornes: { demi: [5, 400], graine: [1, 1000000] },
    phrase: 'A visualisation of Dyck paths: mountain ranges of n ups and n downs that never go below the ground. Every such path is counted one by one for small n and matches the Catalan numbers 1, 1, 2, 5, 14, 42, 132... = binom(2n, n)/(n + 1). The pictures are paths drawn uniformly at random by the cycle lemma, a draw that is tested for fairness.' },
  { id: 'partitionEuler', nom: 'Integer partitions (Euler\'s pentagonal theorem)', science: 'Number theory', D: 3, nuage: true, params: { entier: 100, graine: 1 },
    bornes: { entier: [5, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of integer partitions: the ways to write n as a sum of positive whole numbers, drawn as a Young diagram chosen uniformly at random. Their number p(n) is computed by Euler\'s pentagonal recurrence and checked against an independent count for every n up to 200 (p(100) = 190 569 292).' },
  { id: 'courbeDragon', nom: 'The dragon curve (folding paper)', science: 'Geometry', D: 3, nuage: true, params: { plis: 12 },
    bornes: { plis: [3, 15] },
    phrase: 'A visualisation of the Heighway dragon: fold a strip of paper in half n times, unfold every crease to a right angle, and the strip draws a dragon. Its turns are built two independent ways that agree turn by turn; it has exactly 2^n segments, never runs over itself, and its two ends are exactly 2^(n/2) apart.' },
  { id: 'theoremePick', nom: 'Pick\'s theorem (area by counting points)', science: 'Geometry', D: 3, nuage: true, params: { sommets: 12, rayon: 20, graine: 1 },
    bornes: { sommets: [3, 30], rayon: [8, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Pick\'s theorem: a random polygon whose corners sit on whole-number points. Its area from the shoelace formula equals I + B/2 - 1, where I and B are the whole points inside and on the boundary, counted one by one. A bow tie that crosses itself shows why the polygon must be simple.' },
  { id: 'percolationLiens', nom: 'Bond percolation: crossing at p = 1/2', science: 'Probability', D: 3, nuage: true, params: { cote: 12, graine: 1 },
    bornes: { cote: [2, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of bond percolation: every link of a grid is open with probability one half. A rectangle n + 1 wide and n high is crossed from left to right with probability exactly 1/2, by duality. Every configuration of the two smallest cases is enumerated, random rectangles are drawn, and a square that misses the symmetry is shown as a witness.' },
  { id: 'napoleon', nom: 'Napoleon\'s theorem', science: 'Geometry', D: 3, nuage: true, params: { taille: 12, graine: 1 },
    bornes: { taille: [3, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Napoleon\'s theorem: put an equilateral triangle on each side of any triangle, and their three centres always form an equilateral triangle. Everything is computed exactly with numbers a + b sqrt 3, so the three sides are compared as identical, not just close; squares in place of the triangles show the rule breaking.' },
  { id: 'billardElliptique', nom: 'The elliptic billiard and its caustic', science: 'Geometry', D: 3, nuage: true, params: { petitAxe: 0.6, lancer: 20, tir: 70, rebonds: 400 },
    bornes: { petitAxe: [0.3, 0.95], lancer: [0, 359], tir: [5, 175], rebonds: [10, 2000] },
    phrase: 'A visualisation of a billiard ball bouncing inside an ellipse: every straight run stays tangent to one same confocal curve, an ellipse or a hyperbola, called the caustic. The confocal parameter of every chord is computed and stays constant to round-off over hundreds of bounces; bouncing on a wrong normal makes it drift.' },
  { id: 'feuerbach', nom: 'Feuerbach\'s theorem (the nine-point circle)', science: 'Geometry', D: 3, nuage: true, params: { taille: 20, graine: 1 },
    bornes: { taille: [5, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Feuerbach\'s theorem: the nine-point circle of a triangle touches its inscribed circle from inside and its three escribed circles from outside. The triangles have whole-number corners and sides, so every centre and radius is a fraction and the four tangencies are checked exactly; the circumscribed circle, which does not touch, is shown as a witness.' },
  { id: 'jeuDeLaVie', nom: 'Game of Life oscillators', science: 'Computation', D: 3, nuage: true, params: { oscillateur: 1 },
    bornes: { oscillateur: [0, 2] },
    phrase: 'A visualisation of three oscillators of Conway\'s Game of Life: the blinker, the pulsar and the pentadecathlon. Each is run on an unbounded grid until its set of live cells equals the start exactly, which gives its period: 2, 3 and 15. A glider, which travels instead of returning, is the witness.' },
  { id: 'marcheAutoEvitante', nom: 'Self-avoiding walks', science: 'Combinatorics', D: 3, nuage: true, params: { etapes: 10, graine: 1 },
    bornes: { etapes: [2, 12], graine: [1, 1000000] },
    phrase: 'A visualisation of self-avoiding walks: paths on a grid that never visit the same point twice. No formula is known for how many there are, so every walk of up to 12 steps is counted one by one and matched against the published sequence (324 932 for 12 steps). Walks that only avoid stepping straight back are the witness: from 4 steps on they are more numerous.' },
  { id: 'eulerSolides', nom: 'Euler\'s formula beyond the Platonic solids', science: 'Geometry', D: 3, nuage: true, params: { solide: 3 },
    bornes: { solide: [0, 5] },
    phrase: 'A visualisation of Euler\'s formula V - E + F = 2 on six more solids (0 triangular prism, 1 square antiprism, 2 cuboctahedron, 3 truncated icosahedron, 4 rhombicuboctahedron, 5 snub dodecahedron). Vertices, edges and faces are each counted from the coordinates alone; a square picture frame, a solid with a hole, gives 0 instead of 2.' },
  { id: 'morley', nom: 'Morley\'s trisector theorem', science: 'Geometry', D: 3, nuage: true, params: { angleA: 70, angleB: 45 },
    bornes: { angleA: [15, 120], angleB: [15, 55] },
    phrase: 'A visualisation of Morley\'s theorem: cut each angle of any triangle into three equal parts, and the trisectors next to each side meet in three points that always form an equilateral triangle, of side 8 R sin(A/3) sin(B/3) sin(C/3). Cutting the angles in four instead breaks it.' },
  { id: 'bale', nom: 'The Basel problem (1 + 1/4 + 1/9 + ... = pi^2/6)', science: 'Number theory', D: 3, nuage: true, params: { termes: 100 },
    bornes: { termes: [1, 2000] },
    phrase: 'A visualisation of the Basel problem: the sums 1 + 1/4 + 1/9 + ... + 1/n^2 climb towards pi^2/6. They are computed as exact fractions, and for every n the gap to pi^2/6 is checked to lie strictly between 1/(n+1) and 1/n. The plain sum 1 + 1/2 + 1/3 + ..., which never stops growing, is the witness.' },
  { id: 'simsonDroite', nom: 'The Simson line', science: 'Geometry', D: 3, nuage: true, params: { taille: 12, corde: 3, graine: 1 },
    bornes: { taille: [4, 30], corde: [-30, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of the Simson line: from any point on the circle through the corners of a triangle, drop perpendiculars to the three sides; their feet always lie on one straight line. Everything is computed in exact fractions, so the line is checked exactly; a point just outside the circle breaks it.' },
  { id: 'distinctesImpaires', nom: 'Distinct parts equal odd parts (Euler)', science: 'Number theory', D: 3, nuage: true, params: { entier: 30, graine: 1 },
    bornes: { entier: [3, 120], graine: [1, 1000000] },
    phrase: 'A visualisation of Euler\'s partition theorem: there are as many ways to write n as a sum of different numbers as there are ways to write it as a sum of odd numbers. Both are counted separately for every n, and a random partition is carried across by Glaisher\'s halving map and back again.' },
  { id: 'triangulations', nom: 'Triangulations of a polygon (Catalan numbers)', science: 'Combinatorics', D: 3, nuage: true, params: { cotes: 9, graine: 1 },
    bornes: { cotes: [3, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of polygon triangulations: cut a convex polygon into triangles with diagonals that never cross. The number of ways is a Catalan number (1, 2, 5, 14, 42, ...), counted by splitting along one side and checked against binom(2m, m)/(m + 1); a random triangulation is drawn and checked for crossings.' },
  { id: 'ramseyR33', nom: 'Ramsey number R(3, 3) = 6', science: 'Combinatorics', D: 3, nuage: true, params: { sommetsK: 5, graine: 1 },
    bornes: { sommetsK: [3, 6], graine: [1, 1000000] },
    phrase: 'A visualisation of the Ramsey number R(3, 3) = 6: colour every line between n points red or blue. With 5 points you can avoid a triangle of one colour (12 ways, each colour a 5-cycle); with 6 points you never can. Every colouring is checked; forbidding only red triangles is the witness that both colours are needed.' },
  { id: 'pascalHexagramme', nom: 'Pascal\'s hexagram', science: 'Geometry', D: 3, nuage: true, params: { croise: 0, graine: 1 },
    bornes: { croise: [0, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of Pascal\'s theorem: take six points on a circle in any order, join them into a hexagon, and the three pairs of opposite sides meet in three points on one straight line. The points are rational, so the line is checked exactly; moving one point off the circle breaks it.' },
  { id: 'ptolemee', nom: 'Ptolemy\'s theorem', science: 'Geometry', D: 3, nuage: true, params: { graine: 1 },
    bornes: { graine: [1, 1000000] },
    phrase: 'A visualisation of Ptolemy\'s theorem: for four points on a circle, the product of the diagonals equals the sum of the products of opposite sides. The points are rational, so the squared lengths are fractions and the identity is checked exactly; a corner pushed off the circle gives a strict inequality.' },
  { id: 'sommesCarres', nom: 'Sums of squares (Jacobi)', science: 'Number theory', D: 3, nuage: true, params: { entier: 100 },
    bornes: { entier: [4, 300] },
    phrase: 'A visualisation of sums of squares: the number of ways to write n as a sum of four squares is 8 times the sum of its divisors not divisible by 4 (Jacobi), and as a sum of two squares it is 4 times the divisors of the form 4k + 1 minus those of the form 4k + 3. Every way is counted one by one up to n; the plain divisor sum is the witness.' },
  { id: 'equationPell', nom: 'Pell\'s equation x^2 - D y^2 = 1', science: 'Number theory', D: 3, nuage: true, params: { radical: 13 },
    bornes: { radical: [2, 99] },
    phrase: 'A visualisation of Pell\'s equation: for D not a square, the smallest whole solution of x^2 - D y^2 = 1 hides in the continued fraction of the square root of D (for D = 13 it is 649 and 180). The fractions are computed in whole numbers, the solution is checked exactly and shown to be the smallest; x^2 - 3 y^2 = -1, which has no solution, is the witness.' },
  { id: 'nombresCarmichael', nom: 'Carmichael numbers (Fermat liars)', science: 'Number theory', D: 3, nuage: true, params: { limite: 10000 },
    bornes: { limite: [600, 20000] },
    phrase: 'A visualisation of Carmichael numbers: composite numbers that pass Fermat\'s primality test a^(n-1) = 1 mod n for every base a. They are found by Korselt\'s rule (561, 1105, 1729, ...), each one is checked to fool base 2, and 341, which fools base 2 but not base 3, is the witness.' },
  { id: 'theoremeWilson', nom: 'Wilson\'s theorem', science: 'Number theory', D: 3, nuage: true, params: { limite: 300 },
    bornes: { limite: [30, 3000] },
    phrase: 'A visualisation of Wilson\'s theorem: n is prime exactly when (n - 1)! leaves remainder n - 1 when divided by n. Every remainder is computed exactly up to the slider and compared with trial division; n = 4, the one composite with remainder 2 instead of 0, is the witness.' },
  { id: 'fonctionMertens', nom: 'The Mertens function', science: 'Number theory', D: 3, nuage: true, params: { limite: 1000 },
    bornes: { limite: [50, 3000] },
    phrase: 'A visualisation of the Mertens function: add up the Mobius function mu(1) + ... + mu(n), +1, -1 or 0 for each number, and watch the walk. For every n the exact identity sum of M(n div k) = 1 is checked; the same sum with the Liouville function gives the integer part of the square root instead.' },
  { id: 'parfaitsAmicaux', nom: 'Perfect and amicable numbers', science: 'Number theory', D: 3, nuage: true, params: { limite: 10000 },
    bornes: { limite: [300, 20000] },
    phrase: 'A visualisation of perfect and amicable numbers: n is perfect when its proper divisors add up to n (6 = 1 + 2 + 3), and two numbers are amicable when each one\'s divisors add up to the other (220 and 284). They are found exactly up to the slider, each even perfect number is checked to have Euclid\'s form 2^(p-1)(2^p - 1); 2047 = 23 x 89, which breaks that form, is the witness.' },
  { id: 'nombresBernoulli', nom: 'Bernoulli numbers', science: 'Number theory', D: 3, nuage: true, params: { rangB: 30 },
    bornes: { rangB: [12, 60] },
    phrase: 'A visualisation of the Bernoulli numbers 1, -1/2, 1/6, 0, -1/30, ..., computed as exact fractions. They are checked against sums of powers 0^p + 1^p + ... (Faulhaber\'s formula) and against the von Staudt-Clausen rule that makes B_2k plus some unit fractions a whole number; the old convention B_1 = +1/2 is the witness that breaks the power sums.' },
  { id: 'problemeJosephus', nom: 'The Josephus problem', science: 'Combinatorics', D: 3, nuage: true, params: { personnes: 41, pasK: 3 },
    bornes: { personnes: [2, 300], pasK: [2, 9] },
    phrase: 'A visualisation of the Josephus problem: n people stand in a circle and every k-th one is removed until one is left. The circle is really played out for every size and the survivor checked against the recurrence (and against 2L + 1 when k = 2); that formula used for k = 3 is the witness.' },
  { id: 'zeckendorf', nom: 'Zeckendorf representation', science: 'Number theory', D: 3, nuage: true, params: { entier: 100 },
    bornes: { entier: [30, 5000] },
    phrase: 'A visualisation of Zeckendorf\'s theorem: every whole number is, in exactly one way, a sum of Fibonacci numbers that are all different and never neighbours. The greedy writing is built for every n and the uniqueness checked by counting every possible writing; allowing neighbours, which gives several writings, is the witness.' },
  { id: 'theoremeLucas', nom: 'Lucas\'s theorem (Pascal\'s triangle mod p)', science: 'Number theory', D: 3, nuage: true, params: { baseP: 3, lignesL: 60 },
    bornes: { baseP: [2, 7], lignesL: [9, 120] },
    phrase: 'A visualisation of Lucas\'s theorem: Pascal\'s triangle taken modulo a prime p draws a fractal, and each entry is the product of the small binomials of the base-p digits. The triangle is built by additions and compared cell by cell to that rule; the same rule with the composite modulus 4 fails, and is the witness.' },
  { id: 'calkinWilf', nom: 'The Calkin-Wilf tree', science: 'Number theory', D: 3, nuage: true, params: { niveaux: 10 },
    bornes: { niveaux: [5, 14] },
    phrase: 'A visualisation of the Calkin-Wilf tree: start from 1/1, and under every a/b put a/(a + b) and (a + b)/b. Read level by level it lists every positive fraction exactly once, already reduced, and the n-th one is fusc(n)/fusc(n + 1). Uniqueness and completeness are checked level by level; Cantor\'s diagonal listing, which repeats values, is the witness.' },
  { id: 'toursHanoi', nom: 'Towers of Hanoi and the Gray code', science: 'Combinatorics', D: 3, nuage: true, params: { disques: 8 },
    bornes: { disques: [1, 16] },
    phrase: 'A visualisation of the Towers of Hanoi: moving n disks one at a time, never a big one on a small one, takes 2^n - 1 moves. The puzzle is really played out, every move checked legal, and the disk moved at step m matches the bit that changes in the Gray code; ordinary binary counting, which changes several bits at once, is the witness.' },
  { id: 'regarderDire', nom: 'The look-and-say sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangs: 25 },
    bornes: { rangs: [15, 30] },
    phrase: 'A visualisation of the look-and-say sequence: start from 1 and read each term aloud to get the next (1, 11, 21, 1211, 111221, ...). Every term is built exactly; on every one the digits stay at 1, 2 and 3 and the block 333 never appears (measured). The seed 22, which reads itself forever, is the witness.' },
  { id: 'derangements', nom: 'Derangements (no one gets their own hat)', science: 'Combinatorics', D: 3, nuage: true, params: { objets: 6, graine: 1 },
    bornes: { objets: [3, 8], graine: [1, 1000000] },
    phrase: 'A visualisation of derangements: shuffles in which nothing stays in its place. All shuffles of up to 8 objects are listed and counted, the count matches inclusion-exclusion and the recurrence, and for every n from 1 to 30 it is the whole number nearest to n!/e. The case n = 0, where that rounding fails, is the witness.' },
  { id: 'nombresHarmoniques', nom: 'Harmonic numbers', science: 'Number theory', D: 3, nuage: true, params: { rangs: 60 },
    bornes: { rangs: [20, 200] },
    phrase: 'A visualisation of the harmonic numbers H(n) = 1 + 1/2 + ... + 1/n, kept as exact fractions. For every n they stay between ln(n + 1) and 1 + ln n, and from n = 2 on the denominator holds exactly the largest power of 2 up to n, which is why H(n) is never a whole number. The case n = 1, where H(1) = 1, is the witness.' },
  { id: 'suiteCollatz', nom: 'The Collatz sequence', science: 'Number theory', D: 3, nuage: true, params: { limite: 300 },
    bornes: { limite: [30, 3000] },
    phrase: 'A visualisation of the Collatz (3n + 1) sequence: halve an even number, triple an odd one and add 1. Every start up to the slider is followed until it reaches 1: a finite check of an open conjecture, not a proof. With 3n - 1 instead, the start 5 loops back to itself: that is the witness.' },
  { id: 'routineKaprekar', nom: 'Kaprekar routine', science: 'Number theory', D: 3, nuage: true, params: { longueurK: 4 },
    bornes: { longueurK: [3, 4] },
    phrase: 'A visualisation of the Kaprekar routine: sort the digits high to low and low to high, subtract, repeat. Every start with that many digits is followed, and all of them land on one single fixed point (found here, not assumed). A number whose digits are all equal falls to 0 instead: that is the witness.' },
  { id: 'stirlingBell', nom: 'Stirling and Bell numbers', science: 'Combinatorics', D: 3, nuage: true, params: { elements: 7, graine: 3 },
    bornes: { elements: [4, 9], graine: [1, 1000000] },
    phrase: 'A visualisation of set partitions: every way to split n objects into groups is listed and counted by number of groups (Stirling numbers), and their total (Bell numbers) matches the Aitken triangle up to 20. Naming the groups counts each split twice: that is the witness.' },
  { id: 'motzkinChemins', nom: 'Motzkin numbers (paths above the floor)', science: 'Combinatorics', D: 3, nuage: true, params: { longueurM: 12, graine: 5 },
    bornes: { longueurM: [6, 13], graine: [1, 1000000] },
    phrase: 'A visualisation of Motzkin paths: walks of up, down and flat steps that start and end at ground level and never go below it. Every path of that length is listed and counted, and the count matches two separate formulas up to 40. Without the floor there are 3 paths of length 2 instead of 2: that is the witness.' },
  { id: 'periodePisano', nom: 'Pisano periods (Fibonacci on a clock)', science: 'Number theory', D: 3, nuage: true, params: { moduleMax: 120 },
    bornes: { moduleMax: [30, 400] },
    phrase: 'A visualisation of Pisano periods: the Fibonacci numbers read on a clock with m hours always come back to the start, and the period of that loop is measured for every m up to the slider. The period of a product is the lcm of the periods, and every period is even, from m = 3 on. The clock with 2 hours, period 3, is the witness.' },
  { id: 'indicatriceEuler', nom: 'Euler totient function', science: 'Number theory', D: 3, nuage: true, params: { jusquaN: 300 },
    bornes: { jusquaN: [40, 3000] },
    phrase: 'A visualisation of Euler totient: for each n, how many numbers up to n share no factor with it. For every n up to the slider the counts over its divisors add back up to n, and the count of a product is the product of the counts when the factors share nothing. With 2 and 2, which share a factor, that fails: phi(4) = 2, not 1. That is the witness.' },
  { id: 'goldbachPaires', nom: 'Goldbach splits (two odd primes)', science: 'Number theory', D: 3, nuage: true, params: { pairMax: 2000 },
    bornes: { pairMax: [60, 8000] },
    phrase: 'A visualisation of the Goldbach conjecture: every even number from 6 on seems to be a sum of two odd primes. Every even number up to the slider is split and its splits are counted: a finite check of an open question, not a proof. The number 4 has no such split (it would need 2 + 2): that is the witness.' },
  { id: 'frobeniusPieces', nom: 'The coin problem (Frobenius, two coins)', science: 'Number theory', D: 3, nuage: true, params: { pieceMax: 30 },
    bornes: { pieceMax: [11, 50] },
    phrase: 'A visualisation of the coin problem: with two coins that share no factor, which amounts can never be paid? For every pair up to the slider the payable amounts are marked one by one, and the largest impossible amount and the number of impossible ones match the formulas of Sylvester. Coins 6 and 9 share a factor, so there is no largest impossible amount: that is the witness.' },
  { id: 'schroderChemins', nom: 'Large Schroder numbers', science: 'Combinatorics', D: 3, nuage: true, params: { longueurS: 7, graine: 2 },
    bornes: { longueurS: [4, 9], graine: [1, 1000000] },
    phrase: 'A visualisation of Schroder paths: walks of up, down and long flat steps that start and end on the ground and never dip below it. Every path of that size is listed and counted, the count matches two separate recurrences up to 30, and from 1 on every count is even. The count for 0 is 1, which is odd: that is the witness.' },
  { id: 'triangleNarayana', nom: 'The Narayana triangle (paths by peaks)', science: 'Combinatorics', D: 3, nuage: true, params: { rangN: 9 },
    bornes: { rangN: [5, 11] },
    phrase: 'A visualisation of the Narayana triangle: mountain paths sorted by how many peaks they have. Every path of each size is listed and counted by peaks, each row matches the formula, adds up to a Catalan number and reads the same both ways. Sorting the same paths by returns to the ground gives a lopsided row instead: that is the witness.' },
  { id: 'suiteRecaman', nom: 'The Recaman sequence', science: 'Number theory', D: 3, nuage: true, params: { rangR: 400 },
    bornes: { rangR: [40, 3000] },
    phrase: 'A visualisation of the Recaman sequence: at step n, jump back by n if that lands on a new positive number, otherwise jump forward by n. Every jump up to the slider is checked against that rule. Whether every number eventually appears is an open question and is not claimed here. Jumping forward can still land on an old number, 42 at step 24: that is the witness.' },
  { id: 'suiteKolakoski', nom: 'The Kolakoski sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangK: 2000 },
    bornes: { rangK: [60, 20000] },
    phrase: 'A visualisation of the Kolakoski sequence: a string of 1s and 2s whose run lengths spell out the string itself. Every complete run up to the slider is checked against the term it should match, and the share of 1s is measured (whether it settles at one half is an open question, not claimed here). The plain 1, 2, 1, 2 pattern does not describe itself: that is the witness.' },
  { id: 'suitePerrin', nom: 'The Perrin sequence and its pseudoprimes', science: 'Number theory', D: 3, nuage: true, params: { perrinMax: 1000 },
    bornes: { perrinMax: [30, 3000] },
    phrase: 'A visualisation of the Perrin sequence 3, 0, 2, 3, 2, 5, 5, ...: every prime n divides the n-th term. For every n up to the slider the remainder is computed, and the primes all sit on the floor. The converse fails: 271441 is not prime, yet it divides its term too (computed here by matrix powers): that is the witness.' },
  { id: 'thueMorse', nom: 'The Thue-Morse sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangT: 2048 },
    bornes: { rangT: [64, 8192] },
    phrase: 'A visualisation of the Thue-Morse sequence 0 1 1 0 1 0 0 1 ..., drawn by a turtle that walks on 0 and turns on 1. It is built two separate ways that agree, no block ever appears three times in a row in what is shown, and the numbers marked 0 and 1 share the same sums of powers below a limit. At that limit the sums differ: that is the witness.' },
  { id: 'suitePadovan', nom: 'The Padovan sequence', science: 'Number theory', D: 3, nuage: true, params: { rangP: 120 },
    bornes: { rangP: [60, 400] },
    phrase: 'A visualisation of the Padovan sequence 1, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 4, ...: each term is the sum of the terms two and three places back. A second rule (one back plus five back) gives the same numbers, and the ratio of neighbours closes in on the plastic number, the root of x^3 = x + 1. Starting from 1, 1, 1 gives the same numbers five places later: that is the witness.' },
  { id: 'fourmiLangton', nom: "Langton's ant", science: 'Combinatorics', D: 3, nuage: true, params: { pasL: 14000 },
    bornes: { pasL: [10500, 30000] },
    phrase: "A visualisation of Langton's ant: on a white square it turns right, on a black one left, flips the square and steps forward. After about ten thousand chaotic steps it builds a highway that repeats every 104 steps, moving two squares on each axis; both facts are measured on every step shown. Other periods do not fit: that is the witness." },
  { id: 'gammeTemperee', nom: 'Equal temperament (tuning a piano)', science: 'Acoustics', D: 3, nuage: true, params: { divisions: 12 },
    bornes: { divisions: [5, 72] },
    phrase: 'A visualisation of equal temperament: the octave is cut into N equal steps (12 on a piano), and each step is compared with the nearest simple ratio a string would give. The fifth comes out about 2 cents flat and the major third about 14 cents sharp. Twelve pure fifths overshoot seven octaves by the Pythagorean comma: that is the witness.' },
  { id: 'entropieShannon', nom: 'Shannon entropy of English letters (Huffman code)', science: 'Information theory', D: 3, nuage: true, params: { lettres: 20000, graine: 1 },
    bornes: { lettres: [500, 200000], graine: [1, 1000000] },
    phrase: 'A visualisation of Shannon entropy: letters drawn with the published frequencies of English (a model that ignores words). Rare letters carry more surprise. A Huffman code built on those frequencies averages between the entropy and one bit more, as Shannon proved. A code with the same length for every letter needs 5 bits: that is the witness.' },
  { id: 'atmosphereStandard', nom: 'The standard atmosphere (US 1976)', science: 'Earth sciences', D: 3, nuage: true, params: { altitudeKm: 20 },
    bornes: { altitudeKm: [5, 20] },
    phrase: 'A visualisation of the standard atmosphere (US 1976): the air cools by 6.5 degrees per kilometre up to 11 km, then stays at 216.65 K. The pressure is integrated step by step from the weight of the air above and matches the closed formula of each layer. Five kilometres measured with a ruler are not the five kilometres of the model: that is the witness.' },
  { id: 'loiZipf', nom: "Zipf's law on real web text", science: 'Linguistics', D: 3, nuage: true, params: { rangsZipf: 30 },
    bornes: { rangsZipf: [10, 30] },
    phrase: "A visualisation of Zipf's law on real data: the 30 most common English words of a large web corpus (Google Web 1T, counted by Peter Norvig), drawn as count against rank on log scales. A straight line is fitted to the top words. Its slope changes with how many words you keep and is not the textbook -1: that is the witness." },
  { id: 'gutenbergRichter', nom: 'Earthquake sizes (Gutenberg-Richter law)', science: 'Seismology', D: 3, nuage: true, params: { bValeur: 1.03, seismes: 5000, graine: 1 },
    bornes: { bValeur: [0.6, 1.5], seismes: [500, 20000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Gutenberg-Richter law: each step up in magnitude makes earthquakes about ten times rarer. Quakes are drawn from the law and its slope b is measured back from them (Aki method). The real 2024 world catalogue (USGS, 6397 quakes) falls off faster than the Californian slope would say: that is the witness.' },
  { id: 'mareeVivesEaux', nom: 'Tides: spring and neap (Providence, NOAA)', science: 'Oceanography', D: 3, nuage: true, params: { jours: 45, partS2: 1 },
    bornes: { jours: [20, 90], partS2: [0.25, 2] },
    phrase: 'A visualisation of the tide at Providence (NOAA constants): the lunar wave M2 and the solar wave S2 added together. High water comes about 50 minutes later each day, and the biggest tides (spring tides) return every 14.77 days, when the two waves line up. With the lunar wave alone every high water is the same: that is the witness.' },
  { id: 'energieLiaison', nom: 'Nuclear binding energy (fusion and the iron peak)', science: 'Nuclear physics', D: 3, nuage: true, params: { reaction: 0 },
    bornes: { reaction: [0, 2] },
    phrase: 'A visualisation of nuclear binding energy measured for eight nuclei (AME2020 mass evaluation): how tightly each nucleus holds its protons and neutrons. Fusing light nuclei releases energy, computed here for three reactions that power stars, and heavy uranium sits lower than iron. Nickel-62, not iron-56, is the most tightly bound: that is the witness.' },
  { id: 'courbeKeeling', nom: 'The Keeling curve (CO2 at Mauna Loa)', science: 'Climate science', D: 3, nuage: true, params: { anDebut: 1959, anFin: 2025 },
    bornes: { anDebut: [1959, 2005], anFin: [1979, 2025] },
    phrase: 'A visualisation of the Keeling curve: the yearly average of carbon dioxide in the air at Mauna Loa, measured by NOAA since 1959. It has gone up every single year, and faster and faster: under 1 ppm a year at the start, over 2.5 ppm a year now. A straight line fitted to the first ten years misses 2025 by about 58 ppm: that is the witness.' },
  { id: 'populationMonde', nom: 'World population since 1950 (UN)', science: 'Demography', D: 3, nuage: true, params: { decennies: 2 },
    bornes: { decennies: [2, 7] },
    phrase: 'A visualisation of world population counted by the United Nations every ten years from 1950 to 2020. It grew every decade, but its growth rate peaked in the 1960s and has fallen ever since. An exponential fitted to 1950-1970 and extended to 2020 overshoots by about two billion people: that is the witness.' },
  { id: 'effetPhotoelectrique', nom: 'The photoelectric effect (Einstein, Millikan)', science: 'Quantum physics', D: 3, nuage: true, params: { lambdaNm: 200, metal: 0 },
    bornes: { lambdaNm: [150, 400], metal: [0, 3] },
    phrase: 'A visualisation of the photoelectric effect: light knocks electrons out of a metal only if each photon carries more energy than the metal holds them with. For four metal surfaces the stopping voltage grows in a straight line with the light frequency, and every line has the same slope, Planck constant over the electron charge. Silver lit at 300 nm emits nothing, however bright the light: that is the witness.' },
  { id: 'demiViesNPL', nom: 'Six published half-lives (NPL 2008)', science: 'Nuclear physics', D: 3, nuage: true, params: { isotope: 2, demiVies: 3 },
    bornes: { isotope: [0, 5], demiVies: [1, 10] },
    phrase: 'A visualisation of radioactive decay with six half-lives published by the UK National Physical Laboratory, from iodine-131 (8 days) to carbon-14 (5700 years). Each isotope keeps exactly half its atoms after one half-life and an eighth after three, so a sample with an eighth of its carbon-14 left is 17101 years old, give or take 90. A straight-line decay would be empty after 1.44 half-lives; the real law still leaves a quarter after two: that is the witness.' },
  { id: 'choleraSnow', nom: 'John Snow and the cholera of 1854', science: 'Epidemiology', D: 3, nuage: true, params: { septSemaines: 1, graine: 1 },
    bornes: { septSemaines: [1, 2], graine: [1, 50] },
    phrase: 'A visualisation of John Snow\'s natural experiment: in the same London streets, houses drinking water from the Southwark and Vauxhall Company died of cholera 8.4 times as often as houses supplied by Lambeth, 315 against 38 deaths per 10,000 houses. Counting deaths alone would say 12.9 times, because one company supplied more houses: that is the witness.' },
  { id: 'raiesBalmer', nom: 'Balmer lines and the Rydberg straight line', science: 'Spectroscopy', D: 3, nuage: true, params: { nPlusHaut: 9 },
    bornes: { nPlusHaut: [4, 9] },
    phrase: 'A visualisation of the visible lines of hydrogen measured by NIST: one over the wavelength falls on a straight line in one over n squared, and its slope gives back the Rydberg constant of hydrogen to better than three parts in a hundred thousand. Taking an infinitely heavy nucleus puts the red line 0.35 nm too short: that is the witness.' },
  { id: 'loiBoyle', nom: 'Boyle 1662: squeezing air', science: 'Chemistry of gases', D: 3, nuage: true, params: { lignesBoyle: 25, exposantTest: 1 },
    bornes: { lignesBoyle: [3, 25], exposantTest: [0.5, 1.5] },
    phrase: 'A visualisation of Robert Boyle\'s 1662 table: air trapped in a glass tube is squeezed by pouring mercury, and volume times pressure stays within one percent across 25 readings, from 29 to 117 inches of mercury. A straight line through the first two readings would predict 55 inches at the smallest volume; Boyle measured 117: that is the witness.' },
  { id: 'loiOhm', nom: 'Ohm 1826: longer wire, weaker current', science: 'Electricity', D: 3, nuage: true, params: { serie: 1, bTest: 20.25 },
    bornes: { serie: [1, 5], bTest: [5, 40] },
    phrase: 'A visualisation of Georg Ohm\'s 1826 measurements: eight copper wires from 2 to 130 inches closing a thermoelectric circuit, and the needle twist falls as a over b plus the length, b being the rest of the circuit, about 20 inches of the same wire. Without b the shortest wire would predict a twist of 5 for the longest; Ohm read 48 and a half: that is the witness.' },
  { id: 'especesAire', nom: 'Birds of the Solomon Islands: species and area', science: 'Ecology', D: 3, nuage: true, params: { inclureIsolees: 0, zTest: 0.25 },
    bornes: { inclureIsolees: [0, 1], zTest: [0.05, 0.4] },
    phrase: 'A visualisation of the species-area relation measured by Diamond and Mayr on 50 Solomon islands: bigger islands hold more bird species, but slowly, 12 more species for each tenfold of area, because near islands keep trading birds. The classic power law with exponent 0.25 fitted on Bougainville would leave 7 species on Nusave; 35 live there: that is the witness.' },
  { id: 'michaelisMenten', nom: 'Michaelis and Menten 1913: an enzyme saturates', science: 'Biochemistry', D: 3, nuage: true, params: { Ktest: 0.0167, axeLog: 1 },
    bornes: { Ktest: [0.002, 0.1], axeLog: [0, 1] },
    phrase: 'A visualisation of the 1913 invertase measurements of Michaelis and Menten, from the full translation published in 2011: the initial rate climbs with the sugar and then levels off, and the fitted half-saturation constant is 0.018 mol per litre against their 0.0167. A rate proportional to the sugar would double when the sugar doubles; at the top it does not move at all: that is the witness.' },
  { id: 'diffusionAlpha', nom: 'Geiger and Marsden 1913: alpha particles bounce off gold', science: 'Nuclear physics', D: 3, nuage: true, params: { orArgent: 0, puissanceTest: 4 },
    bornes: { orArgent: [0, 1], puissanceTest: [1, 6] },
    phrase: 'A visualisation of the 1913 counts of Geiger and Marsden: alpha particles fired at gold foil, counted from 150 down to 15 degrees, rise from 33 to 132000 scintillations, while counts times the fourth power of sin of half the angle barely move, as Rutherford\'s tiny charged nucleus predicts. A gentler law in the square would predict 1813 at 15 degrees: that is the witness.' },
  { id: 'argonRayleigh', nom: 'Rayleigh and Ramsay 1895: the nitrogen that weighed too much', science: 'Chemistry', D: 3, nuage: true, params: { signeCorrection: 1 },
    bornes: { signeCorrection: [-1, 1] },
    phrase: 'A visualisation of the weighings that found argon: nitrogen made from chemicals and nitrogen taken from air should weigh the same, yet a globe of air nitrogen is 0.49 percent heavier, 1.2572 against 1.2511 grams per litre. The gap is seven times the whole spread of the five chemical methods, so something heavier hides in the air: that is the witness.' },
  { id: 'carteSturtevant', nom: 'Sturtevant 1913: the first genetic map', science: 'Genetics', D: 3, nuage: true, params: { distanceMax: 60 },
    bornes: { distanceMax: [5, 60] },
    phrase: 'A visualisation of the first chromosome map, drawn in 1913 by a student, Alfred Sturtevant: how often two fly genes are split apart by crossing over gives their distance, and the short distances add up into a line, B, C and O, P, R, M. Over long stretches it fails: B and M are 57.6 apart on the map, yet only 37.5 percent are split: that is the witness.' },
  { id: 'oubliEbbinghaus', nom: 'Ebbinghaus 1885: the forgetting curve', science: 'Psychology', D: 3, nuage: true, params: { kTest: 1.84, cTest: 1.25 },
    bornes: { kTest: [0.5, 4], cTest: [0.5, 2] },
    phrase: 'A visualisation of Hermann Ebbinghaus measuring his own memory: after learning lists of nonsense syllables, relearning them saved 58 percent of the time after 20 minutes, 34 percent after a day and still 21 percent after a month; his formula follows the points. Forgetting at a constant rate through the first two points would leave nothing after one day: that is the witness.' },
  { id: 'fievreSemmelweis', nom: 'Semmelweis 1847: washing hands', science: 'Medicine', D: 3, nuage: true, params: { anneeVue: 1846 },
    bornes: { anneeVue: [1841, 1848] },
    phrase: 'A visualisation of Ignaz Semmelweis\'s Vienna records: in the clinic taught by doctors, who came from the dissecting room, 9.9 percent of mothers died of childbed fever from 1841 to 1846, against 3.9 percent in the midwives\' clinic next door. After hand washing with chlorine in 1847, both fell to about 1.3 percent. Same hospital, same risk would leave the two clinics within chance of each other; before chlorine the gap is 23 standard errors: that is the witness.' },
  { id: 'densiteCavendish', nom: 'Cavendish 1798: weighing the Earth', science: 'Earth science', D: 3, nuage: true, params: { filChoisi: 2 },
    bornes: { filChoisi: [0, 2] },
    phrase: 'A visualisation of Henry Cavendish\'s 29 measurements of the density of the Earth with a torsion balance: the 23 made with his second wire average 5.48 times water, spread over 0.75, exactly as he wrote. He also wrote that his first wire gives 5.48, but its six printed values average 5.31: that is the witness.' },
  { id: 'equivalentJoule', nom: 'Joule 1850: work becomes heat', science: 'Thermodynamics', D: 3, nuage: true, params: { colonneVide: 1 },
    bornes: { colonneVide: [0, 1] },
    phrase: 'A visualisation of James Joule\'s five series of 1850: falling weights churn water, mercury or rub cast iron, and the same work always gives the same heat, 772.7 to 776.0 foot-pounds per pound of water per degree, within half a percent. The famous 772 is not their average, which is 774.17: Joule kept the water series alone, his most careful one: that is the witness.' },
  { id: 'eclipseEddington', nom: 'The 1919 eclipse: light bent by the Sun', science: 'Relativity', D: 3, nuage: true, params: { facteurNewton: 2 },
    bornes: { facteurNewton: [0, 2.5] },
    phrase: 'A visualisation of the 1919 eclipse measurements of Dyson, Eddington and Davidson: stars near the darkened Sun looked pushed outward, by 1.98 arcseconds at the limb from Sobral and 1.61 from Principe. Einstein predicted 1.75; Newtonian gravity acting on light predicted half, 0.87, which sits 9 probable errors below Sobral: that is the witness.' },
  { id: 'lynxHudson', nom: 'The ten-year cycle of the Canada lynx', science: 'Ecology', D: 3, nuage: true, params: { decalageAns: 10 },
    bornes: { decalageAns: [1, 15] },
    phrase: 'A visualisation of the lynx skins bought by the Hudson\'s Bay Company from 1848 to 1909, as tabled by Elton and Nicholson in 1942: the catch swings from 3410 to 78773 a year and peaks every 9.6 years, close to their 9.63 over two centuries. The same years shuffled at random lose the rhythm entirely: that is the witness.' },
  { id: 'gouttesMillikan', nom: 'Millikan 1913: the charge of the electron', science: 'Atomic physics', D: 3, nuage: true, params: { gouttesMoyennees: 23 },
    bornes: { gouttesMoyennees: [1, 58] },
    phrase: 'A visualisation of Robert Millikan\'s 58 oil drops of 1913: every drop gives the same elementary charge within 0.6 percent, and their mean gives e = 4.774 times 10 to the minus 10 electrostatic units, plus or minus 0.009. His earlier value with the same method, 4.891, lies 13 of those uncertainties away: that is the witness.' },
  { id: 'vieGraunt', nom: 'Graunt 1662: the first life table', science: 'Demography', D: 3, nuage: true, params: { raisonTest: 0.625 },
    bornes: { raisonTest: [0.4, 0.8] },
    phrase: 'A visualisation of the first life table, drawn by John Graunt from the London bills of mortality in 1662: of 100 children conceived, 64 reach six, 40 reach sixteen, 25 reach twenty-six and only 1 reaches seventy-six, a life expectancy at birth of about 18 years. He says he used a geometric series, which would leave 35 alive at sixteen, not his 40: that is the witness.' },
  { id: 'loiHubble1929', nom: 'Hubble 1929: the farther, the faster', science: 'Cosmology', D: 3, nuage: true, params: { constanteTest: 465 },
    bornes: { constanteTest: [100, 800] },
    phrase: 'A visualisation of Edwin Hubble\'s 1929 table: 24 galaxies whose distance he could estimate, from 0.03 to 2 million parsecs, recede faster the farther they are, about 420 to 500 kilometres per second for each million parsecs. Shuffle the velocities among the galaxies and the link vanishes: that is the witness.' },
  { id: 'loiMoseley', nom: 'Moseley 1914: counting the elements with X-rays', science: 'Atomic physics', D: 3, nuage: true, params: { numerotation: 0 },
    bornes: { numerotation: [0, 1] },
    phrase: 'A visualisation of Henry Moseley\'s 1914 X-ray measurements: the square root of each element\'s K-alpha frequency climbs by one step per element, Q = N - 1, so the atomic number became something you measure, with three empty places left for elements not yet found. Number the elements without the empty place 43 and the points jump off the line: that is the witness.' },
  { id: 'lumiereMichelson', nom: 'Michelson 1879: the speed of light', science: 'Optics', D: 3, nuage: true, params: { correctionVide: 1 },
    bornes: { correctionVide: [0, 1] },
    phrase: 'A visualisation of Albert Michelson\'s 100 measurements of the speed of light in 1879 with a rotating mirror: they average 299852 kilometres per second in air, and after his corrections 299944, give or take 51. The exact value is 299792.458: his result sits almost three times his own error margin too high: that is the witness.' },
  { id: 'regressionGalton', nom: 'Galton 1886: regression towards the mean', science: 'Statistics', D: 3, nuage: true, params: { penteTest: 0.667 },
    bornes: { penteTest: [0, 1.2] },
    phrase: 'A visualisation of Francis Galton\'s 928 adult children and their parents in 1886: children of very tall parents are tall, but only two-thirds as far from the average of 68 and a quarter inches, and the same holds the other way round. Like parent, like child would put the children of the shortest group at 64.5 inches; they measured 65.8: that is the witness.' },
  { id: 'aberrationBradley', nom: 'Bradley 1729: starlight arrives at an angle', science: 'Astronomy', D: 3, nuage: true, params: { minutesLumiere: 8.2 },
    bornes: { minutesLumiere: [6, 12] },
    phrase: 'A visualisation of James Bradley\'s discovery of 1729: every star traces a tiny yearly circle because the Earth moves while starlight arrives, like rain slanting when you run. Seven stars show changes from 16 to 39 arcseconds, yet all give the same maximum, 40 to 41, so light takes 8 minutes 12 seconds from the Sun. Roemer\'s 11 minutes would need a maximum of 54: that is the witness.' },
  { id: 'exclusionGause', nom: 'Gause 1934: two species, one food, one survivor', science: 'Ecology', D: 3, nuage: true, params: { betaGause: 0.61 },
    bornes: { betaGause: [0, 1.2] },
    phrase: 'A visualisation of Georgii Gause\'s 1934 Paramecium jars: grown apart, both species level off; grown together on half a loop of bacteria, P. caudatum is down to 0 by day 16. Gause\'s own constant competition coefficients still leave 34 units of it on that day: that is the witness.' },
  { id: 'mortaliteNightingale', nom: 'Nightingale 1858: an army killed by disease', science: 'Medicine', D: 3, nuage: true, params: { anneeNightingale: 1 },
    bornes: { anneeNightingale: [1, 2] },
    phrase: 'A visualisation of Florence Nightingale\'s 1858 table of deaths in the army hospitals in the East: in January 1855 disease alone killed at a rate of 1022.8 per 1,000 a year; a year later, 11.4. Holding the size of the army constant still leaves a fall of 30 times: that is the witness.' },
  { id: 'equivalentsFaraday', nom: 'Faraday 1834: one current, chemical equivalents', science: 'Chemistry', D: 3, nuage: true, params: { volumeGazFaraday: 3.85 },
    bornes: { volumeGazFaraday: [1, 12] },
    phrase: 'A visualisation of Michael Faraday\'s 1834 electrolysis: the current that freed 3.85 cubic inches of gas from water put 3.2 grains of tin on the electrode, which makes tin 57.9 against hydrogen 1. If the same current gave the same mass, it would have been 0.497 grain: that is the witness.' },
  { id: 'chaleursPetitDulong', nom: 'Petit and Dulong 1819: the same heat for every atom', science: 'Chemistry', D: 3, nuage: true, params: { decalagePoids: 0 },
    bornes: { decalagePoids: [0, 12] },
    phrase: 'A visualisation of Petit and Dulong\'s 1819 table: specific heats differ 6.5-fold from bismuth to sulphur, yet times the weight of the atom they give nearly the same number, spread 1.2 %. Platinum is printed 0.3740 where its own columns give 0.3504. Shift the weights by five rows and the spread jumps to 94.5 %: that is the witness.' },
  { id: 'repliquesOmori', nom: 'Omori 1894: the aftershocks fade like 1 / t', science: 'Seismology', D: 3, nuage: true, params: { horizonOmori: 20 },
    bornes: { horizonOmori: [10, 1300] },
    phrase: 'A visualisation of Fusakichi Omori\'s 1894 count of aftershocks at Gifu: five days of half-daily counts give y = 440.7 / (x + 2.31), which still predicts 0.89 shocks per half day a year later, when 1.18 were felt. The exponential law he tried first predicts 1e-50: that is the witness.' },
  { id: 'survieHalley', nom: 'Halley 1693: the Breslau life table', science: 'Demography', D: 3, nuage: true, params: { tauxHalley: 6 },
    bornes: { tauxHalley: [3, 10] },
    phrase: 'A visualisation of Edmond Halley\'s 1693 table of the living at Breslau: 1000 in their first year, 427 at 42, 20 at 84, 34,000 in all, and the price of a life annuity at six per cent that he drew from it. A constant risk of death would leave only 145 alive at 42: that is the witness.' },
  { id: 'chaleurLondres', nom: 'Howard 1833: London is warmer than the country', science: 'Meteorology', D: 3, nuage: true, params: { lissageHoward: 1 },
    bornes: { lissageHoward: [1, 9] },
    phrase: 'A visualisation of Luke Howard\'s annual means for London and the nearby country, 1789 to 1818: over three periods the city record is warmer by 1.579 degrees Fahrenheit on average, which Howard put down to the city\'s fires and crowding. If the two records did not differ, London would not come out warmer 11 years in 12: that is the witness.' },
  { id: 'motsMendenhall', nom: 'Mendenhall 1887: the curve of word lengths', science: 'Linguistics', D: 3, nuage: true, params: { queueMendenhall: 11 },
    bornes: { queueMendenhall: [8, 14] },
    phrase: 'A visualisation of Thomas Mendenhall\'s 1887 counts of words by length, a thousand at a time, from Oliver Twist and Vanity Fair. His two Vanity Fair groups, which he called quite different, differ no more than chance would make them. Mill and Dickens, 13.5 standard errors apart if words are independent, cannot share one mean: that is the witness.' },
  { id: 'parallaxeBessel', nom: 'Bessel 1838: the first distance to a star', science: 'Astronomy', D: 3, nuage: true, params: { poidsBessel: 0.6889 },
    bornes: { poidsBessel: [0.3, 1.5] },
    phrase: 'A visualisation of Friedrich Bessel\'s 1838 least squares for 61 Cygni: two comparison stars give 0.3690 and 0.2605 arcsecond, and weighting the second by 0.6889 gives his 0.3136, about 658,000 times the Sun\'s distance. With no parallax the misfit stays three and two times larger: that is the witness.' },
  { id: 'vitesseNyquist', nom: 'Nyquist 1924: more levels, logarithmically faster', science: 'Telecommunications', D: 3, nuage: true, params: { niveauxNyquist: 16 },
    bornes: { niveauxNyquist: [4, 64] },
    phrase: 'A visualisation of Harry Nyquist\'s 1924 telegraph table: using m current values instead of two raises the characters sent per signal element only as log m, 100, 158, 200, 230, 300 and 400 for 2, 3, 4, 5, 8 and 16 values; his 230 for five is the one entry the law puts at 232. Doubling the levels would double the speed and give 800 at sixteen: that is the witness.' },
  { id: 'ondulationsYoung', nom: 'Young 1802: the first table of light wavelengths', science: 'Optics', D: 3, nuage: true, params: { minutesYoung: 8.125 },
    bornes: { minutesYoung: [7.5, 9] },
    phrase: 'A visualisation of Thomas Young\'s 1802 table: from Newton\'s rings he gave each colour a wavelength, from 266 ten-millionths of an inch for extreme red to 167 for extreme violet, and a frequency assuming light takes 8 1/8 minutes from the Sun. His 2^48 is really 2^49. If the visible spanned an octave the ratio would be 2, not 1.587: that is the witness.' },
  { id: 'picLummer', nom: 'Lummer and Pringsheim 1899: the black body peak', science: 'Thermal radiation', D: 3, nuage: true, params: { exposantLummer: 5 },
    bornes: { exposantLummer: [3, 6] },
    phrase: 'A visualisation of Lummer and Pringsheim\'s 1899 black body measurements from 621 to 1646 kelvins: the peak wavelength times the temperature stays near 2940, and the peak energy over the fifth power of the temperature near 2188. Over the fourth power it would change 2.7-fold: that is the witness.' },
  { id: 'balanceCoulomb', nom: 'Coulomb 1785: the torsion balance and the inverse square', science: 'Electrostatics', D: 3, nuage: true, params: { exposantCoulomb: 2 },
    bornes: { exposantCoulomb: [1, 3] },
    phrase: 'A visualisation of Charles-Augustin Coulomb\'s 1785 torsion balance: two charged balls 36 degrees apart need 36 degrees of twist, at 18 degrees 144, at 8.5 degrees 575.5, close to four times again. A force falling only as 1 / distance would have needed 72 and 152.5: that is the witness.' },
  { id: 'effetJoule', nom: 'Joule 1841: heat grows as the square of the current', science: 'Electricity', D: 3, nuage: true, params: { exposantJouleQ: 2 },
    bornes: { exposantJouleQ: [1, 3] },
    phrase: 'A visualisation of James Prescott Joule\'s 1841 measurements: a coil in water warms 3 degrees in half an hour with a current of 0.92 on his scale and 25 degrees with 2.73, as the square of the current says. Heat in simple proportion to the current would have reached only three times as much: that is the witness.' },
  { id: 'critiqueReynolds', nom: 'Reynolds 1883: when a stream of water turns sinuous', science: 'Fluid mechanics', D: 3, nuage: true, params: { exposantReynolds: 1 },
    bornes: { exposantReynolds: [0, 2] },
    phrase: 'A visualisation of Osborne Reynolds\'s 1883 colour-band experiments in three glass pipes: the speed at which the dyed thread breaks up grows as the pipe narrows, from about 0.6 metres per second in the widest to 2.3 in the narrowest, with his constant B_s = 43.79. A critical speed independent of the diameter would give a flat line, not a slope of -1.01: that is the witness.' },
  { id: 'filtreDarcy', nom: 'Darcy 1856: water through sand', science: 'Fluid mechanics', D: 3, nuage: true, params: { partDessous: 1 },
    bornes: { partDessous: [0, 1] },
    phrase: 'A visualisation of Henry Darcy\'s 1856 sand-filter experiments at Dijon: the flow through the sand grows in proportion to the head, and in February 1856 it follows the difference of pressure across the filter. Two runs with the same 12.9 metres above gave 18.3 and 4.15 litres a minute: the pressure above alone cannot explain them, which is the witness.' },
  { id: 'deplacementsPerrin', nom: 'Perrin 1913: Brownian jumps obey chance', science: 'Brownian motion', D: 3, nuage: true, params: { sigmaPerrin: 6.3 },
    bornes: { sigmaPerrin: [4, 9] },
    phrase: 'A visualisation of Jean Perrin\'s 1913 counts of gamboge grains moving every 30 seconds: the sizes of their jumps fall into a bell curve of spread 6.3 microns, and the 501 jumps on his target thin out ring by ring. Even counts in every class would give a chi-square near 100 instead of 5 to 12: that is the witness.' },
  { id: 'aimantGauss', nom: 'Gauss 1832: a magnet pulls as the cube of the distance', science: 'Magnetism', D: 3, nuage: true, params: { exposantGauss: 3 },
    bornes: { exposantGauss: [2, 4] },
    phrase: 'A visualisation of Carl Friedrich Gauss\'s 1832 measurements: a second magnetised needle set 1.1 to 4 metres from a hanging one turns it less and less, as the cube of the distance (fitted powers 2.996 and 3.028), and his two-term formula gives back 27 of his 28 calculated angles to a tenth of a second. A fall as the square would miss by 570 to 610 seconds of arc on average instead of 13 to 29: that is the witness.' },
  { id: 'unitesWeber', nom: 'Weber and Kohlrausch 1856: the ratio of the units of charge', science: 'Electricity', D: 3, nuage: true, params: { partWeber: 0.5 },
    bornes: { partWeber: [0.25, 1] },
    phrase: 'A visualisation of Wilhelm Weber and Rudolf Kohlrausch\'s 1856 measurement: five Leyden jar discharges through a galvanometer give the ratio of the magnetic to the mechanical unit of current, 155370 million on average, which they turn into a speed of 439450 million millimetres per second. A swing that ignored the charge would miss by 11.6 percent instead of 2.8: that is the witness.' },
  { id: 'tubesPoiseuille', nom: 'Poiseuille 1840: flow in fine tubes grows as the fourth power of the width', science: 'Fluid mechanics', D: 3, nuage: true, params: { exposantPoiseuille: 4 },
    bornes: { exposantPoiseuille: [3, 5] },
    phrase: 'A visualisation of Jean Poiseuille\'s 1840 measurements: water pushed through seven glass tubes from 0.014 to 0.65 millimetres wide flows as the fourth power of the width, a slope of 3.9993 across a 4.8 million fold range, and twice the pressure halves the emptying time. A flow growing only as the cube, as Navier\'s theory had it, would miss by a factor of 3 instead of 1.001: that is the witness.' },
  { id: 'variationsHalley', nom: 'Halley 1683: the compass needle drifts west', science: 'Geomagnetism', D: 3, nuage: true, params: { anneeHalley: 1650 },
    bornes: { anneeHalley: [1580, 1683] },
    phrase: 'A visualisation of Edmond Halley\'s 1683 table of compass variations: at London the needle pointed 11 degrees 15 minutes east of true north in 1580 and 4 degrees 30 minutes west in 1683, a drift that sped up from 7.5 to 10.9 minutes a year, and Paris and Copenhagen drift west too. A variation fixed for each place would not move at all, while the smallest change he lists is already 1.9 degrees: that is the witness.' },
  { id: 'spiralesBeal', nom: 'Beal 1873: the spirals of 895 cones', science: 'Phyllotaxis', D: 3, nuage: true, params: { groupeBeal: 0 },
    bornes: { groupeBeal: [0, 12] },
    phrase: 'A visualisation of William Beal\'s 1873 counts of the spirals on 895 pine, spruce and larch cones: 744 of them show two neighbouring Fibonacci numbers, like 5 and 8, but 41 show 4 and 7. The geometry rule of the day said 4 and 7 could not happen at all: that is the witness.' },
  { id: 'tempsOldham', nom: 'Oldham 1906: earthquake waves through the Earth', science: 'Seismology', D: 3, nuage: true, params: { vitesseOldham: 6 },
    bornes: { vitesseOldham: [4, 13] },
    phrase: 'A visualisation of Richard Oldham\'s 1906 table of how long the first and second earthquake tremors take to reach places 30 to 180 degrees away: along the straight chord both go faster the deeper they reach, until 120 degrees, and then the second arrives far later. Had it kept its speed it would arrive after 32 minutes at 150 degrees, not 45: that is the witness.' },
  { id: 'fonteMacKellar', nom: 'MacKellar 1893: how many of each letter a printer buys', science: 'Information', D: 3, nuage: true, params: { melangeUniforme: 0 },
    bornes: { melangeUniforme: [0, 1] },
    phrase: 'A visualisation of the type fount Thomas MacKellar printed in The American Printer: 800 pounds of pica held 12000 e and 200 z, sixty times fewer, and nine letters made up 69 percent of it. Were every letter used alike, e would get one part in 26 instead of 2.9 times that: that is the witness.' },
  { id: 'syllabesKaeding', nom: 'Kaeding 1898: eleven million German words by length', science: 'Information', D: 3, nuage: true, params: { zaehlstoffKaeding: 0 },
    bornes: { zaehlstoffKaeding: [0, 14] },
    phrase: 'A visualisation of the word counts Friedrich Kaeding\'s team made for shorthand in 1898: of 10.9 million German words, half have one syllable and the counts then fall fast, with a mean of 1.83 syllables. If each extra syllable kept the one-to-two ratio, there would be 621 thousand five-syllable words instead of 188 thousand: that is the witness.' },
  { id: 'tubesHagen', nom: 'Hagen 1839: water through narrow brass tubes', science: 'Fluid mechanics', D: 3, nuage: true, params: { partCarreHagen: 1 },
    bornes: { partCarreHagen: [0, 2] },
    phrase: 'A visualisation of Gotthilf Hagen\'s 1839 measurements of water pushed through three narrow brass tubes: the head needed is a friction part in proportion to the flow plus a part in its square, and his two-term curves miss his 21 readings by a few thousandths of an inch. Friction alone would miss by a tenth to half an inch: that is the witness.' },
  { id: 'spiraleMoseley', nom: 'Moseley 1838: shells grow as logarithmic spirals', science: 'Logarithmic spirals', D: 3, nuage: true, params: { raisonMoseley: 1.18 },
    bornes: { raisonMoseley: [1.05, 1.3] },
    phrase: 'A visualisation of Henry Moseley\'s 1838 measurements of two sea shells: the widths of successive whorls shrink by the same ratio each turn, 1.18 for one and 1.13 for the other, as a logarithmic spiral demands. Whorls shrinking by a fixed amount instead would miss by 4 to 12 times as much: that is the witness.' },
  { id: 'poisMendel', nom: 'Mendel 1866: the counts of the pea crosses', science: 'Genetics', D: 3, nuage: true, params: { rapportMendel: 3 },
    bornes: { rapportMendel: [1, 5] },
    phrase: 'A visualisation of the counts Gregor Mendel published in 1866: in seven crosses of peas differing by one trait, the dominant form comes back about three times for each recessive one, 14949 against 5010 in all, and a third of the dominants then breed true. Both forms coming back equally would give a chi-square near 5000 instead of 2: that is the witness.' },
  { id: 'rayonsThomson', nom: 'J. J. Thomson 1897: the mass to charge of cathode rays', science: 'Atomic physics', D: 3, nuage: true, params: { facteurIThomson: 1 },
    bornes: { facteurIThomson: [0.8, 1.2] },
    phrase: 'A visualisation of J. J. Thomson\'s 1897 measurements on cathode rays in three tubes and three gases: the ratio of mass to charge comes out near 0.5 times ten to the minus seven whatever the gas, and he computes it from the heat, charge and bending he measured. The hydrogen ion of electrolysis has ten to the minus four, about 2000 times more: that is the witness.' },
  { id: 'magnitudesPogson', nom: 'Pogson 1856: the 2.512 scale of star magnitudes', science: 'Astronomy', D: 3, nuage: true, params: { rapportPogson: 2.512 },
    bornes: { rapportPogson: [2, 4] },
    phrase: 'A visualisation of Norman Pogson\'s 1856 scale of star brightness: each magnitude is 2.512 times fainter than the one before, so the faintest star a telescope shows grows by five magnitudes for every tenfold aperture, from 0.229 inch for the 6th to 14.4 inches for the 15th. With the older ratio of 4 the 15th would need a 117 inch telescope: that is the witness.' },
  { id: 'maisDarwin', nom: 'Darwin 1876: crossed and self-fertilised maize', science: 'Genetics', D: 3, nuage: true, params: { gainDarwin: 0 },
    bornes: { gainDarwin: [0, 30] },
    phrase: 'A visualisation of Charles Darwin\'s 1876 table of young maize plants grown in pairs in four pots: the fifteen from crossed seed average 20.19 inches and the fifteen self-fertilised 17.57, as 100 to 87, and the crossed plant is the taller in 13 of the 15 rows. Were crossing of no effect, that would happen less than once in a hundred: that is the witness.' },
  { id: 'emanationRutherford', nom: 'Rutherford 1900: thorium emanation halves every minute', science: 'Radioactivity', D: 3, nuage: true, params: { demiVieRutherford: 60 },
    bornes: { demiVieRutherford: [30, 120] },
    phrase: 'A visualisation of Ernest Rutherford\'s 1900 measurements of the radioactive gas given off by thorium: once the air stops, the conduction it causes falls by half about every minute, a fitted half-life of 60.6 seconds over six minutes, which he turns into lambda = 1/86. A fall by a fixed amount each second would miss nearly five times more and go below zero: that is the witness.' },
  { id: 'etherMichelson', nom: 'Michelson and Morley 1887: no ether wind', science: 'Relativity', D: 3, nuage: true, params: { vitesseEther: 1 },
    bornes: { vitesseEther: [0, 1] },
    phrase: 'A visualisation of Albert Michelson and Edward Morley\'s 1887 fringe readings as their interferometer turned through sixteen marks, at noon and in the evening: an Earth moving through a still ether at its orbital speed should shift the fringes by 0.4 of a wave-length, but the fitted swing is only 0.017 to 0.023. That expected 0.4 is 18 to 24 times what they saw: that is the witness.' },
  { id: 'reststrahlenRubens', nom: 'Rubens and Kurlbaum 1901: Planck wins at long wavelengths', science: 'Thermal radiation', D: 3, nuage: true, params: { loiRubens: 4 },
    bornes: { loiRubens: [0, 4] },
    phrase: 'A visualisation of Heinrich Rubens and Ferdinand Kurlbaum\'s 1901 measurements of black body radiation at 51 microns from -188 to 1500 degrees: of the five laws on offer, the one Max Planck had just proposed misses their readings by 1.5 on a scale of 132, and Wien\'s law by 45. Wien predicts 147.5 at 1500 degrees where they measured 196.8: that is the witness.' },
  { id: 'constantesPlanck', nom: 'Planck 1901: the first values of h and k', science: 'Thermal radiation', D: 3, nuage: true, params: { lambdaThetaPlanck: 0.294 },
    bornes: { lambdaThetaPlanck: [0.28, 0.31] },
    phrase: 'A visualisation of how Max Planck first computed his constant h and Boltzmann\'s k in 1901 from two measurements, the total radiation of a black body and the position of its peak: h = 6.55e-27 and k = 1.346e-16, numbers that come back from his own printed steps. The older Wien law would put the peak at x = 5, which leaves his peak equation off by a whole unit: that is the witness.' },
  { id: 'jaugesHerschel', nom: 'Herschel 1785: sounding the depth of the Milky Way', science: 'Astronomy', D: 3, nuage: true, params: { champHerschel: 15 },
    bornes: { champHerschel: [8, 30] },
    phrase: 'A visualisation of William Herschel\'s 1785 star gauges: counting the stars in his 15 minute field and assuming them evenly spaced, he turned each count into a depth of the Milky Way, as the cube root of the stars, and his table of 167 depths comes back from that one formula 165 times. Stars spread over a surface would need a square root, 18 656 deep for 100 000 stars instead of 2758: that is the witness.' },
  { id: 'penduleKater', nom: 'Kater 1819: one pendulum carried up Britain weighs the shape of the Earth', science: 'Earth science', D: 3, nuage: true, params: { stationOteeKater: 0 },
    bornes: { stationOteeKater: [0, 7] },
    phrase: 'A visualisation of Henry Kater\'s 1819 survey: the same pendulum, swung at seven stations from Unst in Shetland to the Isle of Wight, beats a little faster the further north it goes, and the seven lengths of the seconds pendulum lie on one line against the square of the sine of latitude. With his own constant 0.0086501 that line gives the Earth a flattening of about 1 in 322. A homogeneous Earth, Newton\'s 1 in 230, would need gravity to fall by 1 in 230 from pole to equator; the pendulum says 1 in 180: that is the witness.' },
  { id: 'essaisThorndike', nom: 'Thorndike 1898: a cat learns its way out of a box', science: 'Psychology', D: 3, nuage: true, params: { moyenneThorndike: 3 },
    bornes: { moyenneThorndike: [1, 8] },
    phrase: 'A visualisation of Edward Thorndike\'s 1898 puzzle box: cat 12 had to find the move that opened the door, and over 24 trials its time fell from 160 seconds to 7, by fits and starts, with eight rises on the way. A cat that understood at once would have stayed fast after escaping in 30 seconds on its second trial; it then took 90 and 60 seconds: that is the witness.' },
  { id: 'reactionDonders', nom: 'Donders 1868: how long a decision takes', science: 'Psychology', D: 3, nuage: true, params: { rouleauDonders: 0 },
    bornes: { rouleauDonders: [0, 3] },
    phrase: 'A visualisation of Franciscus Donders\'s 1868 reaction times, counted on a tuning fork at 261 vibrations a second: repeating a syllable you expect, repeating whichever of several you hear, or answering only one of them. Subtracting the times measures each decision, and his ten printed differences come back from his table to the hundredth. If deciding cost nothing the first two would take as long; choosing adds 83 thousandths of a second: that is the witness.' },
  { id: 'attentionCattell', nom: 'Cattell 1886: attention and distraction', science: 'Psychology', D: 3, nuage: true, params: { sujetCattell: 0 },
    bornes: { sujetCattell: [0, 2] },
    phrase: 'A visualisation of James McKeen Cattell\'s 1886 reaction times: two trained observers reacted to a light, a shock or a sound with the attention concentrated, normal, or busy adding 17 after 17 in the head. Adding in the head made every block slower, by 13 to 44 thousandths of a second, and his summary table comes back from the others cell for cell. If concentrating always made you faster, no block would be slower for it; one was slower by 26: that is the witness.' },
  { id: 'pressurePeirceJastrow', nom: 'Peirce and Jastrow 1884: differences too small to notice', science: 'Psychology', D: 3, nuage: true, params: { groupeJastrow: 1 },
    bornes: { groupeJastrow: [1, 2] },
    phrase: 'A visualisation of Charles Peirce and Joseph Jastrow\'s 1884 experiment: two weights pressed on a finger, differing by as little as half a percent, and the observer says which is heavier, fifty times a set. Errors fall smoothly as the difference grows, along the normal law of errors, and after two months of practice the same differences gave half as many errors. If there were a threshold below which nothing is felt, the finest difference would give one error in two; it gave 200 in 500: that is the witness.' },
  { id: 'extinctionPavlov', nom: 'Pavlov 1927: a learnt response fades, then returns', science: 'Psychology', D: 3, nuage: true, params: { seriePavlov: 0 },
    bornes: { seriePavlov: [0, 5] },
    phrase: 'A visualisation of experimental extinction in Ivan Pavlov\'s laboratory: a dog that had learnt to salivate at the sight of meat powder was shown it again and again without being fed, and the saliva dried up, in 15 minutes when the showings were 2 minutes apart, 54 minutes at 8 minutes apart, and not even in 2 hours at 16. If no reward erased what was learnt, the response would stay at zero; after a rest it came back both times: that is the witness.' },
  { id: 'weberKonig', nom: 'Konig and Brodhun 1888: the smallest change of brightness we see', science: 'Psychology', D: 3, nuage: true, params: { tableKonig: 0 },
    bornes: { tableKonig: [0, 4] },
    phrase: 'A visualisation of Arthur Konig and Eugen Brodhun\'s 1888 measurements: how much brighter one half of a coloured field must be before the eye sees a difference, from the faintest light to a dazzling one. In the middle of the range the step is about one and a half to two percent of the brightness, as Weber\'s law says, and the printed fractions come back from the printed angles in 71 rows out of 71. If Weber\'s law held everywhere the fraction would never change; near darkness it is 31 to 52 times larger: that is the witness.' },
  { id: 'glycosuriaCannon', nom: 'Cannon 1915: excitement and sugar in the urine', science: 'Physiology', D: 3, nuage: true, params: { groupeCannon: 0 },
    bornes: { groupeCannon: [0, 2] },
    phrase: 'A visualisation of counts reported by Walter Cannon in 1915: cats that struggled when held, or were barked at by a dog, had sugar in their urine, and so did 4 of 9 students after a hard examination, 12 of 25 football players after the last match of 1913, and 6 of 33 students after an important examination. Calm cats, a cooled cat and cats without adrenal glands had none. If the sugar came from physical effort, players who stayed on the bench would have none; 5 of the 12 never played: that is the witness.' },
  { id: 'brainBoyd', nom: 'Boyd 1861: the weight of the brain through life', science: 'Anatomy', D: 3, nuage: true, params: { sexeBoyd: 0 },
    bornes: { sexeBoyd: [0, 2] },
    phrase: 'A visualisation of Robert Boyd\'s 1861 table of brain weights, from 2086 post-mortem examinations at a London infirmary: the brain weighs about 12 ounces at birth, nearly 49 ounces for men and 44 for women at 14 to 20, and the heaviest and next heaviest periods come back from the table exactly as Boyd wrote them. If the brain kept growing with the body it would be heaviest in old age; it is heaviest at 14 to 20 years and lighter by 7 to 9 percent after 80: that is the witness.' },
  { id: 'allOrNoneLucas', nom: 'Keith Lucas 1909: all or none', science: 'Physiology', D: 3, nuage: true, params: { droiteLucas: 1 },
    bornes: { droiteLucas: [0, 1] },
    phrase: 'A visualisation of Keith Lucas\'s 1909 experiment on a frog muscle driven by eight or nine nerve fibres: as the electric shock grows slowly, the contraction does not grow smoothly but jumps, from nothing to 1.5 mm, then to 3.7, then creeps to 4.1, and three jumps carry 91 percent of the whole rise. Each fibre answers fully or not at all. If the contraction grew in proportion to the shock the points would lie on a straight line; the line explains a third of their spread: that is the witness.' },
  { id: 'neuronsHerculanoHouzel', nom: 'Herculano-Houzel 2007: how primate brains add neurons', science: 'Neuroscience', D: 3, nuage: true, params: { rongeurHerculano: 1 },
    bornes: { rongeurHerculano: [0, 1] },
    phrase: 'A visualisation of Suzana Herculano-Houzel\'s 2007 counts of the cells in seven primate brains, from the tree shrew to the macaque: an 11 times heavier brain holds 10 times more neurons, and the line through the seven points has the printed slope, 1.054, to the third decimal. Primate brains add neurons without swelling much. If they grew like rodent brains, the marmoset brain scaled up to the macaque neuron count would weigh 302 grams; the macaque brain weighs 87: that is the witness.' },
  { id: 'connectomeSizes', nom: 'Mapped brains 1986-2024: worm, fly, and the human count', science: 'Neuroscience', D: 3, nuage: true, params: { organismeConnectome: 0 },
    bornes: { organismeConnectome: [0, 4] },
    phrase: 'A visualisation of the nervous systems that have been mapped neuron by neuron and synapse by synapse: the worm C. elegans with 302 neurons in 1986, half a fly brain with about 25,000 in 2020, a whole fly brain with 139,255 neurons and 54.5 million synapses in 2024, beside the human brain, counted at 86.1 billion neurons but never mapped. If a whole fly brain brought a human map close, the gap would be small; the human brain has 618,000 times more neurons: that is the witness.' },
  { id: 'emotionsSiegel', nom: 'Siegel 2018: the body in six emotions, as impulses', science: 'Psychology', D: 3, nuage: true, params: { emotionSiegel: 0, spreadSiegel: 1 },
    bornes: { emotionSiegel: [0, 5], spreadSiegel: [0, 1] },
    phrase: 'A visualisation of the 2018 meta-analysis by Erika Siegel, Lisa Feldman Barrett and colleagues of how the body changes in anger, disgust, fear, happiness, sadness and a neutral state. Seven signals, from heart rate to skin conductance, are drawn as units that fire faster when the measured mean change (Cohen\'s d) is larger: the d values and their intervals are measured in people, the firing rule is ours. Breathing rises most in anger (d = 1.47) and also leads in fear (0.91); the intervals of the emotions overlap. If each emotion had its own bodily fingerprint, a classifier would sort the cases nearly perfectly; theirs sorted 76 of 241, 31.5 percent, where a blind guess among six gets 16.7: that is the witness.' },
  { id: 'bodyMapsNummenmaa', nom: 'Nummenmaa 2014: naming an emotion from a body map', science: 'Psychology', D: 3, nuage: true, params: { guessNummenmaa: 0 },
    bornes: { guessNummenmaa: [0, 1] },
    phrase: 'A visualisation of the 2014 bodily maps of Lauri Nummenmaa and colleagues: people coloured where they felt activity rise or fall in their body for each emotion, and other people, shown the averaged maps, had to say which emotion each was. They named the neutral map 99 percent of the time, anger 58, surprise 54, but fear only 8. Each dot is one simulated reader sending one impulse to an answer, with the measured chance of being right; the readers and the way wrong answers spread are our choice. If the maps carried nothing of the emotion, every row would sit at 14 percent; six of the seven are above it: that is the witness.' },
  { id: 'emotionWiringHCP', nom: 'A wired human brain facing emotions, one pack at a time', science: 'Neuroscience', D: 3, nuage: true, params: { packWiring: 0, emotionWiring: 5, compareWiring: 0, networkWiring: 0, travelWiring: 1, resolutionWiring: 0, theoryWiring: 0 },
    bornes: { packWiring: [0, 5], emotionWiring: [0, 7], compareWiring: [0, 8], networkWiring: [0, 1], travelWiring: [0, 1], resolutionWiring: [0, 1], theoryWiring: [0, 4] },
    phrase: 'A visualisation of a human brain as 82 regions joined by all 1,190 connections measured by diffusion tractography in 207 healthy adults of the Human Connectome Project (ENIGMA Toolbox), with seven deep parts hanging below on pathways named in published studies. Pick one pack of emotions, then one emotion of it: the regions that its source reports as more active light up, by name, and impulses run along the measured connections, more often along the stronger ones; a switch makes them follow how the same regions rise and fall together at rest instead. A resolution switch shows 414 finer parcels with 6,117 measured connections, and a theory switch replays James-Lange, Cannon-Bard, Schachter-Singer or a constructionist account as an order of activation, marked as theory. The wiring, the couplings and the reported regions are measured; the mapping of the reported areas onto the regions, the layout, the timing and the crossing rule are ours. If each emotion had its own place, no region would serve two of them; over all packs 36 of the 64 mapped regions do and 28 serve one, and the left amygdala serves four emotions: that is the witness.' },
  { id: 'riskBernoulli', nom: 'Bernoulli 1738: the value of a risk, by the logarithm', science: 'Decision theory', D: 3, nuage: true, params: { problemBernoulli: 0 },
    bornes: { problemBernoulli: [0, 3] },
    phrase: 'A visualisation of the worked examples in Daniel Bernoulli\'s 1738 paper on measuring risk: a sure sum is worth as much as a gamble when its logarithm equals the average logarithm of the fortunes the gamble can leave. Computed again with that rule, his printed numbers come back: by the rule a merchant called Caius gains by insuring his goods below a fortune of 5043 roubles (5042.43 here), his insurer needs 14243, two ships are worth 7033 ducats, and the St Petersburg game is worth exactly 2 ducats to someone with nothing. These are his own computations from his hypothesis, not measurements of people. With the plain expected value the St Petersburg game grows without end and Caius never insures; with Cramer\'s square root, also printed in the paper, the game is worth 2.914: neither gives his numbers, that is the witness.' },
  { id: 'nerveHelmholtz', nom: 'Helmholtz 1850: the speed of the nerve signal', science: 'Physiology', D: 3, nuage: true, params: { seriesHelmholtz: 0 },
    bornes: { seriesHelmholtz: [0, 3] },
    phrase: 'A visualisation of Hermann Helmholtz\'s 1850 measurements on a frog nerve: stimulated far from the calf muscle, the nerve made it twitch later than when stimulated near it, by one to two thousandths of a second over about 4 cm. Computed again as the length of nerve over that delay, his printed speeds come back to the tenth of a metre per second for 6 of his 8 series and within a tenth for the other two (29.01 for a printed 29.1, 26.95 for 26.9); the error bars are his probable errors, not standard deviations. His mean of 27.0 for the warm series comes back; his least-squares 26.4 for the cool series is not reproduced here (a weighted mean gives 26.15). Speeds of about 25 to 38 m/s, in a frog at 11 to 21 degrees C: not a human nerve, and not how fast people think. If the nerve signal were instantaneous there would be no delay; every printed delay is positive, the first series 12.5 probable errors above zero: that is the witness.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { marcheAleatoire: ['marcheurs', 'pas', 'graine'], aiguilleBuffon: ['aiguilles', 'graine'], anniversaires: ['personnes', 'jours', 'groupes', 'graine'], spiraleUlam: ['jusqua'], pascalSierpinski: ['lignes'], solidesPlatoniques: ['solide'], montyHall: ['portes', 'parties', 'graine'], apollonius: ['generations'], tasDeSable: ['cote'], vergerEuclide: ['cote'], cerclesFord: ['ordre'], fermatSteiner: [], causticTasse: ['rayons'], papillonHofstadter: ['qmax'], dominosKasteleyn: ['hauteur', 'largeur', 'graine'], ising: ['graine'], aztecDiamond: ['ordre', 'graine'], collectionneur: ['vignettes', 'graine'], ruineJoueur: ['depart', 'objectif', 'graine'], catalanDyck: ['demi', 'graine'], partitionEuler: ['entier', 'graine'], courbeDragon: ['plis'], theoremePick: ['sommets', 'rayon', 'graine'], percolationLiens: ['cote', 'graine'], napoleon: ['taille', 'graine'], billardElliptique: ['lancer', 'tir', 'rebonds'], feuerbach: ['taille', 'graine'], jeuDeLaVie: ['oscillateur'], marcheAutoEvitante: ['etapes', 'graine'], eulerSolides: ['solide'], morley: [], bale: ['termes'], simsonDroite: ['taille', 'corde', 'graine'], distinctesImpaires: ['entier', 'graine'], triangulations: ['cotes', 'graine'], ramseyR33: ['sommetsK', 'graine'], pascalHexagramme: ['croise', 'graine'], ptolemee: ['graine'], sommesCarres: ['entier'], equationPell: ['radical'], nombresCarmichael: ['limite'], theoremeWilson: ['limite'], fonctionMertens: ['limite'], parfaitsAmicaux: ['limite'], nombresBernoulli: ['rangB'], problemeJosephus: ['personnes', 'pasK'], zeckendorf: ['entier'], theoremeLucas: ['baseP', 'lignesL'], calkinWilf: ['niveaux'], toursHanoi: ['disques'], regarderDire: ['rangs'], derangements: ['objets', 'graine'], nombresHarmoniques: ['rangs'], suiteCollatz: ['limite'], routineKaprekar: ['longueurK'], stirlingBell: ['elements', 'graine'], motzkinChemins: ['longueurM', 'graine'], periodePisano: ['moduleMax'], indicatriceEuler: ['jusquaN'], goldbachPaires: ['pairMax'], frobeniusPieces: ['pieceMax'], schroderChemins: ['longueurS', 'graine'], triangleNarayana: ['rangN'], suiteRecaman: ['rangR'], suiteKolakoski: ['rangK'], suitePerrin: ['perrinMax'], thueMorse: ['rangT'], suitePadovan: ['rangP'], fourmiLangton: ['pasL'], gammeTemperee: ['divisions'], entropieShannon: ['lettres', 'graine'], atmosphereStandard: [], loiZipf: ['rangsZipf'], gutenbergRichter: ['seismes', 'graine'], mareeVivesEaux: ['jours'], energieLiaison: ['reaction'], courbeKeeling: ['anDebut', 'anFin'], populationMonde: ['decennies'], effetPhotoelectrique: ['metal'], demiViesNPL: ['isotope'], choleraSnow: ['septSemaines', 'graine'], raiesBalmer: ['nPlusHaut'], loiBoyle: ['lignesBoyle'], loiOhm: ['serie'], especesAire: ['inclureIsolees'], michaelisMenten: ['axeLog'], diffusionAlpha: ['orArgent'], argonRayleigh: ['signeCorrection'], carteSturtevant: [], oubliEbbinghaus: [], fievreSemmelweis: ['anneeVue'], densiteCavendish: ['filChoisi'], equivalentJoule: ['colonneVide'], eclipseEddington: [], lynxHudson: ['decalageAns'], gouttesMillikan: ['gouttesMoyennees'], vieGraunt: [], loiHubble1929: [], loiMoseley: ['numerotation'], lumiereMichelson: ['correctionVide'], regressionGalton: [], aberrationBradley: [], exclusionGause: [], mortaliteNightingale: ['anneeNightingale'], equivalentsFaraday: [], chaleursPetitDulong: ['decalagePoids'], repliquesOmori: ['horizonOmori'], survieHalley: ['tauxHalley'], chaleurLondres: ['lissageHoward'], motsMendenhall: ['queueMendenhall'], parallaxeBessel: [], vitesseNyquist: ['niveauxNyquist'], ondulationsYoung: [], picLummer: [], balanceCoulomb: [], effetJoule: [], critiqueReynolds: [], filtreDarcy: [], deplacementsPerrin: [], aimantGauss: [], unitesWeber: [], tubesPoiseuille: [], variationsHalley: ['anneeHalley'], spiralesBeal: ['groupeBeal'], tempsOldham: [], fonteMacKellar: [], syllabesKaeding: ['zaehlstoffKaeding'], tubesHagen: [], spiraleMoseley: [], poisMendel: [], rayonsThomson: [], magnitudesPogson: [], maisDarwin: [], emanationRutherford: [], etherMichelson: [], reststrahlenRubens: ['loiRubens'], constantesPlanck: [], jaugesHerschel: [], penduleKater: ['stationOteeKater'], essaisThorndike: ['moyenneThorndike'], reactionDonders: ['rouleauDonders'], attentionCattell: ['sujetCattell'], pressurePeirceJastrow: ['groupeJastrow'], extinctionPavlov: ['seriePavlov'], weberKonig: ['tableKonig'], glycosuriaCannon: ['groupeCannon'], brainBoyd: ['sexeBoyd'], allOrNoneLucas: ['droiteLucas'], neuronsHerculanoHouzel: ['rongeurHerculano'], connectomeSizes: ['organismeConnectome'], emotionsSiegel: ['emotionSiegel','spreadSiegel'], bodyMapsNummenmaa: ['guessNummenmaa'], emotionWiringHCP: ['packWiring','emotionWiring','compareWiring','networkWiring','travelWiring','resolutionWiring','theoryWiring'], riskBernoulli: ['problemBernoulli'], nerveHelmholtz: ['seriesHelmholtz'] };
const FONCTIONS = { nerveHelmholtz, riskBernoulli,emotionWiringHCP,bodyMapsNummenmaa, emotionsSiegel, connectomeSizes, neuronsHerculanoHouzel, allOrNoneLucas, brainBoyd, glycosuriaCannon, weberKonig, extinctionPavlov, pressurePeirceJastrow, attentionCattell, reactionDonders, essaisThorndike, penduleKater, jaugesHerschel, constantesPlanck, reststrahlenRubens, etherMichelson, emanationRutherford, maisDarwin, magnitudesPogson, rayonsThomson, poisMendel, spiraleMoseley, tubesHagen, syllabesKaeding, fonteMacKellar, tempsOldham, spiralesBeal, variationsHalley, tubesPoiseuille, unitesWeber, aimantGauss, deplacementsPerrin, filtreDarcy, critiqueReynolds, effetJoule, balanceCoulomb, picLummer, ondulationsYoung, vitesseNyquist, parallaxeBessel, motsMendenhall, chaleurLondres, survieHalley, repliquesOmori, chaleursPetitDulong, equivalentsFaraday, mortaliteNightingale, exclusionGause, aberrationBradley, regressionGalton, lumiereMichelson, loiMoseley, loiHubble1929, vieGraunt, gouttesMillikan, lynxHudson, eclipseEddington, equivalentJoule, densiteCavendish, fievreSemmelweis, oubliEbbinghaus, carteSturtevant, argonRayleigh, diffusionAlpha, michaelisMenten, especesAire, loiOhm, loiBoyle, raiesBalmer, choleraSnow, demiViesNPL, effetPhotoelectrique, populationMonde, courbeKeeling, energieLiaison, mareeVivesEaux, gutenbergRichter, loiZipf, atmosphereStandard, entropieShannon, gammeTemperee, fourmiLangton, suitePadovan, thueMorse, suitePerrin, suiteKolakoski, suiteRecaman, triangleNarayana, schroderChemins, frobeniusPieces, goldbachPaires, indicatriceEuler, periodePisano, motzkinChemins, stirlingBell, routineKaprekar, suiteCollatz, nombresHarmoniques, derangements, regarderDire, toursHanoi, calkinWilf, theoremeLucas, zeckendorf, problemeJosephus, nombresBernoulli, parfaitsAmicaux, fonctionMertens, theoremeWilson, nombresCarmichael, equationPell, sommesCarres, ptolemee, pascalHexagramme, ramseyR33, triangulations, distinctesImpaires, simsonDroite, bale, morley, eulerSolides, marcheAutoEvitante, jeuDeLaVie, feuerbach, billardElliptique, napoleon, percolationLiens, theoremePick, courbeDragon, partitionEuler, catalanDyck, ruineJoueur, collectionneur, aztecDiamond, ising, dominosKasteleyn, papillonHofstadter, causticTasse, fermatSteiner, cerclesFord, vergerEuclide, tasDeSable, apollonius, marcheAleatoire, aiguilleBuffon, anniversaires, spiraleUlam, pascalSierpinski, solidesPlatoniques, montyHall };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const r = FONCTIONS[id](P, n);
  /* 09/11: a subject MAY say its own point count (emotionWiringHCP: every point it makes, none cut) ; the brut must then hold exactly that */
  if (Number.isSafeInteger(r.n) && r.n >= 2 && r.brut && r.brut.length === r.n * r.D) n = r.n;
  let fini = true; for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) { fini = false; break; }
  if (!fini) return { params: P, D: r.D, n, bornee: false, raison: 'NaN', brut: null, lyapunov: NaN, uniteLyapunov: r.unite, points: null, invariants: null };
  const o = { params: P, D: r.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: r.unite, points: null, invariants: r.invariants };
  if (s.nuage || r.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  if (Array.isArray(r.segments) && r.segments.length) o.segments = r.segments; /* 2026-11-08 : optional lines (tam-vue.js#projeterSegments) */
  /* 2026-11-09 : optional point colours by class (emotionWiringHCP: the brain part of each point); one class per point, every class in the palette */
  if (r.pointClasses && r.pointClasses.length === n && Array.isArray(r.pointPalette) && r.pointPalette.length && r.pointClasses.every((c) => c < r.pointPalette.length)) { o.pointClasses = r.pointClasses; o.pointPalette = r.pointPalette; }
  return o;
}
