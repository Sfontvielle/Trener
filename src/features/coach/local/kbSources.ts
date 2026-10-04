import type { KnowledgeSource } from '@/types';

/**
 * Источники для статей базы знаний тренера.
 *  • refs — проверенные первоисточники: позиции профессиональных обществ (ISSN, ACSM, IOC),
 *    систематические обзоры/метаанализы, руководства ВОЗ и NIH;
 *  • en — английский запрос для поиска свежих обзоров в PubMed (NCBI), когда есть интернет.
 * Найденное кэшируется на устройстве, чтобы не искать одно и то же повторно.
 */
const doi = (d: string) => `https://doi.org/${d}`;

const ISSN_PROTEIN: KnowledgeSource = { title: 'ISSN Position Stand: protein and exercise (2017)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/s12970-017-0177-8'), year: '2017' };
const MORTON_PROTEIN: KnowledgeSource = { title: 'Protein supplementation and resistance training: systematic review and meta-analysis (Morton et al.)', org: 'Br J Sports Med', url: doi('10.1136/bjsports-2017-097608'), year: '2018' };
const ISSN_CREATINE: KnowledgeSource = { title: 'ISSN Position Stand: safety and efficacy of creatine supplementation (2017)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/s12970-017-0173-z'), year: '2017' };
const ISSN_CAFFEINE: KnowledgeSource = { title: 'ISSN Position Stand: caffeine and exercise performance (2021)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/s12970-020-00383-4'), year: '2021' };
const ISSN_DIETS: KnowledgeSource = { title: 'ISSN Position Stand: diets and body composition (2017)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/s12970-017-0174-y'), year: '2017' };
const ISSN_TIMING: KnowledgeSource = { title: 'ISSN Position Stand: nutrient timing (2017)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/s12970-017-0189-4'), year: '2017' };
const SCHOENFELD_VOLUME: KnowledgeSource = { title: 'Dose-response relationship between weekly resistance training volume and muscle mass: meta-analysis (Schoenfeld et al.)', org: 'J Sports Sci', url: doi('10.1080/02640414.2016.1210197'), year: '2017' };
const ACSM_PROGRESSION: KnowledgeSource = { title: 'ACSM Position Stand: progression models in resistance training for healthy adults', org: 'Med Sci Sports Exerc', url: doi('10.1249/MSS.0b013e3181915670'), year: '2009' };
const SLEEP_ADULT: KnowledgeSource = { title: 'Recommended amount of sleep for a healthy adult: AASM & SRS consensus', org: 'Sleep', url: doi('10.5665/sleep.4716'), year: '2015' };
const IOC_REDS: KnowledgeSource = { title: 'IOC consensus statement on Relative Energy Deficiency in Sport (RED-S)', org: 'Br J Sports Med', url: doi('10.1136/bjsports-2018-099193'), year: '2018' };
const HELMS_PREP: KnowledgeSource = { title: 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation (Helms et al.)', org: 'J Int Soc Sports Nutr', url: doi('10.1186/1550-2783-11-20'), year: '2014' };
const WHO_PA: KnowledgeSource = { title: 'WHO guidelines on physical activity and sedentary behaviour', org: 'ВОЗ', url: 'https://www.who.int/publications/i/item/9789240015128', year: '2020' };
const NIH_VITD: KnowledgeSource = { title: 'Vitamin D — fact sheet for health professionals', org: 'NIH Office of Dietary Supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' };
const NIH_IRON: KnowledgeSource = { title: 'Iron — fact sheet for health professionals', org: 'NIH Office of Dietary Supplements', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/' };
const NIH_OMEGA3: KnowledgeSource = { title: 'Omega-3 fatty acids — fact sheet for health professionals', org: 'NIH Office of Dietary Supplements', url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/' };
const NIH_MG: KnowledgeSource = { title: 'Magnesium — fact sheet for health professionals', org: 'NIH Office of Dietary Supplements', url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/' };
export const COMPENDIUM: KnowledgeSource = { title: 'Compendium of Physical Activities (MET-значения нагрузок)', org: 'Arizona State University / NIH', url: 'https://pacompendium.com/', year: '2024' };

export const KB_SOURCES: Record<string, { en?: string; refs?: KnowledgeSource[] }> = {
  protein: { en: 'protein intake resistance training muscle hypertrophy', refs: [ISSN_PROTEIN, MORTON_PROTEIN] },
  protein_timing: { en: 'protein distribution timing muscle protein synthesis', refs: [ISSN_TIMING, ISSN_PROTEIN] },
  whey: { en: 'whey protein supplementation resistance training', refs: [ISSN_PROTEIN] },
  creatine: { en: 'creatine monohydrate supplementation safety efficacy', refs: [ISSN_CREATINE] },
  caffeine: { en: 'caffeine ergogenic resistance exercise', refs: [ISSN_CAFFEINE] },
  preworkout: { en: 'pre-workout supplement safety', refs: [ISSN_CAFFEINE] },
  calories_cut: { en: 'energy deficit fat loss lean mass retention resistance trained', refs: [ISSN_DIETS] },
  calories_bulk: { en: 'energy surplus muscle gain resistance training', refs: [ISSN_DIETS] },
  maintain_recomp: { en: 'body recomposition resistance training', refs: [ISSN_DIETS] },
  intermittent_fasting: { en: 'intermittent fasting body composition resistance training', refs: [ISSN_DIETS] },
  keto: { en: 'ketogenic diet resistance training lean mass', refs: [ISSN_DIETS] },
  pre_workout: { en: 'pre-exercise meal carbohydrate performance', refs: [ISSN_TIMING] },
  post_workout: { en: 'post-exercise protein carbohydrate recovery', refs: [ISSN_TIMING] },
  carb_timing: { en: 'carbohydrate timing resistance exercise', refs: [ISSN_TIMING] },
  meal_frequency: { en: 'meal frequency body composition', refs: [ISSN_TIMING] },
  volume: { en: 'resistance training volume hypertrophy dose response', refs: [SCHOENFELD_VOLUME] },
  volume_landmarks: { en: 'resistance training volume hypertrophy', refs: [SCHOENFELD_VOLUME] },
  progression: { en: 'progressive overload resistance training', refs: [ACSM_PROGRESSION] },
  periodization: { en: 'periodization resistance training meta-analysis', refs: [ACSM_PROGRESSION] },
  reps: { en: 'repetition range low load high load hypertrophy', refs: [ACSM_PROGRESSION] },
  frequency: { en: 'resistance training frequency hypertrophy meta-analysis', refs: [ACSM_PROGRESSION] },
  rest: { en: 'rest interval between sets hypertrophy', refs: [ACSM_PROGRESSION] },
  rir: { en: 'proximity to failure hypertrophy repetitions in reserve' },
  failure: { en: 'training to failure hypertrophy strength meta-analysis' },
  deload: { en: 'deload resistance training' },
  cardio: { en: 'concurrent training interference hypertrophy', refs: [WHO_PA] },
  steps: { en: 'daily steps mortality', refs: [WHO_PA] },
  sleep: { en: 'sleep deprivation resistance training performance', refs: [SLEEP_ADULT] },
  red_s: { en: 'relative energy deficiency in sport', refs: [IOC_REDS] },
  contest_prep: { en: 'natural bodybuilding contest preparation', refs: [HELMS_PREP] },
  peak_week: { en: 'peak week bodybuilding', refs: [HELMS_PREP] },
  vitamin_d: { en: 'vitamin D supplementation athletes', refs: [NIH_VITD] },
  vitamins: { en: 'micronutrient supplementation athletes', refs: [NIH_VITD] },
  anemia_diet: { en: 'iron deficiency athletes', refs: [NIH_IRON] },
  omega3_magnesium: { en: 'omega-3 supplementation muscle', refs: [NIH_OMEGA3, NIH_MG] },
  blood_pressure: { en: 'resistance training hypertension blood pressure meta-analysis', refs: [WHO_PA] },
  diabetes: { en: 'resistance training type 2 diabetes glycemic control', refs: [WHO_PA] },
  pregnancy: { en: 'resistance exercise pregnancy guidelines', refs: [WHO_PA] },
  women: { en: 'resistance training women hypertrophy' },
  age: { en: 'resistance training older adults sarcopenia', refs: [WHO_PA] },
  insulin_resistance: { en: 'resistance training insulin sensitivity' },
  doms: { en: 'delayed onset muscle soreness recovery' },
  stretch_hypertrophy: { en: 'long muscle length training hypertrophy' },
  mini_cut: { en: 'diet breaks energy restriction' },
  reverse_diet: { en: 'reverse dieting metabolic adaptation' },
  metabolic_adaptation: { en: 'adaptive thermogenesis weight loss' },
  testosterone_natural: { en: 'lifestyle factors testosterone men' },
  low_t: { en: 'male hypogonadism diagnosis' },
  thyroid: { en: 'hypothyroidism exercise' },
  lower_back_pain: { en: 'exercise therapy low back pain' },
  back_pain: { en: 'exercise therapy low back pain' },
  hernia: { en: 'lumbar disc herniation exercise' },
  impingement: { en: 'shoulder impingement exercise therapy' },
  shoulder_pain: { en: 'shoulder pain exercise therapy' },
  knee_patella: { en: 'patellofemoral pain exercise therapy' },
  knee_pain: { en: 'knee pain exercise therapy' },
  tendinopathy: { en: 'tendinopathy loading exercise' },
  elbow_tendon: { en: 'lateral epicondylitis exercise' },
  asthma: { en: 'exercise induced bronchoconstriction' },
  aas_risks: { en: 'anabolic androgenic steroids adverse effects' },
  sarms: { en: 'selective androgen receptor modulators adverse effects' },
  cholesterol_diet: { en: 'dietary fat LDL cholesterol' },
  fiber: { en: 'dietary fiber health outcomes' },
  alcohol: { en: 'alcohol muscle protein synthesis' },
  beta_alanine_citrulline: { en: 'beta-alanine supplementation performance' },
};

/** Ссылка на поиск в PubMed — всегда рабочая, даже без найденных статей */
export function pubmedSearchUrl(en: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(en)}`;
}
