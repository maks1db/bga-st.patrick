/**
 * Состояние ReadyDraft: все получили карты после передачи и жмут
 * «To relic draft» в верхней панели. Когда нажмут все — сервер переводит
 * в DraftRelics. Подсветка полученных карт живёт только здесь: снимается
 * при выходе из состояния.
 */
import type { Game } from '../Game';

export class ReadyDraft {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(args: any, isCurrentPlayerActive: boolean): void {
        this.apply(args, isCurrentPlayerActive);
    }

    // MULTIPLE_ACTIVE_PLAYER: при reload флаги активности приходят ПОЗЖЕ
    // onEnteringState — кнопку показываем и здесь (идемпотентно)
    onUpdateActionButtons(args: any, isCurrentPlayerActive: boolean): void {
        this.apply(args, isCurrentPlayerActive);
    }

    private apply(args: any, isCurrentPlayerActive: boolean): void {
        this.game.draftOverlay.close();
        if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('You received new cards — press the button when ready'));
            if (!document.getElementById('stp-ready-draft')) {
                this.bga.statusBar.addActionButton(_('To relic draft'),
                    () => this.game.bga.actions.performAction('actReady'),
                    { id: 'stp-ready-draft' });
            }
        } else {
            this.bga.statusBar.setTitle(_('Other players are reviewing their new cards'));
        }
    }

    onLeavingState(args: any, isCurrentPlayerActive: boolean): void {
        document.getElementById('stp-ready-draft')?.remove();
        // в последующих фазах подсветка полученных карт не показывается
        document.querySelectorAll('.stp-received').forEach(el => el.classList.remove('stp-received'));
    }
}
