import Color from 'color';
import DOMPurify from 'dompurify';

/**
 * Transforms an HTML email to be compatible with dark mode
 * Similar to Gmail's approach, this:
 * - Preserves important brand colors
 * - Makes backgrounds transparent or darker
 * - Ensures text is readable on dark backgrounds
 * - Handles various color formats (hex, rgb, rgba, named colors)
 * - Properly processes tables, divs, and other common email elements
 * - Uses a consistent blue color for links
 * - Inverts button colors for better contrast
 */
export function transformEmailForDarkMode(htmlString: string, isDarkMode: boolean): string {
  if (!isDarkMode) return htmlString;

  // Parse the HTML string into a DOM structure
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Process style tags to handle CSS rules
  doc.querySelectorAll('style').forEach((styleElement) => {
    const cssText = styleElement.textContent || '';
    styleElement.textContent = transformCssForDarkMode(cssText);
  });

  // Process all elements
  processElementsForDarkMode(doc.body);

  // Add default text color to the body to ensure all unmarked text is visible
  doc.body.style.color = '#c9cccf';

  // Return the transformed HTML
  return DOMPurify.sanitize(doc.body.innerHTML, {
    ADD_ATTR: ['target', 'data-open-modal', 'bgColor', 'color', 'borderColor', 'align'],
    ADD_TAGS: ['div']
  });
}

/**
 * Recursively processes all elements for dark mode compatibility
 */
function processElementsForDarkMode(element: HTMLElement): void {
  // Skip processing for certain elements
  if (shouldSkipElement(element)) {
    return;
  }

  // Process current element
  transformElementForDarkMode(element);

  // Process children recursively
  Array.from(element.children).forEach((child) => {
    processElementsForDarkMode(child as HTMLElement);
  });
}

/**
 * Determines if an element should be skipped during dark mode transformation
 */
function shouldSkipElement(element: HTMLElement): boolean {
  // Skip elements with specific classes that should maintain their styling
  const skipClasses = ['mono-content-reset', 'no-dark-transform'];
  return skipClasses.some((cls) => element.classList.contains(cls));
}

/**
 * Transforms a single element for dark mode
 */
function transformElementForDarkMode(element: HTMLElement): void {
  // Handle inline styles
  transformInlineStyles(element);

  // Handle color attributes common in emails
  transformColorAttributes(element);

  // Handle special cases (tables, links, etc.)
  handleSpecialCases(element);

  // Add a default text color to text nodes if no color is specified
  // This helps with text that doesn't have explicit styling
  if (isTextNode(element) && !hasExplicitTextColor(element)) {
    element.style.color = '#c9cccf';
  }
}

/**
 * Checks if an element is likely to contain text (not a container or structural element)
 */
function isTextNode(element: HTMLElement): boolean {
  const textNodeTags = [
    'p',
    'span',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'td',
    'th',
    'div',
    'font'
  ];

  // Using the Boolean helper to coerce empty strings, null or undefined to false
  return (
    textNodeTags.includes(element.tagName.toLowerCase()) &&
    Boolean(element.textContent?.trim().length)
  );
}

/**
 * Checks if an element already has an explicit text color
 */
function hasExplicitTextColor(element: HTMLElement): boolean {
  return !!(
    element.style.color ||
    element.getAttribute('color') ||
    (element.getAttribute('style') && element.getAttribute('style')?.includes('color:'))
  );
}

/**
 * Transforms inline style colors for dark mode
 */
function transformInlineStyles(element: HTMLElement): void {
  const style = element.getAttribute('style');
  if (!style) return;

  // Match all color-related properties
  const colorPropertyRegex = /([a-zA-Z\\-]+)\s*:\s*([^;]+)(;|$)/gi;
  let styleUpdated = false;
  const newStyle = style.replace(colorPropertyRegex, (match, property, value, ending) => {
    property = property.toLowerCase();

    // Handle color properties
    if (isColorProperty(property)) {
      styleUpdated = true;
      const transformedValue = transformColorValue(property, value, element.tagName, element);
      return `${property}: ${transformedValue}${ending}`;
    }

    return match;
  });

  if (styleUpdated) {
    element.setAttribute('style', newStyle);
  }

  // If we have default color in an email (usually black), make sure it's light in dark mode
  // Many emails don't specify color and just rely on the default black
  if (element.nodeName !== 'A' && !style.toLowerCase().includes('color:')) {
    // Default text to light gray if no color is specified
    const augmentedStyle = `${newStyle}; color: #c9cccf;`;
    element.setAttribute('style', augmentedStyle);
  }
}

