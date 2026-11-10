/**
 * Типы gamedatos игры «Охота на змей» (St Patrick).
 * Поля сверх базового Gamedatas отдаёт серверный getAllDatas
 * (modules/php/Game.php) — держать в sync с ним.
 */

/** Карта как приходит с сервера (все поля строковые/сырые). */
export interface RawCard {
    id: number | string;
    suit: number | string;
    value: number | string;
    location: string;
    locationArg?: number | string | null;
}

/** Args состояния HuntPlay (args.leadSuit от сервера). */
export interface HuntPlayArgs {
    leadSuit?: number | string | null;
    [key: string]: unknown;
}

export interface StPatrickGamedatas extends Gamedatas<Player> {
    /** моя рука */
    hand: RawCard[];
    /** карты текущей взятки */
    trick: RawCard[];
    /** cardId => playerId — кто какую карту взятки сыграл (подписи) */
    trickPlayers?: Record<string, number | string>;
    /** мои подтверждённые карты передачи (приватно, после reload) */
    passed?: RawCard[];
    /** pid => открытые змеиные карты игрока */
    snakes: Record<string, RawCard[]>;
    /** pid => количество реликвий */
    relics: Record<string, number | string>;
}
