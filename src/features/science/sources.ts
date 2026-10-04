/**
 * Реестр научных оснований RYNJI. Каждый алгоритм ссылается на запись отсюда, а `docs/SCIENCE.md`
 * описывает, что именно взято из источника и что является эвристикой.
 *
 * kind: 'evidence' — число/диапазон взяты из источника; 'heuristic' — инженерное правило RYNJI,
 * согласованное с источником, но не взятое из него напрямую.
 */
export interface ScienceSource {
  id: string;
  title: string;
  org: string;
  year: string;
  url: string;
}

const doi = (d: string) => `https://doi.org/${d}`;

export const SOURCES = {
  mifflin1990: { id: 'mifflin1990', title: 'A new predictive equation for resting energy expenditure in healthy individuals (Mifflin, St Jeor et al.)', org: 'Am J Clin Nutr', year: '1990', url: doi('10.1093/ajcn/51.2.241') },
  frankenfield2005: { id: 'frankenfield2005', title: 'Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review', org: 'J Am Diet Assoc', year: '2005', url: doi('10.1016/j.jada.2005.02.005') },
  hall2008: { id: 'hall2008', title: 'What is the required energy deficit per unit weight loss? (Hall)', org: 'Int J Obes', year: '2008', url: doi('10.1038/sj.ijo.0803720') },
  iraki2019: { id: 'iraki2019', title: 'Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review (Iraki, Fitschen, Espinar, Helms)', org: 'Sports (MDPI)', year: '2019', url: doi('10.3390/sports7070154') },
  helms2023: { id: 'helms2023', title: 'Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals', org: 'Sports Med Open', year: '2023', url: doi('10.1186/s40798-023-00651-y') },
  helms2014: { id: 'helms2014', title: 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation', org: 'J Int Soc Sports Nutr', year: '2014', url: doi('10.1186/1550-2783-11-20') },
  morton2018: { id: 'morton2018', title: 'Protein supplementation and resistance training-induced gains in muscle mass and strength: systematic review, meta-analysis and meta-regression', org: 'Br J Sports Med', year: '2018', url: doi('10.1136/bjsports-2017-097608') },
  issnProtein2017: { id: 'issnProtein2017', title: 'ISSN Position Stand: protein and exercise', org: 'J Int Soc Sports Nutr', year: '2017', url: doi('10.1186/s12970-017-0177-8') },
  iomDri2005: { id: 'iomDri2005', title: 'Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids (AMDR 20–35% жиров; клетчатка 14 г/1000 ккал)', org: 'Institute of Medicine (National Academies)', year: '2005', url: doi('10.17226/10490') },
  acsm2026: { id: 'acsm2026', title: 'ACSM Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults — An Overview of Reviews', org: 'Med Sci Sports Exerc', year: '2026', url: doi('10.1249/MSS.0000000000003897') },
  acsm2009: { id: 'acsm2009', title: 'ACSM Position Stand: Progression models in resistance training for healthy adults (правило +2–10% нагрузки)', org: 'Med Sci Sports Exerc', year: '2009', url: doi('10.1249/MSS.0b013e3181915670') },
  schoenfeld2017: { id: 'schoenfeld2017', title: 'Dose-response relationship between weekly resistance training volume and increases in muscle mass: meta-analysis', org: 'J Sports Sci', year: '2017', url: doi('10.1080/02640414.2016.1210197') },
  zourdos2016: { id: 'zourdos2016', title: 'Novel Resistance Training–Specific RPE Scale Measuring Repetitions in Reserve', org: 'J Strength Cond Res', year: '2016', url: doi('10.1519/JSC.0000000000001049') },
  who2020: { id: 'who2020', title: 'WHO guidelines on physical activity and sedentary behaviour', org: 'ВОЗ', year: '2020', url: 'https://www.who.int/publications/i/item/9789240015128' },
  paluch2022: { id: 'paluch2022', title: 'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts', org: 'Lancet Public Health', year: '2022', url: doi('10.1016/S2468-2667(21)00302-9') },
  ding2025: { id: 'ding2025', title: 'Daily steps and health outcomes in adults: a systematic review and dose-response meta-analysis', org: 'Lancet Public Health', year: '2025', url: 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext' },
  watson2015: { id: 'watson2015', title: 'Recommended Amount of Sleep for a Healthy Adult: AASM & SRS Joint Consensus', org: 'Sleep', year: '2015', url: doi('10.5665/sleep.4716') },
  plews2013: { id: 'plews2013', title: 'Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring', org: 'Sports Med', year: '2013', url: doi('10.1007/s40279-013-0071-8') },
  compendium2024: { id: 'compendium2024', title: '2024 Adult Compendium of Physical Activities (MET-значения)', org: 'J Sport Health Sci / ASU', year: '2024', url: 'https://pacompendium.com/' },
} satisfies Record<string, ScienceSource>;

export type SourceId = keyof typeof SOURCES;

/** Пометка для объяснений в интерфейсе: научный расчёт, эвристика или оценка */
export type Basis = { kind: 'evidence' | 'heuristic' | 'estimate'; sources: SourceId[]; note?: string };

export const BASIS_LABEL: Record<Basis['kind'], string> = {
  evidence: 'по научным данным',
  heuristic: 'правило RYNJI (эвристика)',
  estimate: 'оценка',
};
