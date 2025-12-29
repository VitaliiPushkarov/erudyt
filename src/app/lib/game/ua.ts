export const UA_POINTS: Record<string, number> = {
  О: 1,
  А: 1,
  И: 1,
  Н: 1,
  Е: 1,
  І: 1,
  Т: 1,
  Р: 1,
  В: 1,
  К: 2,
  С: 2,
  М: 2,
  Д: 2,
  Л: 2,
  П: 2,
  У: 3,
  З: 4,
  Я: 4,
  Б: 4,
  Г: 4,
  Ч: 5,
  Х: 5,
  Й: 5,
  Ь: 5,
  Ж: 6,
  Ї: 6,
  Ц: 6,
  Ш: 6,
  Ю: 7,
  Є: 8,
  Ф: 8,
  Щ: 8,
  Ґ: 10,
  "'": 10,
}

export const UA_DISTRIBUTION: Record<string, number> = {
  О: 10,
  А: 8,
  И: 7,
  Н: 7,
  Е: 5,
  І: 5,
  Т: 5,
  Р: 5,
  В: 4,
  К: 4,
  С: 4,
  М: 4,
  Д: 3,
  Л: 3,
  П: 3,
  У: 3,
  З: 2,
  Я: 2,
  Б: 2,
  Г: 2,
  Ч: 1,
  Х: 1,
  Й: 1,
  Ь: 1,
  Ж: 1,
  Ї: 1,
  Ц: 1,
  Ш: 1,
  Ю: 1,
  Є: 1,
  Ф: 1,
  Щ: 1,
  Ґ: 1,
  "'": 1,
}

// (опційно) 2 бланки як в стандарті — поки не додаємо, бо треба UI для вибору літери
export function buildBagUA() {
  const bag: string[] = []
  for (const [ch, n] of Object.entries(UA_DISTRIBUTION)) {
    for (let i = 0; i < n; i++) bag.push(ch)
  }
  // shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

export function isValidUATile(ch: string) {
  return Object.prototype.hasOwnProperty.call(UA_POINTS, ch)
}
