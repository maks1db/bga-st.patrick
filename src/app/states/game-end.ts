/**
 * Состояние gameEnd: снять оверлей драфта, если он остался.
 */
import type { Game } from '../Game';

export class GameEnd {
    private game: Game;
    private bga: any;

    constructor(game: Game, bga: any) {
        this.game = game;
        this.bga = bga;
    }

    onEnteringState(): void { this.game.draftOverlay.close(); }
    onLeavingState(): void { }
}
