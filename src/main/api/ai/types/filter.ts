// Interface definitions for AI Filter
export interface AIFilterRequest {
  id: string;
  name: string;
  prompt: string;
  outputLabels: Array<string>;
  moveToTrash: boolean;
  markAsDone: boolean;
  isActive: boolean;
}

export interface AIFilterResponse {
  id: string;
  name: string;
  prompt: string;
  outputLabels: Array<string>;
  moveToTrash: boolean;
  markAsDone: boolean;
  isActive: boolean;
}

// Interface definitions for AI Filter Test
export interface AIFilterTestEmailData {
  id: string;
  content: string;
}

export interface AIFilterTestRequest {
  prompt: string;
  data: AIFilterTestEmailData[];
}

export interface AIFilterTestResult {
  id: string;
  isFiltered: boolean;
}

export interface AIFilterTestResponse {
  result: AIFilterTestResult[];
}
