export function normalizeWord(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[’ʻ]/g, "'") // уніфікуємо апострофи
    .replace(/\s+/g, ' ') // зжимаємо пробіли
}
