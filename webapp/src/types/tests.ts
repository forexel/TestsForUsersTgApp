import { TestType } from "./index";

export interface AnswerRead {
  id: string;
  order_num: number;
  text?: string | null;
  explanation_title?: string | null;
  explanation_text?: string | null;
  image_url?: string | null;
  result_id?: string | null;
}

export interface QuestionRead {
  id: string;
  order_num: number;
  text: string;
  image_url?: string | null;
  answers: AnswerRead[];
}

export interface ResultRead {
  id: string;
  title: string;
  description?: string | null;
  min_score?: number | null;
  max_score?: number | null;
}

export interface TestRead {
  id: string;
  slug: string;
  title: string;
  type: TestType;
  description?: string | null;
  is_public: boolean;
  bg_color?: string | null;
  created_by: number;
  created_by_username?: string | null;
  questions: QuestionRead[];
  answers: AnswerRead[];
  results: ResultRead[];
}
