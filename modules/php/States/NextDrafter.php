<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\ApplyCurse;
use Bga\Games\StPatrick\States\DraftRelics;
use Bga\Games\StPatrick\States\HuntPlay;

/**
 * Переход к следующему разбирающему реликвии (по часовой). Конец разбора:
 * все реликвии взяты → ApplyCurse [H2-Б]; спасовали все, кроме одного →
 * охота [H2-А].
 */
class NextDrafter extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 7, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        if ($this->game->centerRelicCount() === 0) {
            return ApplyCurse::class;
        }
        $passed = $this->bga->globals->get('passed_players');
        if (count($passed) >= $this->game->getPlayersNumber() - 1) {
            $this->bga->globals->set('trick_plays', []);
            $this->gamestate->changeActivePlayer($this->game->findPatrickHolder());
            return HuntPlay::class;
        }
        $next = (int)$this->game->getPlayerAfter($activePlayerId);
        $this->game->giveExtraTime($next);
        $this->gamestate->changeActivePlayer($next);
        return DraftRelics::class;
    }
}
