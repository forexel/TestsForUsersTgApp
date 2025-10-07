export type TestType = "single" | "cards" | "multi";

export interface AnswerDraft {
  id?: string;
  orderNum: number;
  text?: string;
  explanationTitle?: string;
  explanationText?: string;
  imageUrl?: string;
  weight?: number;
  isCorrect?: boolean;
  resultId?: string | null;
}

export interface QuestionDraft {
  id?: string;
  orderNum: number;
  text: string;
  answers: AnswerDraft[];
}

export interface ResultDraft {
  id?: string;
  title: string;
  description?: string;
  minScore?: number | null;
  maxScore?: number | null;
}

export type ScoringMode = "majority" | "points";

export interface TestDraft {
  id?: string;
  slug: string;
  title: string;
  type: TestType;
  description?: string;
  isPublic: boolean;
  // Client-only control that affects how results are calculated for multi-question tests
  scoringMode?: ScoringMode; // 'majority' based on most frequent answer index; 'points' based on sum
  questions: QuestionDraft[];
  answers: AnswerDraft[];
  results: ResultDraft[];
}