/**
 * Checks if a CSS property is color-related
 */
function isColorProperty(property: string): boolean {
  // Check for specific color-related properties
  const colorProperties = [
    'color',
    'background',
    'background-color',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'fill',
    'stroke'
  ];

  // Check if it's a border property that can contain color
  const isBorderProperty =
    property === 'border' ||
    property === 'border-top' ||
    property === 'border-right' ||
    property === 'border-bottom' ||
    property === 'border-left' ||
    (property.startsWith('border-') && property.endsWith('-color'));

  return (
    (colorProperties.includes(property.toLowerCase()) || isBorderProperty) &&
    !/(url|none|gradient|image)/i.test(property)
  );
}

/**
 * Transforms HTML color attributes (bgcolor, color, etc.)
 */
function transformColorAttributes(element: HTMLElement): void {
  // Handle bgcolor attribute
  const bgColor = element.getAttribute('bgcolor');
  if (bgColor) {
    element.setAttribute('bgcolor', transformBackgroundColor(bgColor, element.tagName));
  }

  // Handle color attribute
  const color = element.getAttribute('color');
  if (color) {
    // For links, use blue only if not inside button-styled elements
    if (element.tagName.toLowerCase() === 'a' && !isInsideButtonStyled(element)) {
      element.setAttribute('color', '#2563eb'); // text-blue-600
    } else {
      element.setAttribute('color', transformTextColor(color));
    }
  } else if (isTextNode(element)) {
    // If this is a text element with no color, set a default light color
    element.setAttribute('color', '#c9cccf');
  }

  // Handle border color
  const borderColor = element.getAttribute('bordercolor');
  if (borderColor) {
    element.setAttribute('bordercolor', transformBorderColor(borderColor, element));
  }

  // Handle font tags - common in older email templates
  if (element.tagName.toLowerCase() === 'font' && !element.hasAttribute('color')) {
    element.setAttribute('color', '#c9cccf');
  }
}

/**
 * Handles special cases for specific elements
 */
function handleSpecialCases(element: HTMLElement): void {
  const tagName = element.tagName.toLowerCase();

  // Links should be blue only if not inside button-styled elements
  if (tagName === 'a' && !isInsideButtonStyled(element)) {
    element.style.color = '#2563eb'; // text-blue-600
  }

  // Button handling - detect if it's a button
  if (isButtonStyled(element)) {
    transformButtonForDarkMode(element);
  }

  // Tables often need special handling
  if (tagName === 'table' || tagName === 'tr' || tagName === 'td') {
    // Force override white/light backgrounds in tables
    const bgColor = element.style.backgroundColor || element.getAttribute('bgcolor');
    if (bgColor) {
      const colorObj = parseColorValue(bgColor);
      if (colorObj) {
        const brightness = getBrightness(colorObj);
        // If background is very light, make it dark
        if (brightness && brightness > 200) {
          element.style.backgroundColor = 'transparent';
          if (element.getAttribute('bgcolor')) {
            element.setAttribute('bgcolor', 'transparent');
          }
        }
      }
    }

    // Ensure text is visible
    if (!hasTextColor(element)) {
      element.style.color = '#c9cccf'; // Light gray text
    }
  }

  // Images with background might need a border for visibility
  if (tagName === 'img' && element.getAttribute('src')?.includes('cid:')) {
    element.style.border = '1px solid #4a4a4a';
  }

  // Special case for spans - handle parent context
  if (tagName === 'span') {
    const parentElement = element.parentElement;
    if (parentElement) {
      const parentTagName = parentElement.tagName.toLowerCase();

      // If span is within a button-styled element, preserve original button text styling
      if (isButtonStyled(parentElement)) {
        // Don't override - let button styling handle this
      }
      // If span is within an anchor tag (link) that's not button-styled, use blue
      else if (parentTagName === 'a' && !isInsideButtonStyled(parentElement)) {
        element.style.color = '#2563eb'; // text-blue-600
      }
      // Default case for spans without color - common in plain text emails
      else if (!hasTextColor(element)) {
        element.style.color = '#c9cccf';
      }
    } else if (!hasTextColor(element)) {
      element.style.color = '#c9cccf';
    }
  }

  // Handle div with default text that may have inheritance broken in email clients
  if (tagName === 'div' && element.children.length === 0 && !hasTextColor(element)) {
    element.style.color = '#c9cccf';
  }
}

/**
 * Transforms a button element for dark mode
 */
