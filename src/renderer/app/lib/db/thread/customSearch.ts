import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { initDB } from '../db';
import { fetchAndConstructThread } from './utils';
import { extractSearchTerms } from '@/renderer/app/lib/highlightThreadText';

export interface SearchOptions {
  limit?: number;
  lastTimestamp?: number;
  searchFields?: SearchField[];
  searchType?: 'fuzzy' | 'exact' | 'semantic';
  minScore?: number;
}

export type SearchField = 'subject' | 'snippet' | 'from' | 'to' | 'cc' | 'bcc' | 'body';

export interface SearchResult {
  thread: MonoThread;
  score: number;
  matchedFields: SearchField[];
  matchedTerms: string[];
}

export interface CustomSearchResponse {
  threads: MonoThread[];
  searchResults: SearchResult[];
  hasLocalResults: boolean;
  totalLocalMatches: number;
}

// Boolean expression types
interface BooleanExpression {
  type: 'term' | 'and' | 'or';
  value?: string;
  left?: BooleanExpression;
  right?: BooleanExpression;
}

interface TermEvaluation {
  term: string;
  score: number;
  matchedFields: SearchField[];
  found: boolean;
}

/**
 * Parse query into Boolean expression tree
 */
function parseQuery(query: string): {
  expression: BooleanExpression | null;
  operators: Array<{ field: string; value: string; negate: boolean }>;
} {
  // First extract operators (from:, to:, etc.) and remove them from the main query
  const operators = extractOperators(query);
  let cleanQuery = query;

  // Remove operators from the query
  const operatorRegex = /(-?)(from|to|subject|cc|bcc|label|has|is|in):([^\s]+|"[^"]*")/gi;
  cleanQuery = cleanQuery.replace(operatorRegex, '').trim();

  if (!cleanQuery) {
    return { expression: null, operators };
  }

  // Tokenize the query
  const tokens = tokenizeQuery(cleanQuery);

  if (tokens.length === 0) {
    return { expression: null, operators };
  }

  // Parse the expression
  const expression = parseExpression(tokens);

  return { expression, operators };
}

/**
 * Tokenize query into terms, operators, and parentheses
 */
function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let inQuotes = false;
  let i = 0;

  while (i < query.length) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentToken += char;
    } else if (inQuotes) {
      currentToken += char;
    } else if (char === '(' || char === ')') {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
        currentToken = '';
      }
      tokens.push(char);
    } else if (char === ' ' || char === '\t') {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
        currentToken = '';
      }
    } else {
      currentToken += char;
    }

    i++;
  }

  if (currentToken.trim()) {
    tokens.push(currentToken.trim());
  }

  return tokens;
}

/**
 * Parse expression with precedence: parentheses > AND > OR
 */
function parseExpression(tokens: string[]): BooleanExpression | null {
  if (tokens.length === 0) return null;

  // Parse OR expressions (lowest precedence)
  return parseOrExpression(tokens);
}

function parseOrExpression(tokens: string[]): BooleanExpression | null {
  let expr = parseAndExpression(tokens);

  while (tokens.length > 0 && tokens[0]?.toLowerCase() === 'or') {
    tokens.shift(); // consume 'OR'
    const right = parseAndExpression(tokens);
    if (right) {
      expr = {
        type: 'or',
        left: expr || undefined,
        right: right
      };
    }
  }

  return expr;
}

function parseAndExpression(tokens: string[]): BooleanExpression | null {
  let expr = parsePrimaryExpression(tokens);

  while (
    tokens.length > 0 &&
    (tokens[0]?.toLowerCase() === 'and' || (tokens[0] !== 'or' && tokens[0] !== ')' && tokens[0]))
  ) {
    // Handle explicit AND or implicit AND (adjacent terms)
    if (tokens[0]?.toLowerCase() === 'and') {
      tokens.shift(); // consume 'AND'
    }

    const right = parsePrimaryExpression(tokens);
    if (right) {
      expr = {
        type: 'and',
        left: expr || undefined,
        right: right
      };
    } else {
      break;
    }
  }

  return expr;
}

