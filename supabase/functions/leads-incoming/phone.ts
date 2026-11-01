// Phone cleaning for incoming leads.
// Kept in its own file with no imports, so it can be tested without Supabase.

// Turn a phone number into international form, e.g. 012-345 6789 (MY) -> +60123456789.
// Returns null if the result cannot be a real number.
export function normalizePhone(raw: string, dialCode: string, trunkPrefix: string): string | null {
  const text = raw.trim()
  let digits: string

  if (text.startsWith('+')) {
    // 1. A leading + already carries the country code, so keep the digits and add nothing
    digits = text.replace(/\D/g, '')
  } else if (text.startsWith('00')) {
    // 2. 00 is the international dialling prefix, so the country code is already there
    digits = text.slice(2).replace(/\D/g, '')
  } else {
    // 3. A local number: keep the digits, drop the trunk prefix if there is one, then add the country code
    let local = text.replace(/\D/g, '')
    if (trunkPrefix && local.startsWith(trunkPrefix)) {
      local = local.slice(trunkPrefix.length)
    }
    digits = dialCode + local
  }

  // 4. A real phone number has 8 to 15 digits in total
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
}
