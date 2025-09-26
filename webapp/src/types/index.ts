export type TestType = "single" | "cards" | "multi";

export interface AnswerDraft {
  id?: string;
  orderNum: number;
  text?: string;
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

export interface TestDraft {
  id?: string;
  slug: string;
  title: string;
  type: TestType;
  description?: string;
  isPublic: boolean;
  questions: QuestionDraft[];
  answers: AnswerDraft[];
  results: ResultDraft[];
}