function parsePrimaryExpression(tokens: string[]): BooleanExpression | null {
  if (tokens.length === 0) return null;

  const token = tokens.shift()!;

  if (token === '(') {
    const expr = parseOrExpression(tokens);
    if (tokens.length > 0 && tokens[0] === ')') {
      tokens.shift(); // consume ')'
    }
    return expr;
  } else if (token.toLowerCase() !== 'and' && token.toLowerCase() !== 'or' && token !== ')') {
    // This is a search term
    return {
      type: 'term',
      value: token.replace(/"/g, '') // Remove quotes
    };
  }

  return null;
}

/**
 * Evaluate Boolean expression against thread
 */
async function evaluateBooleanExpression(
  expression: BooleanExpression,
  thread: MonoThread,
  searchFields: SearchField[],
  searchType: 'fuzzy' | 'exact' | 'semantic',
  messagesStore: any
): Promise<{
  matches: boolean;
  score: number;
  matchedFields: SearchField[];
  matchedTerms: string[];
}> {
  const termEvaluations = new Map<string, TermEvaluation>();

  // First, evaluate all terms in the expression
  await collectTerms(expression, termEvaluations, thread, searchFields, searchType, messagesStore);

  // Then evaluate the Boolean expression
  const result = evaluateExpression(expression, termEvaluations);

  // Collect all matched fields and terms from successful evaluations
  const matchedFields: SearchField[] = [];
  const matchedTerms: string[] = [];
  let totalScore = 0;
  let termCount = 0;

  for (const [term, evaluation] of termEvaluations) {
    if (evaluation.found) {
      matchedFields.push(...evaluation.matchedFields);
      matchedTerms.push(term);
      totalScore += evaluation.score;
      termCount++;
    }
  }

  return {
    matches: result,
    score: termCount > 0 ? totalScore / termCount : 0,
    matchedFields: [...new Set(matchedFields)],
    matchedTerms: [...new Set(matchedTerms)]
  };
}

/**
 * Collect all unique terms from the expression tree
 */
async function collectTerms(
  expression: BooleanExpression,
  termEvaluations: Map<string, TermEvaluation>,
  thread: MonoThread,
  searchFields: SearchField[],
  searchType: 'fuzzy' | 'exact' | 'semantic',
  messagesStore: any
): Promise<void> {
  if (expression.type === 'term' && expression.value) {
    if (!termEvaluations.has(expression.value)) {
      const evaluation = await evaluateTerm(
        expression.value,
        thread,
        searchFields,
        searchType,
        messagesStore
      );
      termEvaluations.set(expression.value, evaluation);
    }
  } else if (expression.type === 'and' || expression.type === 'or') {
    if (expression.left) {
      await collectTerms(
        expression.left,
        termEvaluations,
        thread,
        searchFields,
        searchType,
        messagesStore
      );
    }
    if (expression.right) {
      await collectTerms(
        expression.right,
        termEvaluations,
        thread,
        searchFields,
        searchType,
        messagesStore
      );
    }
  }
}

/**
 * Evaluate a single term against a thread
 */
async function evaluateTerm(
  term: string,
  thread: MonoThread,
  searchFields: SearchField[],
  searchType: 'fuzzy' | 'exact' | 'semantic',
  messagesStore: any
): Promise<TermEvaluation> {
  let score = 0;
  const matchedFields: SearchField[] = [];
  let found = false;

  // Check thread-level fields
  if (searchFields.includes('subject')) {
    const subjectScore = scoreText(thread.subject || '', [term], searchType);
    if (subjectScore > 0) {
      score += subjectScore * 2; // Subject matches are more important
      matchedFields.push('subject');
      found = true;
    }
  }

  if (searchFields.includes('snippet')) {
    const snippetScore = scoreText(thread.snippet || '', [term], searchType);
    if (snippetScore > 0) {
      score += snippetScore * 1.5;
      matchedFields.push('snippet');
      found = true;
    }
  }

  // Check sender/recipient fields
  const checkRecipients = (recipients: any[], field: SearchField, weight: number) => {
    if (searchFields.includes(field)) {
      for (const recipient of recipients) {
        const nameScore = scoreText(recipient.name || '', [term], searchType);
        const emailScore = scoreText(recipient.email || '', [term], searchType);
        const totalScore = Math.max(nameScore, emailScore);

        if (totalScore > 0) {
          score += totalScore * weight;
          matchedFields.push(field);
          found = true;
        }
      }
    }
  };

  checkRecipients(thread.from, 'from', 1.8);
  checkRecipients(thread.to, 'to', 1.2);
  checkRecipients(thread.cc, 'cc', 1.0);
  checkRecipients(thread.bcc, 'bcc', 1.0);

  // If searching body content, we'd need to load message content
  if (searchFields.includes('body')) {
    // This would require loading full message content
    // Implementation depends on how message content is stored
  }

  return {
    term,
    score,
    matchedFields: [...new Set(matchedFields)],
    found
  };
}

/**
 * Evaluate Boolean expression tree
 */
function evaluateExpression(
  expression: BooleanExpression,
  termEvaluations: Map<string, TermEvaluation>
): boolean {
  switch (expression.type) {
    case 'term':
      if (expression.value) {
        const evaluation = termEvaluations.get(expression.value);
        return evaluation ? evaluation.found : false;
      }
      return false;

    case 'and':
      if (expression.left && expression.right) {
        return (
          evaluateExpression(expression.left, termEvaluations) &&
          evaluateExpression(expression.right, termEvaluations)
        );
      }
      return false;

    case 'or':
      if (expression.left && expression.right) {
        return (
          evaluateExpression(expression.left, termEvaluations) ||
          evaluateExpression(expression.right, termEvaluations)
        );
      }
      return false;

    default:
      return false;
  }
}

/**
 * Custom search algorithm that searches through local storage with intelligent matching
 * Supports fuzzy search, exact matching, field-specific searches, and Boolean logic
 *
 * Boolean Logic Examples:
 * - "meeting AND call" - Both terms must be present
 * - "project OR update" - Either term can be present
 * - "(meeting AND call) OR (project AND update)" - Grouped logic with parentheses
 * - "urgent AND (meeting OR call)" - Mixed grouping
 * - "from:john AND (project OR meeting)" - Combines operators with Boolean logic
 * - "subject:urgent AND call" - Field-specific search with Boolean logic
 *
 * Operator precedence (highest to lowest):
 * 1. Parentheses ()
 * 2. AND (explicit or implicit)
 * 3. OR
 *
 * Notes:
 * - Adjacent terms without operators are treated as implicit AND
 * - Operators are case-insensitive (AND, and, And all work)
 * - Quoted phrases are treated as single terms
 * - Gmail-style operators (from:, to:, subject:, etc.) work with Boolean logic
 */
export async function DBCustomSearchThreadsMultiUser(
  uids: string[],
  query: string,
  options: SearchOptions = {}
): Promise<CustomSearchResponse> {
  const {
    limit = 50,
    lastTimestamp,
    searchFields = ['subject', 'snippet', 'from', 'to'],
    searchType = 'fuzzy',
    minScore = 0.3
  } = options;

  // Parse query for Boolean expressions and operators
  const { expression, operators } = parseQuery(query);

  // If no Boolean expression and no operators, fall back to simple term extraction
  if (!expression && operators.length === 0) {
    const searchTerms = extractSearchTerms(query);
    if (searchTerms.length === 0) {
      return {
        threads: [],
        searchResults: [],
        hasLocalResults: false,
        totalLocalMatches: 0
      };
    }
  }

  const allSearchResults: SearchResult[] = [];

  // Process each user sequentially to avoid database transaction conflicts
  for await (const uid of uids) {
    try {
      const db = await initDB(uid);
      const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
      const threadsStore = tx.objectStore('threads');
      const messagesStore = tx.objectStore('messages');

      // Get all threads for this specific user
      const allThreads = await threadsStore.getAll();

      // Filter out trash and spam threads, apply timestamp filter if provided
      const filteredThreads = allThreads.filter((threadData) => {
        if (
          !threadData ||
          threadData.labelIds.includes('TRASH') ||
          threadData.labelIds.includes('SPAM')
        ) {
          return false;
        }

        // If lastTimestamp is provided, only include threads older than that timestamp
        if (lastTimestamp !== undefined) {
          return threadData.timestamp < lastTimestamp;
        }

        return true;
      });

      // Search through threads for this user
      const userSearchResults: SearchResult[] = [];

      for await (const threadData of filteredThreads) {
        const thread = await fetchAndConstructThread(tx, threadData, uid);
        if (!thread) continue;

        // CRITICAL: Add account ID as non-enumerable property to ensure proper database isolation
        Object.defineProperty(thread, 'accountId', {
          value: uid,
          enumerable: false,
          configurable: true,
          writable: false // Make it immutable to prevent accidental changes
        });

        const searchResult = await scoreThreadWithBoolean(
          thread,
          expression,
          operators,
          query,
          searchFields,
          searchType,
          messagesStore
        );

        if (searchResult.score >= minScore) {
          userSearchResults.push(searchResult);
        }
      }

      // Add this user's results to the overall results
      allSearchResults.push(...userSearchResults);

      await tx.done;
    } catch (error) {
      console.error(`Error searching threads for user ${uid}:`, error);
      // Continue with other users even if one fails
      continue;
    }
  }

  // Sort all results by score (highest first), then by timestamp (newest first)
  const sortedResults = allSearchResults.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.01) {
      return b.thread.timestamp - a.thread.timestamp;
    }
    return b.score - a.score;
  });

  // Apply the limit
  const limitedResults = sortedResults.slice(0, limit);

  return {
    threads: limitedResults.map((result) => result.thread),
    searchResults: limitedResults,
    hasLocalResults: limitedResults.length > 0,
    totalLocalMatches: sortedResults.length
  };
}