function transformButtonForDarkMode(element: HTMLElement): void {
  const backgroundColor = element.style.backgroundColor || element.getAttribute('bgcolor');

  if (!backgroundColor) return;

  const colorObj = parseColorValue(backgroundColor);
  if (!colorObj) return;

  const brightness = getBrightness(colorObj);

  if (backgroundColor) {
    try {
      const colorObj = parseColorValue(backgroundColor);
      if (!colorObj) return;

      const brightness = getBrightness(colorObj);

      // If it's a dark button (in light mode), keep it dark with light text
      if (brightness && brightness < 100) {
        // Keep the original dark color, just ensure text is readable
        element.style.color = '#ffffff';
        // Don't change background - preserve original button styling
      } else if (brightness && brightness > 200) {
        // If it's a very light button, make it darker but preserve some of its original hue
        const adjustedColor = adjustColor(backgroundColor, {
          lightness: -80,
          saturation: 10
        });

        element.style.backgroundColor = adjustedColor;
        element.style.color = '#ffffff';
        if (element.getAttribute('bgcolor')) {
          element.setAttribute('bgcolor', adjustedColor);
        }
      } else {
        // Medium brightness buttons - tone down slightly
        const adjustedColor = adjustColor(backgroundColor, {
          lightness: -40,
          saturation: -10
        });

        element.style.backgroundColor = adjustedColor;
        element.style.color = '#ffffff';
        if (element.getAttribute('bgcolor')) {
          element.setAttribute('bgcolor', adjustedColor);
        }
      }
    } catch (error) {
      console.warn('Error transforming button:', error);
    }
  } else {
    // If no background color, don't force any styling - preserve original appearance
    // Only ensure text is readable if needed
    if (!element.style.color) {
      element.style.color = '#c9cccf';
    }
  }

  // Only override text color if the button has no explicit text styling
  if (element.getAttribute('color') && brightness && brightness > 150) {
    element.setAttribute('color', '#ffffff');
  }
}

/**
 * Checks if an element has a background color
 */
function hasBackgroundColor(element: HTMLElement): boolean {
  return !!(
    element.style.backgroundColor ||
    element.style.background ||
    element.getAttribute('bgcolor') ||
    element.getAttribute('bg-color') ||
    element.getAttribute('background-color')
  );
}

/**
 * Determines if an element is styled like a button (has background color, padding, etc.)
 */
function isButtonStyled(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  // Explicit button elements or roles
  if (tagName === 'button' || tagName === 'a' || element.getAttribute('role') === 'button') {
    return true;
  }

  // Elements with button class
  if (element.classList.contains('button')) {
    return true;
  }

  // Check for button-like styling
  const style = element.getAttribute('style') || '';
  const hasBackground = hasBackgroundColor(element);
  const hasPadding = !!(element.style.padding || style.includes('padding'));
  const hasDisplay =
    element.style.display === 'inline-block' || style.includes('display: inline-block');

  // If it's an element with background color and padding, it's likely a button
  return hasBackground && hasPadding && (hasDisplay || tagName === 'a');
}

/**
 * Checks if an element has text color
 */
function hasTextColor(element: HTMLElement): boolean {
  return !!(element.style.color || element.getAttribute('color'));
}

/**
 * Transforms CSS text for dark mode
 */
function transformCssForDarkMode(cssText: string): string {
  // First, add universal text color defaults that can be overridden
  cssText = `
    /* Default text colors for dark mode */
    ${cssText}
  `;

  // Handle CSS rules with color values
  return cssText.replace(/([a-zA-Z\\-]+)\s*:\s*([^;}]+)/g, (match, property, value) => {
    property = property.toLowerCase();

    if (isColorProperty(property)) {
      const transformedValue = transformColorValue(property, value, 'STYLE', undefined);
      return `${property}: ${transformedValue}`;
    }

    return match;
  });
}

/**
 * Transform a color value based on the property type
 */
function transformColorValue(
  property: string,
  value: string,
  elementType: string,
  element?: HTMLElement
): string {
  if (value.trim().toLowerCase() === 'transparent') {
    return 'transparent';
  }

  if (property.includes('background')) {
    return transformBackgroundColor(value, elementType);
  } else if (property.includes('color') && !property.includes('background')) {
    // For links, use blue only if not inside button-styled elements
    if (
      elementType.toLowerCase() === 'a' &&
      property === 'color' &&
      element &&
      !isInsideButtonStyled(element)
    ) {
      // return '#2563eb'; // text-blue-600
      return '#1E88E5';
    } else {
      return transformTextColor(value);
    }
  } else if (
    property === 'border-color' ||
    property === 'border' ||
    property === 'border-top' ||
    property === 'border-right' ||
    property === 'border-bottom' ||
    property === 'border-left' ||
    (property.startsWith('border-') && property.endsWith('-color'))
  ) {
    return transformBorderValue(value, element);
  }

  return value;
}

