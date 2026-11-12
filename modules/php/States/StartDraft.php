<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;

/**
 * Переход из ReadyDraft (все нажали «К разбору реликвий») в DraftRelics:
 * разбор начинает держатель Патрика.
 */
class StartDraft extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 14, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        $this->gamestate->changeActivePlayer($this->game->findPatrickHolder());
        return DraftRelics::class;
    }
}