/**
 * Extract search operators from query (from:, to:, subject:, etc.)
 */
function extractOperators(query: string): Array<{ field: string; value: string; negate: boolean }> {
  const operators: Array<{ field: string; value: string; negate: boolean }> = [];
  const operatorRegex = /(-?)(from|to|subject|cc|bcc|label|has|is|in):([^\s]+|"[^"]*")/gi;

  let match;
  while ((match = operatorRegex.exec(query)) !== null) {
    const [, negateSymbol, field, value] = match;
    operators.push({
      field: field.toLowerCase(),
      value: value.replace(/"/g, ''), // Remove quotes
      negate: negateSymbol === '-'
    });
  }

  return operators;
}

/**
 * Score a thread using Boolean expressions or fallback to original scoring
 */
async function scoreThreadWithBoolean(
  thread: MonoThread,
  expression: BooleanExpression | null,
  operators: Array<{ field: string; value: string; negate: boolean }>,
  originalQuery: string,
  searchFields: SearchField[],
  searchType: 'fuzzy' | 'exact' | 'semantic',
  messagesStore: any
): Promise<SearchResult> {
  // Check operators first (these can disqualify a thread)
  for (const operator of operators) {
    const operatorMatch = checkOperator(thread, operator);
    if (operator.negate && operatorMatch) {
      return { thread, score: 0, matchedFields: [], matchedTerms: [] };
    }
    if (!operator.negate && !operatorMatch) {
      return { thread, score: 0, matchedFields: [], matchedTerms: [] };
    }
  }

  // If we have a Boolean expression, use it
  if (expression) {
    const booleanResult = await evaluateBooleanExpression(
      expression,
      thread,
      searchFields,
      searchType,
      messagesStore
    );

    // If Boolean expression doesn't match, return zero score
    if (!booleanResult.matches) {
      return { thread, score: 0, matchedFields: [], matchedTerms: [] };
    }

    // Add bonus for matching operators
    let operatorBonus = 0;
    for (const operator of operators) {
      if (checkOperator(thread, operator)) {
        operatorBonus += 0.2;
      }
    }

    return {
      thread,
      score: Math.min(booleanResult.score + operatorBonus, 1),
      matchedFields: booleanResult.matchedFields,
      matchedTerms: booleanResult.matchedTerms
    };
  }

  // Fallback to original scoring logic for queries without Boolean operators
  // Extract search terms from the original query, not from thread content
  const searchTermsFromQuery = extractSearchTerms(
    // Remove operators from the original query and extract search terms
    originalQuery
      .replace(/(-?)(from|to|subject|cc|bcc|label|has|is|in):([^\s]+|"[^"]*")/gi, '')
      .trim()
  );

  if (searchTermsFromQuery.length === 0) {
    return { thread, score: 0, matchedFields: [], matchedTerms: [] };
  }

  return await scoreThread(
    thread,
    searchTermsFromQuery,
    operators,
    searchFields,
    searchType,
    messagesStore
  );
}

/**
 * Score a thread based on search terms and operators
 */
async function scoreThread(
  thread: MonoThread,
  searchTerms: string[],
  operators: Array<{ field: string; value: string; negate: boolean }>,
  searchFields: SearchField[],
  searchType: 'fuzzy' | 'exact' | 'semantic',
  messagesStore: any
): Promise<SearchResult> {
  let score = 0;
  const matchedFields: SearchField[] = [];
  const matchedTerms: string[] = [];
  // Check operators first (these can disqualify a thread)
  for (const operator of operators) {
    const operatorMatch = checkOperator(thread, operator);
    if (operator.negate && operatorMatch) {
      return { thread, score: 0, matchedFields: [], matchedTerms: [] };
    }
    if (!operator.negate && !operatorMatch) {
      return { thread, score: 0, matchedFields: [], matchedTerms: [] };
    }
    if (operatorMatch) {
      score += 0.2; // Bonus for matching operators
    }
  }

  // Score based on search terms
  if (searchTerms.length > 0) {
    // Check thread-level fields
    if (searchFields.includes('subject')) {
      const subjectScore = scoreText(thread.subject || '', searchTerms, searchType);
      if (subjectScore > 0) {
        score += subjectScore * 2; // Subject matches are more important
        matchedFields.push('subject');
        matchedTerms.push(...findMatchingTerms(thread.subject || '', searchTerms));
      }
    }

    if (searchFields.includes('snippet')) {
      const snippetScore = scoreText(thread.snippet || '', searchTerms, searchType);
      if (snippetScore > 0) {
        score += snippetScore * 1.5;
        matchedFields.push('snippet');
        matchedTerms.push(...findMatchingTerms(thread.snippet || '', searchTerms));
      }
    }

    // Check sender/recipient fields
    const checkRecipients = (recipients: any[], field: SearchField, weight: number) => {
      if (searchFields.includes(field)) {
        for (const recipient of recipients) {
          const nameScore = scoreText(recipient.name || '', searchTerms, searchType);
          const emailScore = scoreText(recipient.email || '', searchTerms, searchType);
          const totalScore = Math.max(nameScore, emailScore);

          if (totalScore > 0) {
            score += totalScore * weight;
            matchedFields.push(field);
            matchedTerms.push(
              ...findMatchingTerms(`${recipient.name} ${recipient.email}`, searchTerms)
            );
          }
        }
      }
    };

    checkRecipients(thread.from, 'from', 1.8);
    checkRecipients(thread.to, 'to', 1.2);
    checkRecipients(thread.cc, 'cc', 1.0);
    checkRecipients(thread.bcc, 'bcc', 1.0);

    // If searching body content, we'd need to load message content
    // This is more expensive but provides better results
    if (searchFields.includes('body')) {
      // This would require loading full message content
      // Implementation depends on how message content is stored
    }
  }

  // Normalize score based on number of search terms
  if (searchTerms.length > 0) {
    score = score / searchTerms.length;
  }

  // Remove duplicates from matched terms
  const uniqueMatchedTerms = [...new Set(matchedTerms)];
  const uniqueMatchedFields = [...new Set(matchedFields)];

  return {
    thread,
    score: Math.min(score, 1), // Cap at 1.0
    matchedFields: uniqueMatchedFields,
    matchedTerms: uniqueMatchedTerms
  };
}

/**
 * Check if thread matches a specific operator
 */
function checkOperator(
  thread: MonoThread,
  operator: { field: string; value: string; negate: boolean }
): boolean {
  const { field, value } = operator;
  const lowerField = field.toLowerCase();
  const lowerValue = value.toLowerCase();

  switch (lowerField) {
    case 'from':
      return thread.from.some(
        (from) =>
          from.email.toLowerCase().includes(lowerValue) ||
          from.name.toLowerCase().includes(lowerValue)
      );

    case 'to':
      return thread.to.some(
        (to) =>
          to.email.toLowerCase().includes(lowerValue) || to.name.toLowerCase().includes(lowerValue)
      );

    case 'subject':
      return (thread.subject || '').toLowerCase().includes(lowerValue);

    case 'label':
      return thread.labelIds.some((labelId) => labelId.toLowerCase().includes(lowerValue));

    case 'has':
      if (lowerValue === 'attachment') {
        return Object.keys(thread.attachments || {}).length > 0;
      }
      break;

    case 'is':
      if (lowerValue === 'starred') {
        return thread.labelIds.includes('STARRED');
      }
      if (lowerValue === 'unread') {
        return thread.labelIds.includes('UNREAD');
      }
      if (lowerValue === 'read') {
        return !thread.labelIds.includes('UNREAD');
      }
      break;

    case 'in':
      return thread.labelIds.includes(value.toUpperCase());

    default:
      break;
  }

  return false;
}

/**
 * Score text against search terms
 */
function scoreText(
  text: string,
  searchTerms: string[],
  searchType: 'fuzzy' | 'exact' | 'semantic'
): number {
  if (!text || searchTerms.length === 0) return 0;

  const normalizedText = text.toLowerCase();
  let totalScore = 0;

  for (const term of searchTerms) {
    const normalizedTerm = term.toLowerCase();
    let score = 0;

    switch (searchType) {
      case 'exact':
        if (normalizedText.includes(normalizedTerm)) {
          totalScore += 1;
        }
        break;

      case 'fuzzy':
        score = calculateFuzzyScore(normalizedText, normalizedTerm);
        totalScore += score;
        break;

      case 'semantic':
        // For semantic search, you would implement embedding-based similarity
        // For now, fall back to fuzzy search
        score = calculateFuzzyScore(normalizedText, normalizedTerm);
        totalScore += score;
        break;
    }
  }

  return totalScore / searchTerms.length;
}

/**
 * Calculate fuzzy matching score using simple string similarity
 */
function calculateFuzzyScore(text: string, term: string): number {
  if (text.includes(term)) {
    return 1.0; // Exact substring match
  }

  // Calculate simple edit distance based similarity
  const maxLength = Math.max(text.length, term.length);
  const similarity = 1 - levenshteinDistance(text, term) / maxLength;

  // Only return positive scores for reasonable similarity
  return similarity > 0.6 ? similarity : 0;
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= str2.length; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Find which search terms actually matched in the text
 */
function findMatchingTerms(text: string, searchTerms: string[]): string[] {
  const normalizedText = text.toLowerCase();
  const matchingTerms: string[] = [];

  for (const term of searchTerms) {
    if (normalizedText.includes(term.toLowerCase())) {
      matchingTerms.push(term);
    }
  }

  return matchingTerms;
}

/**
 * Hybrid search that combines local search results with API results
 * This provides the best of both worlds - fast local results with comprehensive API results
 */
export async function hybridSearchThreadsMultiUser(
  uids: string[],
  query: string,
  apiSearchFunction: (query: string) => Promise<MonoThread[]>,
  options: SearchOptions = {}
): Promise<{
  localResults: CustomSearchResponse;
  apiResults: MonoThread[];
  combinedResults: MonoThread[];
  strategy: 'local-only' | 'api-only' | 'hybrid';
}> {
  const { limit = 50 } = options;

  // First, try local search
  const localResults = await DBCustomSearchThreadsMultiUser(uids, query, {
    ...options,
    limit: Math.ceil(limit * 0.7) // Reserve 70% for local results
  });

  // Determine search strategy based on local results
  let strategy: 'local-only' | 'api-only' | 'hybrid' = 'local-only';
  let apiResults: MonoThread[] = [];

  if (localResults.totalLocalMatches < limit * 0.5) {
    // If we don't have enough local results, supplement with API
    strategy = localResults.hasLocalResults ? 'hybrid' : 'api-only';

    try {
      apiResults = await apiSearchFunction(query);
      // Limit API results to fill the gap
      const apiLimit = limit - localResults.threads.length;
      apiResults = apiResults.slice(0, Math.max(apiLimit, Math.ceil(limit * 0.3)));
    } catch (error) {
      console.warn('API search failed, falling back to local results only:', error);
      strategy = 'local-only';
    }
  }

  // Combine and deduplicate results
  const combinedResults = combineAndDeduplicateResults(localResults.threads, apiResults, limit);

  return {
    localResults,
    apiResults,
    combinedResults,
    strategy
  };
}

/**
 * Combine local and API results, removing duplicates and maintaining good ranking
 */
function combineAndDeduplicateResults(
  localThreads: MonoThread[],
  apiThreads: MonoThread[],
  limit: number
): MonoThread[] {
  // Create a map to track seen thread IDs
  const seenThreadIds = new Set<string>();
  const combinedResults: MonoThread[] = [];

  // Add local results first (they're already scored and sorted)
  for (const thread of localThreads) {
    if (!seenThreadIds.has(thread.id) && combinedResults.length < limit) {
      seenThreadIds.add(thread.id);
      combinedResults.push(thread);
    }
  }

  // Add API results, avoiding duplicates
  for (const thread of apiThreads) {
    if (!seenThreadIds.has(thread.id) && combinedResults.length < limit) {
      seenThreadIds.add(thread.id);
      combinedResults.push(thread);
    }
  }

  return combinedResults;
}
