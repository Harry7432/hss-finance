/**
 * Parses a user-typed amount (Brazilian "123,45", plain "123.45", or "150")
 * into the exact string format the backend's `amountSchema` accepts:
 * a positive value with at most 2 decimal places, always padded to 2
 * (e.g. "150" -> "150.00"). Returns null for anything ambiguous or invalid
 * rather than guessing — in particular a single dot with more than 2
 * fraction digits (e.g. "1.234") is rejected instead of being treated as a
 * thousands separator, since that guess could silently 10x/1000x a value.
 */
export function parseAmountInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();

  if (trimmed === '' || !/^[\d.,]+$/.test(trimmed)) {
    return null;
  }

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    if (trimmed.lastIndexOf(',') < trimmed.lastIndexOf('.')) {
      return null;
    }

    normalized = trimmed.replaceAll('.', '').replace(',', '.');
  } else if (hasComma) {
    normalized = trimmed.replace(',', '.');
  } else {
    normalized = trimmed;
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [integerPart = '0', fractionPart] = normalized.split('.');
  const strippedInteger = integerPart.replace(/^0+(?=\d)/, '');

  if (strippedInteger.length > 12) {
    return null;
  }

  const canonical = `${strippedInteger}.${(fractionPart ?? '').padEnd(2, '0')}`;

  return Number(canonical) > 0 ? canonical : null;
}
