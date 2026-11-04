<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\HuntPlay;

/**
 * Передача хода следующему игроку по часовой внутри текущей взятки.
 */
class NextHunter extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 10, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        $next = (int)$this->game->getPlayerAfter($activePlayerId);
        $this->game->giveExtraTime($next);
        $this->gamestate->changeActivePlayer($next);
        return HuntPlay::class;
    }
}
