<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\HuntPlay;
use Bga\Games\StPatrick\States\ScoreHunt;

/**
 * Розыгрыш взятки: старшая карта ведущей масти забирает взятку; змеиные карты
 * выкладываются лицом вверх перед победителем [H14], остальные — в сброс.
 */
class ResolveTrick extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 11, type: StateType::GAME);
    }

    public function onEnteringState(int $activePlayerId)
    {
        /** @var array<int, array{playerId: int, cardId: int}> $plays */
        $plays = $this->bga->globals->get('trick_plays');
        $leadCard = $this->game->cards->getItemById($plays[0]['cardId']);

        $winnerId = 0;
        $winnerValue = 0;
        foreach ($plays as $play) {
            $card = $this->game->cards->getItemById($play['cardId']);
            if ($card->suit === $leadCard->suit && ($winnerId === 0 || $card->value > $winnerValue)) {
                $winnerId = $play['playerId'];
                $winnerValue = $card->value;
            }
        }

        $snakeCards = [];
        $discarded = 0;
        foreach ($plays as $play) {
            $card = $this->game->cards->getItemById($play['cardId']);
            if (Game::cardBites($card) > 0) {
                $this->game->cards->moveItem($card, ['snakes', $winnerId]);
                $snakeCards[] = $card;
            } else {
                $this->game->cards->moveItem($card, 'discard');
                $discarded++;
            }
        }
        $this->bga->playerStats->inc('tricks_won', 1, $winnerId);
        $this->game->giveExtraTime($winnerId);

        $this->notify->all('trickWon', clienttranslate('${player_name} wins the trick'), [
            'player_id' => $winnerId,
            'player_name' => $this->game->getPlayerNameById($winnerId),
            'snakeCards' => $snakeCards,
            'discarded' => $discarded,
        ]);

        $this->bga->globals->set('trick_plays', []);

        $cardsInHands = 0;
        foreach ($this->game->playerIds() as $pid) {
            $cardsInHands += $this->game->getHand($pid)->count();
        }
        if ($cardsInHands === 0) {
            return ScoreHunt::class;
        }

        $this->gamestate->changeActivePlayer($winnerId);
        return HuntPlay::class;
    }
}
