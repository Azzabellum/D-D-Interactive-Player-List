import defaultItems from "../shared/default-items.json";
export type Status = "draft" | "submitted" | "approved";
export type OriginKind = "species" | "class" | "background";
export type EquipmentTraining = {
  weapons: string[];
  armor: string[];
  tools: string[];
  toolChoice?: { count: number; options: string[] };
};
export type StartingPack = {
  id: string;
  name: string;
  gold: number;
  items: {
    name: string;
    quantity: number;
    combat?: CombatProfile;
    weightGrams?: number;
  }[];
  toolOptions?: string[];
  useClassTool?: boolean;
  useBackgroundTool?: boolean;
};
export type OriginCard = {
  hitDie?: number;
  firstLevelHpBonus?: number;
  startingGold?: number;
  startingPacks?: StartingPack[];
  classRules?: {
    equipment?: EquipmentTraining;
    count: number;
    skills: string[];
    saves: string[];
    expertiseCount?: number;
  };
  trainedSkills?: string[];
  toolOptions?: string[];
  boostAbilities?: number[];
  id: string;
  kind: OriginKind;
  name: string;
  summary: string;
  description: string;
  source: string;
  archived: boolean;
};
export type Condition = {
  id: string;
  name: string;
  source: string;
  duration: string;
  note: string;
};
export type Concentration = { name: string; duration: string; note: string };
export type Adjustment = {
  id: string;
  source: string;
  target: string;
  value: number;
  enabled: boolean;
};
export type Resource = {
  id: string;
  name: string;
  kind: "slot" | "feature";
  level?: number;
  max: number;
  current: number;
  shortRest: number;
  longRest: number;
};
export type Ability = {
  id: string;
  kind: "spell" | "feature";
  name: string;
  description: string;
  source: string;
  tags: string[];
  spell?: {
    level: number;
    castingTime: string;
    range: string;
    duration: string;
    components: string;
    concentration: boolean;
    ritual: boolean;
  };
};
export type CombatProfile =
  | {
      kind: "weapon";
      grip?: "one" | "two";
      category: "simple" | "martial";
      mode: "melee" | "ranged";
      damage: string;
      damageType: "bludgeoning" | "piercing" | "slashing";
      properties: string[];
      versatile?: string;
      range?: string;
      mastery?: string;
      attackBonus?: number;
      damageBonus?: number;
    }
  | {
      kind: "armor";
      category: "light" | "medium" | "heavy" | "shield";
      base: number;
      strength?: number;
      stealth?: boolean;
      bonus?: number;
    };
export type CombatResult = {
  baseAc: number;
  acFormula: string;
  automatic: boolean;
  warnings: string[];
  attacks: {
    id: string;
    name: string;
    ability: string;
    trained: boolean;
    abilityModifier: number;
    proficiencyBonus: number;
    attackBonus: number;
    styleAttack?: number;
    extraLightDamageModifier?: number;
    monkDamage?: string;
    damageDieMinimum?: number;
    attack: number;
    damage: string;
    damageModifier: number;
    damageType: string;
    versatile?: string;
    range?: string;
    mastery?: string;
    notes: string[];
  }[];
};
export type Item = {
  combat?: CombatProfile;
  combatProficiency?: boolean;
  weightGrams?: number;
  effects?: { target: string; value: number }[];
  id: string;
  name: string;
  type: string;
  description: string;
  secret?: string;
  revealed: boolean;
  quantity?: number;
  equipped?: boolean;
  requiresAttunement?: boolean;
  attuned?: boolean;
  maxCharges?: number;
  charges?: number;
  tags?: string[];
};
export type CombatFeatures = {
  defense: "standard" | "barbarian" | "monk";
  styles: string[];
  monkLevel: number;
};
export type Character = {
  combatFeatures?: CombatFeatures;
  acMode?: "manual" | "equipment";
  initialVitals?: {
    hitDie: number;
    constitution: number;
    bonus: number;
    maxHp: number;
  };
  initialEquipment?: {
    className: string;
    classChoice: string;
    backgroundGold: number;
    backgroundChoice?: string;
    gold: number;
  };
  classTraining?: {
    equipment?: EquipmentTraining;
    skills: string[];
    saves: string[];
    source: string;
    expertise?: string[];
  };
  classTrainingEnabled?: boolean;
  backgroundTraining?: { skills: string[]; tools: string[]; source: string };
  backgroundTrainingEnabled?: boolean;
  firstLevel?: {
    calculateHp?: boolean;
    classEquipment?: string;
    equipmentTool?: string;
    backgroundGold?: boolean;
    backgroundEquipment?: string;
    boosts: number[];
    languages: string[];
    tool?: string;
    classSkills?: string[];
    classTools?: string[];
    expertise?: string[];
  };
  originChoices?: Record<OriginKind, string>;
  originCards?: Record<OriginKind, OriginCard>;
  conditions?: Condition[];
  concentration?: Concentration | null;
  adjustments?: Adjustment[];
  resources?: Resource[];
  creation?: {
    pack: string;
    boosts: number[];
    skills: string[];
    languages: string[];
    gamingSet: string;
    weapons: string[];
  };
  baseStats?: number[];
  level?: number;
  skillRanks?: Record<string, number>;
  saveProficiencies?: string[];
  rulesNote?: string;
  rulesConfigured?: boolean;
  derived?: {
    combat?: CombatResult;
    inventoryWeight?: {
      knownGrams: number;
      unknownItems: number;
      unknownUnits: number;
    };
    ac?: number;
    adjustments?: Adjustment[];
    version: string;
    proficiency: number;
    modifiers: Record<string, number>;
    skills: {
      id: string;
      name: string;
      ability: string;
      rank: number;
      base: number;
      bonus: number;
      total: number;
    }[];
    saves: {
      ability: string;
      trained: boolean;
      base: number;
      bonus: number;
      total: number;
    }[];
    initiative: number;
    passivePerception: number;
  };
  id: string;
  name: string;
  owner: string;
  ownerId?: string;
  version?: number;
  noteVersion?: number;
  species: string;
  cls: string;
  background: string;
  hp: number;
  maxHp: number;
  ac: number;
  acSource?: "starter" | "manual";
  status: Status;
  bio: string;
  note: string;
  dmNote: string;
  feedback: string;
  stats: number[];
  items: Item[];
  abilities?: Ability[];
  color: string;
};
export type Event = {
  id: string;
  characterId: string;
  title: string;
  detail: string;
  time: string;
  before: Character;
  undone: boolean;
  canUndo?: boolean;
};
export type State = {
  characterOptions?: OriginCard[];
  libraryArchive?: { items: string[]; abilities: string[] };
  abilityLibrary?: Ability[];
  library?: Item[];
  id?: string;
  version?: number;
  role?: "dm" | "player";
  memberCount?: number;
  members?: { id: string; name: string; role: string }[];
  characters: Character[];
  events: Event[];
  commonNote: string;
  campaign: string;
  description: string;
};
export const labels = {
  draft: "Черновик",
  submitted: "На утверждении",
  approved: "В игре",
};
export const statNames = [
  "Сила",
  "Ловкость",
  "Телосложение",
  "Интеллект",
  "Мудрость",
  "Харизма",
];
export const library: Item[] = defaultItems;

export function modifier(n: number) {
  return Math.floor((n - 10) / 2);
}
export function signed(n: number) {
  return n >= 0 ? "+" + n : String(n);
}