/**
 * Transforms background colors for dark mode
 * Main strategy: Make backgrounds transparent or darker to avoid bright spots
 */
function transformBackgroundColor(color: string, elementType: string): string {
  try {
    // For buttons, we handle them separately
    if (['BUTTON'].includes(elementType) || elementType === 'A') {
      const colorObj = parseColorValue(color);
      if (!colorObj) return '#ffffff'; // Default dark button color

      const brightness = getBrightness(colorObj);

      // If it's a dark button, make it a darker gray
      if (brightness < 100) {
        return '#ffffff';
      }

      // For colored buttons, preserve their character but tone down significantly
      return adjustColor(color, {
        lightness: -60,
        saturation: -10
      });
    }

    const colorObj = parseColorValue(color);
    if (!colorObj) return 'transparent';

    // Get brightness (0-255)
    const brightness = getBrightness(colorObj);

    // Very light backgrounds become transparent (this includes white)
    if (brightness > 200) {
      return 'transparent';
    }

    // Medium brightness backgrounds become very dark
    if (brightness > 100) {
      return adjustColor(color, {
        lightness: -70,
        saturation: -50
      });
    }

    // Already dark backgrounds stay mostly the same but slightly adjusted
    return adjustColor(color, {
      lightness: -10,
      saturation: -10
    });
  } catch (error) {
    console.warn('Error transforming background color:', color, error);
    return 'transparent';
  }
}

/**
 * Transforms text colors for dark mode
 * Main strategy: Ensure text is light enough to be readable on dark backgrounds
 */
function transformTextColor(color: string): string {
  try {
    // Special cases for common text colors
    const lowerColor = color.trim().toLowerCase();
    if (
      lowerColor === 'black' ||
      lowerColor === '#000' ||
      lowerColor === '#000000' ||
      lowerColor === 'rgb(0,0,0)' ||
      lowerColor === 'rgb(0, 0, 0)'
    ) {
      return '#c9cccf'; // Default light gray for black text
    }

    const colorObj = parseColorValue(color);
    if (!colorObj) return '#c9cccf'; // Default light gray

    // Get brightness (0-255)
    const brightness = getBrightness(colorObj);

    // Dark text becomes light
    if (brightness < 150) {
      return adjustColor(color, {
        lightness: 70,
        saturation: -10
      });
    }

    // Already light text stays similar
    return color;
  } catch (error) {
    console.warn('Error transforming text color:', color, error);
    return '#c9cccf'; // Default light gray
  }
}

/**
 * Transforms border values for dark mode (handles both simple colors and composite border values)
 */
function transformBorderValue(value: string, element?: HTMLElement): string {
  // If it's just a color value, transform it directly

  if (isSimpleColorValue(value)) {
    return transformBorderColor(value, element);
  }

  // Handle composite border values like "2px solid #DEDDDC"
  return transformCompositeBorderValue(value, element);
}

/**
 * Checks if a value is a simple color value (not a composite border value)
 */
function isSimpleColorValue(value: string): boolean {
  const trimmedValue = value.trim().toLowerCase();

  // Check for hex colors
  if (trimmedValue.startsWith('#')) return true;

  // Check for rgb/rgba colors
  if (trimmedValue.startsWith('rgb')) return true;

  // Check for hsl/hsla colors
  if (trimmedValue.startsWith('hsl')) return true;

  // Check for named colors (but not border style keywords)
  const hasUnitOrKeyword =
    /\d+(px|em|rem|%)|solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden/i.test(
      trimmedValue
    );

  return !hasUnitOrKeyword;
}

/**
 * Transforms composite border values like "2px solid #DEDDDC"
 */
function transformCompositeBorderValue(value: string, element?: HTMLElement): string {
  try {
    // Split the value into parts
    const parts = value.trim().split(/\s+/);

    // Transform each part that looks like a color
    const transformedParts = parts.map((part) => {
      if (isSimpleColorValue(part)) {
        return transformBorderColor(part, element);
      }
      return part;
    });

    return transformedParts.join(' ');
  } catch (error) {
    console.warn('Error transforming composite border value:', value, error);
    return value; // Return original value if transformation fails
  }
}

