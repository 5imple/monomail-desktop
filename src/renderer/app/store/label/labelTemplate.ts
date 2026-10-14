export type LabelColor = {
  textColor: string;
  backgroundColor: string;
};

// Predefined colors for labels
export const LABEL_COLORS: Record<string, LabelColor> = {
  RED: { textColor: '#83334c', backgroundColor: '#f6c5be' },
  GRAY: { textColor: '#464646', backgroundColor: '#e7e7e7' },
  GREEN: { textColor: '#0b4f30', backgroundColor: '#c6f3de' },
  // b9e4d0
  ORANGE: { textColor: '#822111', backgroundColor: '#ffe6c7' },
  YELLOW: { textColor: '#a46a21', backgroundColor: '#a46a21' },
  PURPLE: { textColor: '#3d188e', backgroundColor: '#e3d7ff' },
  BLUE: { textColor: '#1c4587', backgroundColor: '#c9daf8' },
  PINK: { textColor: '#711a36', backgroundColor: '#fcdee8' },
  BLACK: { textColor: '#f3f3f3', backgroundColor: '#000000' }
};
