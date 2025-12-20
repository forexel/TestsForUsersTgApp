

// Global domain types for the test constructor

// Kinds of tests supported by the app
export type TestType = "single" | "cards" | "multi";

// A single answer option (also used as a card for "cards" tests)
export interface AnswerDraft {
  id?: string;
  orderNum: number;
  text?: string;
  // For multi-question scoring tests
  weight?: number;
  // For single-question tests
  isCorrect?: boolean;
  // For card selection tests
  imageUrl?: string;
  localPreview?: string;
  // Optional link to a result bucket (if your design needs it)
  resultId?: string | number | null;
  // Optional explanation that can be shown in result/feedback
  explanationTitle?: string;
  explanationText?: string;
}

// A question with a list of answers
export interface QuestionDraft {
  id?: string;
  orderNum: number;
  text: string;
  answers: AnswerDraft[];
}

// A result bucket (mainly used by multi scoring tests)
export interface ResultDraft {
  id?: string;
  title: string;
  description?: string;
  minScore: number | null;
  maxScore: number | null;
}

export type ScoringMode = "majority" | "points";

// Full test draft used by the editor
export interface TestDraft {
  id?: string;
  slug: string;
  title: string;
  type: TestType;
  description?: string;
  isPublic: boolean;
  bgColor?: string;
  scoringMode?: ScoringMode;
  questions: QuestionDraft[];
  answers: AnswerDraft[]; // used for "cards" tests
  results: ResultDraft[];
}
