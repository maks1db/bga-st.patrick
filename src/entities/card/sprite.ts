/**
 * Карта: размеры, спрайт, отрисовка лицевой стороны.
 *
 * Размер карт: на узких экранах — уменьшенный. ДУБЛИРУЕТСЯ media query в
 * scss/entities/_card.scss ($bp-mobile)! Менять в обоих местах.
 */
import { SUIT_KEYS, cardBites } from './model';

export const CARD_W = window.innerWidth < 640 ? 72 : 102;
export const CARD_H = window.innerWidth < 640 ? 99 : 141;

// ряд масти в img/main-sprite.png (ячейка 136×188, порядок колонок — значение 1–9)
export const SUIT_SPRITE_ROW: Record<number, number> = { 1: 0, 3: 1, 4: 2, 2: 3 };

export function suitName(suit: number): string {
    return _(SUIT_KEYS[suit]);
}

/** Лицевая сторона: позиция ячейки спрайта — через CSS-переменные
 *  (--bp-x/--bp-y, см. .stp-card-front), плюс подсказка с укусами. */
export function setupCardFront(card: { suit: number; value: number }, div: HTMLElement): void {
    const row = SUIT_SPRITE_ROW[card.suit];
    div.style.setProperty('--bp-x', `${(card.value - 1) * CARD_W}px`);
    div.style.setProperty('--bp-y', `${row * CARD_H}px`);
    const bites = cardBites(card);
    div.title = `${suitName(card.suit)} ${card.value}${bites > 0 ? ` — ${bites} ${_('bite(s)')}` : ''}`;
}
