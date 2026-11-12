<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\StPatrick\Game;

/**
 * Готовность к разбору реликвий: все получили карты после передачи и
 * подтверждают переход. Multiactive (активация — в ResolvePasses); ушедший
 * последним активным триггерит StartDraft. Часы идут только у не
 * нажавших.
 */
class ReadyDraft extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 13, type: StateType::MULTIPLE_ACTIVE_PLAYER);
    }

    public function onEnteringState(int $activePlayerId)
    {
        // активация всех игроков происходит в состоянии-источнике (ResolvePasses)
    }

    #[PossibleAction]
    public function actReady(int $currentPlayerId): void
    {
        $this->gamestate->setPlayerNonMultiactive($currentPlayerId, StartDraft::class);
    }

    public function zombie(int $playerId)
    {
        $this->actReady($playerId);
    }
}
