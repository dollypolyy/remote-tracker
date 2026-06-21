export type EarningModel = 'время' | 'продуктизир. услуга' | 'актив-рычаг'
export type AiFit = '0' | '1' | '2' | '3'
export type Speed = 'дни' | 'недели' | 'месяцы'
export type Scale = 'низкий' | 'средний' | 'высокий'
export type MeaningFit = 'да' | 'частично' | 'нет'
export type Energy = '↑' | '↓' | '?'

export interface EarningWay {
  id: string
  name: string
  model: EarningModel | ''
  channel: string
  aiFit: AiFit | ''
  entryThreshold: string
  speed: Speed | ''
  scale: Scale | ''
  meaningFit: MeaningFit | ''
  energy: Energy | ''
  whoEarns: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type OutreachStatus =
  | 'не писала'
  | 'написала'
  | 'ответил(а)'
  | 'созвон назначен'
  | 'поговорили'
  | 'архив'

export interface Person {
  id: string
  name: string
  foundAt: string
  earns: string
  connectionToWay: string
  contact: string
  outreachStatus: OutreachStatus | ''
  touchDate: string
  insights: string
  createdAt: string
  updatedAt: string
}

export type TestType = 'услуга-оффер' | 'контент' | 'лендинг' | 'пилот'
export type HypothesisDecision = 'развивать' | 'на паузу' | 'в архив'

export interface Hypothesis {
  id: string
  hypothesis: string
  fromWay: string
  testType: TestType | ''
  minStep: string
  successMetric: string
  deadline: string
  result: string
  decision: HypothesisDecision | ''
  createdAt: string
  updatedAt: string
}

export interface DiaryEntry {
  id: string
  date: string
  text: string
  energy: Energy | ''
  checklist: Record<string, boolean>
  createdAt: string
  updatedAt: string
}

export type Collection = 'ways' | 'people' | 'hypotheses' | 'diary'

export type CollectionMap = {
  ways: EarningWay
  people: Person
  hypotheses: Hypothesis
  diary: DiaryEntry
}
