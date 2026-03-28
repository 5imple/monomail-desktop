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

// Helper function to check if a query has the expected format (field:label)
export const isValidQueryFormat = (query: string, firstChunkOnly = true): boolean => {
  const { field, label } = parseQueryFieldLabel(query, firstChunkOnly);
  return field !== '' && label !== '';
};
