export const TRAITS = ['思考能力','记忆力','表达能力','勤奋程度','专注力','可塑性','风险偏好','耐心'] as const;
export const MARKETS = ['生活产出','学习产出','生产增益'] as const;
export type Triple = [number, number, number];
export interface SimulationConfig {
  population: number; years: number; seed: string; wealthMode: 'equal' | 'unequal';
  heredity: number; plasticity: number; capitalEfficiency: number; coordinationCost: number;
  switchingCost: number; searchSize: number; familySupport: number; inheritance: number;
}
export interface Person {
  id: number; age: number; born: number; parents: number[]; children: number[];
  base: number[]; traits: number[]; skills: Triple; cash: number; capital: number;
  fatigue: number; satisfaction: number; sector: number; employer: number | null;
  price: number; offered: number; sold: number; income: number; labourIncome: number;
  ownerIncome: number; expense: number; familyGiven: number; familyReceived: number;
  inheritanceReceived: number; customers: Triple; expected: Triple; rank50: number | null;
}
export interface FamilyRecord {
  id: number; born: number; death: number | null; parents: number[]; children: number[];
  base: number[]; rank50: number | null; milestones: {month:number;text:string}[];
}
export interface MarketMetric {
  price: number; supply: number; volume: number; revenue: number; demand: number;
  selfUse: number; sellers: number; topShare: number; hhi: number; leader: number | null;
  entrants: number; testedEntrants: number; survivedEntrants: number; leaderMonths: number;
}
export interface Ledger {
  cashError: number; capitalError: number; capitalBefore: number; capitalCreated: number;
  depreciation: number; capitalAfter: number; traded: number; inheritanceTransferred: number;
  supportTransferred: number; maxOversell: number;
}
export interface MetricFrame {
  month: number; gini: number; cashGini: number; totalWealth: number; totalCash: number;
  medianWealth: number; top10: number; satisfaction: number; employment: number;
  meanSkill: number; births: number; markets: MarketMetric[]; ledger: Ledger;
  mobilitySamples: number; upward: number | null; topRetention: number | null;
}
export interface PersonPoint {month:number;cash:number;capital:number;income:number;skill:number;}
export interface WorldState {
  version: 1; config: SimulationConfig; month: number; rng: number; nextId: number;
  initialCash: number; people: Person[]; family: Record<number,FamilyRecord>;
  history: MetricFrame[]; markets: MarketMetric[]; mobility: number[][];
  entrantCohorts: {id:number;sector:number;month:number}[]; previousUnits: string[];
  tracked: number[]; trajectories: Record<number,PersonPoint[]>;
  interventions: {month:number;changes:Partial<SimulationConfig>}[];
}
export interface ExperimentRecord {version:1; name:string; savedAt:string; world:WorldState; baseline?:WorldState;}
export interface BatchRow {seed:string;scenario:string;gini:number;top10:number;maxShare:number;employment:number;upward:number|null;samples:number;cashError:number;}
export interface Snapshot {
  config:SimulationConfig; month:number; frame:MetricFrame; history:MetricFrame[];
  people:Person[]; mobility:number[][]; tracked:number[]; interventions:WorldState['interventions'];
}
export type WorkerRequest =
  | {type:'init';config:SimulationConfig}
  | {type:'step';months:number}
  | {type:'run';speed:number}
  | {type:'pause'}
  | {type:'inspect';id:number}
  | {type:'track';id:number}
  | {type:'export';purpose:'download'|'save'|'branch'}
  | {type:'import';record:ExperimentRecord}
  | {type:'branch';changes:Partial<SimulationConfig>}
  | {type:'batch';seeds:number;years:number;population:number}
  | {type:'cancelBatch'};
