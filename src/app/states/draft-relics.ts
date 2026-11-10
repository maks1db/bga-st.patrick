/**
 * Состояние DraftRelics: разбор реликвий — оверлей поверх игрового поля
 * с ларцом. Оверлей живёт между входами (следующий драфтер) и закрывается
 * при входе в любую другую фазу.
 */
import type { Game } from '../Game';
import type { DraftArgs } from '../../widgets/draft-overlay';

export class DraftRelics {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(args: DraftArgs, isCurrentPlayerActive: boolean): void {
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} must take relics or pass')
            : _('${actplayer} is taking relics or passing'));
        this.game.draftOverlay.open(args, isCurrentPlayerActive);
    }

    onLeavingState(): void { /* оверлей закрывается при входе в другую фазу */ }
}
