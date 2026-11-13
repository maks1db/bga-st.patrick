/**
 * Состояние PassCards: одновременная передача карт соседу слева по клику.
 * Клик по карте руки сразу отправляет её в игровую зону; пас завершён на
 * count-й карте — сервер делает игрока non-multiactive (часы стоп). Отмена:
 * клик по карте в зоне (одна) / кнопка Cancel (все) — оба действия с
 * #[CheckAction(false)], возвращают игрока в активный набор; хук активации
 * идемпотентно восстанавливает UI. Логика — в features/pass-cards.
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

    // MULTIPLE_ACTIVE_PLAYER: при reload флаги активности приходят ПОЗЖЕ
    // onEnteringState — активность-зависимый UI переключаем и здесь
    onUpdateActionButtons(args: any, isCurrentPlayerActive: boolean): void {
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onPlayerActivationChange(args: any, isCurrentPlayerActive: boolean): void {
        // идемпотентно: хуки multiactive могут дублироваться
        this.game.clearHandSelection();
        const count = parseInt(args.count, 10);
        const toId = this.game.leftNeighborId(this.bga.players.getCurrentPlayerId());
        const feature = this.game.passCardsFeature;
        const remaining = count - feature.cards.length;
        if (!isCurrentPlayerActive) {
            if (feature.cards.length > 0) {
                // пас завершён (в т.ч. после reload) — неактивен, часы
                // остановлены; Cancel остаётся доступным
                feature.showWaiting(toId);
            } else {
                this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
                feature.showInfo(toId, null);
            }
        } else if (remaining > 0) {
            // активен: продолжаем передачу — клик по карте руки отправляет её,
            // карты в зоне кликабельны для возврата (в т.ч. после reload)
            feature.showSelection(remaining, toId);
        } else {
            // гонка: сервер уже принял count карт, но флаг активности ещё не пришёл
            feature.showWaiting(toId);
        }
    }

    onLeavingState(args: any, isCurrentPlayerActive: boolean): void {
        this.game.passCardsFeature.removeInfo();
        this.game.clearHandSelection();
        this.game.passCardsFeature.discard(); // карты ушли получателям — зона больше не нужна
    }
}
