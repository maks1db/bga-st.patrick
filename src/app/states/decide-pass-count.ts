/**
 * Состояние DecidePassCount (раунды 2+): единственный игрок с минимумом HP
 * выбирает 0/1/2 — сколько карт все передадут.
 */
import type { Game } from '../Game';

export class DecidePassCount {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(args: any, isCurrentPlayerActive: boolean): void {
        this.game.draftOverlay.close();
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} decide how many cards everyone passes (0, 1 or 2)')
            : _('${actplayer} decides how many cards everyone passes'));
        if (isCurrentPlayerActive) {
            for (const n of [0, 1, 2]) {
                this.bga.statusBar.addActionButton(_('${n} card(s)').replace('${n}', String(n)),
                    () => this.bga.actions.performAction('actSetPassCount', { count: n }));
            }
        }
    }
}
