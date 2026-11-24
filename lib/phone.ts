export function cleanPhoneNumber(input: string): string | null {
  // Remove spaces, dashes, parentheses
  let cleaned = input.replace(/[\s\-()]/g, '');

  // Strip leading +91, 91 (if 12 digits), or 0 (if 11 digits)
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Must be exactly 10 digits
  if (!/^\d{10}$/.test(cleaned)) {
    return null;
  }

  return `+91${cleaned}`;
}