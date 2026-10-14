// Helper function to safely parse query field and label
export const parseQueryFieldLabel = (
  query: string,
  firstChunkOnly = true
): { field: string; label: string } => {
  if (!query || typeof query !== 'string') {
    return { field: '', label: '' };
  }

  const queryPart = firstChunkOnly ? query.split(' ')[0] : query;
  const colonIndex = queryPart.indexOf(':');

  if (colonIndex === -1) {
    return { field: '', label: '' };
  }

  return {
    field: queryPart.substring(0, colonIndex),
    label: queryPart.substring(colonIndex + 1)
  };
};

// Gmail's search form for a label name. Spaces split the query into separate
// terms ("label:my receipts" = label "my" AND the word "receipts"); Gmail
// expects them hyphenated ("label:my-receipts").
export const buildLabelQuery = (labelName: string): string =>
  `label:${labelName.trim().toLowerCase().replace(/\s+/g, '-')}`;