/**
 * Transforms border colors for dark mode
 */
function transformBorderColor(color: string, element?: HTMLElement): string {
  try {
    // If element is inside a button, make border transparent
    if (element && isInsideButton(element)) {
      return 'transparent';
    }

    const colorObj = parseColorValue(color);
    if (!colorObj) return '#292929'; // Default dark gray

    // Get brightness (0-255)
    const brightness = getBrightness(colorObj);

    // Light borders become darker
    if (brightness > 150) {
      return adjustColor(color, {
        lightness: -80,
        saturation: -20
      });
    }

    // Dark borders become slightly lighter
    return adjustColor(color, {
      lightness: 0
    });
  } catch (error) {
    console.warn('Error transforming border color:', color, error);
    return '#292929'; // Default dark gray
  }
}

/**
 * Parses a color value into a Color object
 */
function parseColorValue(value: string): Color | null {
  try {
    // Clean and normalize the input
    const cleanedValue = value.trim().toLowerCase();

    // Handle named colors
    if (!/[#(,)]/.test(cleanedValue)) {
      return Color(cleanedValue);
    }

    // Handle hex with alpha
    if (cleanedValue.startsWith('#') && cleanedValue.length === 9) {
      const hex = cleanedValue.substring(0, 7);
      const alpha = parseInt(cleanedValue.substring(7, 9), 16) / 255;
      return Color(hex).alpha(alpha);
    }

    // Handle hex shorthand
    if (cleanedValue.startsWith('#') && cleanedValue.length === 4) {
      const r = cleanedValue[1];
      const g = cleanedValue[2];
      const b = cleanedValue[3];
      return Color(`#${r}${r}${g}${g}${b}${b}`);
    }

    // Handle standard formats
    return Color(cleanedValue);
  } catch {
    // console.warn('Error parsing color:', value);
    return null;
  }
}

/**
 * Gets the perceived brightness of a color (0-255)
 */
function getBrightness(color: Color): number {
  const rgb = color.rgb().array();
  // Weighted brightness formula (perceived brightness)
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

/**
 * Checks if an element is inside a button element
 */
function isInsideButton(element: HTMLElement): boolean {
  // Check if the element itself is a button
  if (isButtonStyled(element)) {
    return true;
  }

  // Check parent elements
  let current = element.parentElement;
  while (current) {
    if (isButtonStyled(current)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Checks if an element is inside a button-styled element or container that should not have blue links
 */
function isInsideButtonStyled(element: HTMLElement): boolean {
  // Check if the element itself is button-styled
  if (isButtonStyled(element)) {
    return true;
  }

  // Check parent elements
  let current = element.parentElement;
  while (current) {
    const tagName = current.tagName.toLowerCase();

    // Check for button-styled elements
    if (isButtonStyled(current)) {
      return true;
    }

    // Check for table cells, buttons, or other elements that shouldn't have blue links
    if (['td', 'th', 'button'].includes(tagName)) {
      return true;
    }

    current = current.parentElement;
  }
  return false;
}

/**
 * Adjusts a color with specified modifications
 */
function adjustColor(
  color: string,
  adjustments: {
    lightness?: number;
    saturation?: number;
    alpha?: number;
  }
): string {
  try {
    let colorObj = parseColorValue(color);
    if (!colorObj) return color;

    if (adjustments.lightness) {
      if (adjustments.lightness > 0) {
        colorObj = colorObj.lighten(adjustments.lightness / 100);
      } else {
        colorObj = colorObj.darken(Math.abs(adjustments.lightness) / 100);
      }
    }

    if (adjustments.saturation) {
      if (adjustments.saturation > 0) {
        colorObj = colorObj.saturate(adjustments.saturation / 100);
      } else {
        colorObj = colorObj.desaturate(Math.abs(adjustments.saturation) / 100);
      }
    }

    if (adjustments.alpha !== undefined) {
      colorObj = colorObj.alpha(adjustments.alpha);
    }

    // Return color in its original format if possible
    if (color.startsWith('#')) {
      return colorObj.hex();
    } else if (color.startsWith('rgb')) {
      if (color.startsWith('rgba')) {
        return colorObj.rgb().string();
      } else {
        return colorObj.rgb().string();
      }
    } else if (color.startsWith('hsl')) {
      return colorObj.hsl().string();
    }

    return colorObj.rgb().string();
  } catch (error) {
    console.warn('Error adjusting color:', color, error);
    return color;
  }
}
