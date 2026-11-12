/**
 * Состояние PassCards: одновременная передача карт соседу слева.
 * Пасанувший сразу non-multiactive (часы стоп) — отмена через anytime-
 * действие Game::actCancelPassCards (checkAction:false), которое возвращает
 * игрока в активный набор; хук активации идемпотентно восстанавливает UI.
 * Логика — в features/pass-cards.
 */
import type { Game } from '../Game';

export class PassCards {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(args: any, isCurrentPlayerActive: boolean): void {
        this.game.draftOverlay.close();
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onPlayerActivationChange(args: any, isCurrentPlayerActive: boolean): void {
        // идемпотентно: хуки multiactive могут дублироваться
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.clearHandSelection();
        const count = parseInt(args.count, 10);
        const toId = this.game.leftNeighborId(this.bga.players.getCurrentPlayerId());
        const feature = this.game.passCardsFeature;
        if (!isCurrentPlayerActive) {
            if (feature.cards.length > 0) {
                // уже подтвердил пас (в т.ч. после reload) — неактивен, часы
                // остановлены; Cancel остаётся доступным
                feature.ack = true; // карты из gamedatas.passed — пас уже на сервере
                feature.showWaiting(toId);
            } else {
                this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
                feature.showInfo(toId, null);
            }
        } else if (feature.cards.length > 0) {
            feature.ack = true; // карты из gamedatas.passed — пас уже на сервере
            feature.showWaiting(toId); // уже подтвердил (reload) — ждём раскрытия
        } else {
            feature.restore(); // отмена: карты возвращаются из зоны передачи в руку
            feature.showSelection(count, toId);
        }
    }

    onLeavingState(args: any, isCurrentPlayerActive: boolean): void {
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.passCardsFeature.removeInfo();
        this.game.clearHandSelection();
        this.game.passCardsFeature.discard(); // карты ушли получателям — зона больше не нужна
    }
}
