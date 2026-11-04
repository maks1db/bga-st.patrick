<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\DecidePassCount;
use Bga\Games\StPatrick\States\PassCards;

/**
 * Начало раунда: сбор карт, раздача, реликвии в центр, определение числа
 * передаваемых карт. См. RULES.md «1-я ФАЗА».
 */
class NewRound extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 2, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        $round = (int)$this->bga->globals->get('round') + 1;
        $this->bga->globals->set('round', $round);
        $this->bga->tableStats->inc('rounds_played', 1);

        foreach ($this->game->playerIds() as $pid) {
            $this->game->cards->moveAllItemsInLocation(['hand', $pid], 'deck');
            $this->game->cards->moveAllItemsInLocation(['trick', $pid], 'deck');
            $this->game->cards->moveAllItemsInLocation(['snakes', $pid], 'deck');
            $this->game->cards->moveAllItemsInLocation(['passed', $pid], 'deck');
        }
        $this->game->cards->moveAllItemsInLocation('discard', 'deck');
        $this->game->cards->shuffle('deck');
        $this->game->relics->moveAllItemsInLocation('held', 'center');

        $this->bga->globals->set('pass_cycles', 0);
        $this->bga->globals->set('special_hunt', false);
        $this->bga->globals->set('trick_plays', []);
        $this->bga->globals->set('passed_players', []);

        $this->notify->all('newRound', clienttranslate('Round ${round} begins'), ['round' => $round]);

        $handSize = intdiv(36, $this->game->getPlayersNumber());
        foreach ($this->game->playerIds() as $pid) {
            $this->game->cards->pickItems($handSize, 'deck', ['hand', $pid]);
        }
        $this->game->notifyHands();

        if ($round === 1) {
            $this->bga->globals->set('pass_count', 1);
            return PassCards::class;
        }

        // Игрок(и) с минимумом HP определяют число передаваемых карт [H8]
        $players = $this->game->getCollectionFromDb("SELECT `player_id`, `player_score` FROM `player`");
        $minHp = min(...array_map(fn($p) => (int)$p['player_score'], array_values($players)));
        $leaders = array_map('intval', array_keys(array_filter(
            $players,
            fn($p) => (int)$p['player_score'] === $minHp
        )));
        if (count($leaders) === 1) {
            $this->game->giveExtraTime($leaders[0]);
            $this->gamestate->changeActivePlayer($leaders[0]);
            return DecidePassCount::class;
        }
        $this->bga->globals->set('pass_count', 1);
        return PassCards::class;
    }
}
