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
 * Досрочный конец охоты [H16]: если ни у кого не осталось змеиных карт,
 * оставшиеся карты сбрасываются и охота завершается.
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
        $winnerCard = null;
        foreach ($plays as $play) {
            $card = $this->game->cards->getItemById($play['cardId']);
            if ($card->suit === $leadCard->suit && ($winnerId === 0 || $card->value > $winnerValue)) {
                $winnerId = $play['playerId'];
                $winnerValue = $card->value;
                $winnerCard = $card;
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
            'winnerCard' => $winnerCard, // выигравшая карта — для пульса на клиенте
            'snakeCards' => $snakeCards,
            'discarded' => $discarded,
        ]);

        $this->bga->globals->set('trick_plays', []);

        // Досрочный конец охоты [H16]: ни у одного игрока не осталось на руке
        // змеиных карт (наносящих укусы) — оставшиеся карты сбрасываются,
        // охота завершается и выполняется подсчёт.
        $leftover = 0;
        foreach ($this->game->playerIds() as $pid) {
            $hand = $this->game->getHand($pid);
            $leftover += $hand->count();
            foreach ($hand as $card) {
                if (Game::cardBites($card) > 0) {
                    $this->gamestate->changeActivePlayer($winnerId);
                    return HuntPlay::class;
                }
            }
        }

        if ($leftover > 0) {
            foreach ($this->game->playerIds() as $pid) {
                $this->game->cards->moveAllItemsInLocation(['hand', $pid], 'discard');
            }
            $this->notify->all('huntEnded', clienttranslate('No snake cards remain in any hand — the remaining cards are discarded and the hunt ends'), []);
        }

        return ScoreHunt::class;
    }
}
