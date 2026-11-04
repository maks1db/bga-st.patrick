<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;

/**
 * Очки жизни уже ведутся в player_score — здесь только переход к концу игры.
 */
class EndScore extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 98, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        return 99;
    }
}
