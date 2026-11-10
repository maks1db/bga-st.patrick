/** Public API среза «карта» (entities layer). */
export { SUIT_CLOVER, SUIT_CROSS, SUIT_HARP, SUIT_SNAKE, SUIT_KEYS, cardBites, sortHand } from './model';
export type { Card } from './model';
export { CARD_W, CARD_H, SUIT_SPRITE_ROW, suitName, setupCardFront } from './sprite';

import type { RawCard } from '../../shared/types/gamedatas';
import type { Card } from './model';

/** Карта как приходит с сервера (см. shared/types/gamedatas). */
export type { RawCard };

/** Нормализация серверной карты в клиентское представление. */
export function normalizeCard(card: RawCard): Card {
    return {
        id: parseInt(String(card.id), 10),
        suit: parseInt(String(card.suit), 10),
        value: parseInt(String(card.value), 10),
        location: card.location,
        locationArg: card.locationArg === null || card.locationArg === undefined ? null : parseInt(String(card.locationArg), 10),
    };
}
