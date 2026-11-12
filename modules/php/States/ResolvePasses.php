<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\DraftRelics;

/**
 * Раскрытие одновременной передачи: карты из 'passed' попадают в руки
 * получателей, далее — ReadyDraft: все подтверждают готовность, и разбор
 * реликвий начинает держатель Патрика (через StartDraft).
 */
class ResolvePasses extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 5, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        foreach ($this->game->playerIds() as $pid) {
            $received = $this->game->cards->getItemsInLocation(['passed', $pid]);
            if (!$received->isEmpty()) {
                $this->game->cards->moveItems($received, ['hand', $pid]);
            }
        }
        // highlight: клиент выделяет красным карты, полученные от соседа
        $this->game->notifyHands('You received new cards', true);

        $this->gamestate->setAllPlayersMultiactive();
        return ReadyDraft::class;
    }
}
