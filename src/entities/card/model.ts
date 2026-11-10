/**
 * Доменная сущность «карта»: нормализация с серверных данных, сортировка,
 * укусы змей. Чистые функции — без зависимостей от UI.
 */

export const SUIT_CLOVER = 1;
export const SUIT_CROSS = 2;
export const SUIT_HARP = 3;
export const SUIT_SNAKE = 4;

export const SUIT_KEYS: Record<number, string> = {
    [SUIT_CLOVER]: 'Clover',
    [SUIT_CROSS]: 'Cross',
    [SUIT_HARP]: 'Harp',
    [SUIT_SNAKE]: 'Snake',
};

/** Карта в клиентском представлении (числовые поля). */
export interface Card {
    id: number;
    suit: number;
    value: number;
    location: string;
    locationArg: number | null;
}

/** Укусы змей за карту: змеиная масть — 1; 7 креста/арфы — 3; иначе 0. */
export function cardBites(card: { suit: number; value: number }): number {
    const suit = card.suit;
    const value = card.value;
    if (suit === SUIT_SNAKE) return 1;
    if (value === 7 && (suit === SUIT_CROSS || suit === SUIT_HARP)) return 3;
    return 0;
}

/** Сортировка руки: масть, затем номинал. */
export function sortHand(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => a.suit - b.suit || a.value - b.value);
}
