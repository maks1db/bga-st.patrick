<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\DraftRelics;
use Bga\Games\StPatrick\States\HuntPlay;

/**
 * Проклятие [H2-Б]: все потеряли HP = числу своих реликвий. Далее либо
 * особая охота [H5] (реликвии остаются у игроков, карты не передаются),
 * либо реликвии в центр, все карты — соседу слева, разбор заново.
 */
class ApplyCurse extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 8, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        $losses = [];
        foreach ($this->game->playerIds() as $pid) {
            $losses[$pid] = $this->game->relicCount($pid);
            if ($losses[$pid] > 0) {
                $this->bga->playerScore->inc($pid, -$losses[$pid]);
            }
        }
        $this->notify->all('curse', clienttranslate('The relics become a curse!'), [
            'losses' => $losses,
        ]);

        $cycles = (int)$this->bga->globals->get('pass_cycles') + 1;
        $this->bga->globals->set('pass_cycles', $cycles);

        if ($cycles >= $this->game->getPlayersNumber() - 1) {
            // Особая охота: игроки оставляют реликвии и последние карты [H5, H6]
            $this->bga->globals->set('special_hunt', true);
            $this->bga->globals->set('trick_plays', []);
            $this->notify->all('specialHunt', clienttranslate('All cards have been seen — special hunt begins!'), []);
            $this->gamestate->changeActivePlayer($this->game->findPatrickHolder());
            return HuntPlay::class;
        }

        $this->game->relics->moveAllItemsInLocation('held', 'center');
        $this->game->passAllHandsLeft();
        $this->bga->globals->set('passed_players', []);
        $this->notify->all('cardsRotated', clienttranslate('All cards are passed to the left'), []);
        $this->game->notifyHands('You received new cards');

        $this->gamestate->changeActivePlayer($this->game->findPatrickHolder());
        return DraftRelics::class;
    }
}
