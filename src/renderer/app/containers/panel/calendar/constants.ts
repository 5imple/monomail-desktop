// Grid Constants for consistent spacing and sizing
export const GRID_CONSTANTS = {
  COL_WIDTH: 106,
  ALL_DAY_CHIP_HEIGHT: 19,
  ALL_DAY_CHIP_SPACING: 2,
  ALL_DAY_PADDING_TOP: 3,
  MONTH_VIEW_CELL_PADDING_TOP: 24,
  HEADER_HEIGHT: 74,
  TICK_HEIGHT: 4,
  TICK_MINUTES: 15,
  HIDDEN_ZONE_HEIGHT: 24,
  // Week view specific - using fixed time column width
  WEEK_SLOT_HEIGHT: 16,
  WEEK_PIXELS_PER_HOUR: 64,
  WEEK_TIME_COL_WIDTH: 64,
  // Day view specific
  DAY_SLOT_HEIGHT: 20,
  DAY_PIXELS_PER_HOUR: 80,
  DAY_TIME_COL_WIDTH: 64,
  // Month view specific
  MONTH_DAY_HEIGHT: 80,
  // Maximum number of stacked event rows that a single month-view day cell can display
  MONTH_MAX_EVENT_ROWS: 6
} as const;
