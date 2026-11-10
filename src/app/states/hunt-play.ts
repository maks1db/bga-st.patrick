/**
 * Состояние HuntPlay: охота на змей — выложить карту в взятку
 * (обязательный выход в масть).
 */
import { suitName } from '../../entities/card';
import type { Game } from '../Game';
import type { HuntPlayArgs } from '../../shared/types/gamedatas';

export class HuntPlay {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(args: HuntPlayArgs, isCurrentPlayerActive: boolean): void {
        this.game.draftOverlay.close();
        this.game.clearHandSelection();
        if (isCurrentPlayerActive) {
            const leadSuit = args.leadSuit === null || args.leadSuit === undefined ? null : parseInt(String(args.leadSuit), 10);
            const legal = this.game.legalHandCards(leadSuit);
            this.bga.statusBar.setTitle(leadSuit === null
                ? _('${you} must lead a trick — play any card')
                : _('${you} must follow the lead suit (${suit})').replace('${suit}', suitName(leadSuit)));
            this.game.setHandSelectable(legal, 1, true);
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} must play a card'));
        }
    }

    onLeavingState(args: HuntPlayArgs, isCurrentPlayerActive: boolean): void {
        this.game.clearHandSelection();
    }
}
