declare module '*.svg?react' {
  import * as React from 'react';
  const content: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default content;
}

// Declaration for importing HTML files with '?asset' query parameter
declare module '*.html?asset' {
  const content: string;
  export default content;
} // Declaration for importing PNG files with '?asset' query parameter
declare module '*.png?asset' {
  const content: string;
  export default content;
}

// (Optional) Declaration for importing any HTML files
declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*.wav?asset' {
  const content: string;
  export default content;
}
