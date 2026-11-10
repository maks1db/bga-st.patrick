/**
 * Состояние PassCards: одновременная передача карт соседу слева.
 * Игроки остаются framework-active до раскрытия (сервер следит за глобалом
 * pass_done) — поэтому отмена возможна через обычное действие, а хук
 * активации не срабатывает при подтверждении: клиент сам переключает UI
 * в режим ожидания. Логика — в features/pass-cards.
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
            this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
            feature.showInfo(toId, null);
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
