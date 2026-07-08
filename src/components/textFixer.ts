export function textFixer(text: string) {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const persianDigitsRegex = /[۰۱۲۳۴۵۶۷۸۹]/g;

  const fixed = text
    .trim()
    .replace(/\s+/g, " ") //multi space
    .replace(/&/g, "")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .replace(/;/g, "")
    .replace(/#/g, "")
    .replace(/\u200F/g, "") //right to left
    .replace(/\u200E/g, "") //right to left
    .replace(/\u200C/g, " ") //نیم فاصله
    .replace(/\//g, "")
    .replace(persianDigitsRegex, (char) => `${persianDigits.indexOf(char)}`);

  return fixed;
}

export function digitFixer(text: string) {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const persianDigitsRegex = /[۰۱۲۳۴۵۶۷۸۹]/g;

  const fixed = text.replace(
    persianDigitsRegex,
    (char) => `${persianDigits.indexOf(char)}`,
  );
  return fixed;
}
