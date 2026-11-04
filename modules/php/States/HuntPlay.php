<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\NextHunter;
use Bga\Games\StPatrick\States\ResolveTrick;

/**
 * Розыгрыш карты в текущую взятку. Обязательный выход в масть первой карты.
 */
class HuntPlay extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 9, type: StateType::ACTIVE_PLAYER);
    }

    public function getArgs(): array
    {
        /** @var array<int, array{playerId: int, cardId: int}> $plays */
        $plays = $this->bga->globals->get('trick_plays');
        $leadSuit = null;
        if (count($plays) > 0) {
            $leadCard = $this->game->cards->getItemById($plays[0]['cardId']);
            $leadSuit = $leadCard->suit;
        }
        return ['leadSuit' => $leadSuit];
    }

    #[PossibleAction]
    public function actPlayCard(int $cardId, int $activePlayerId, array $args): string
    {
        $legal = $this->game->legalCardIds($activePlayerId);
        if (!in_array($cardId, $legal, true)) {
            throw new UserException(clienttranslate('You cannot play this card'));
        }
        $card = $this->game->cards->getItemById($cardId);
        $this->game->cards->moveItem($card, ['trick', $activePlayerId]);

        /** @var array<int, array{playerId: int, cardId: int}> $plays */
        $plays = $this->bga->globals->get('trick_plays');
        $plays[] = ['playerId' => $activePlayerId, 'cardId' => $cardId];
        $this->bga->globals->set('trick_plays', $plays);

        $this->notify->all('cardPlayed', clienttranslate('${player_name} plays a card'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'card' => $card,
        ]);

        if (count($plays) >= $this->game->getPlayersNumber()) {
            return ResolveTrick::class;
        }
        return NextHunter::class;
    }

    public function zombie(int $playerId): string
    {
        $legal = $this->game->legalCardIds($playerId);
        return $this->actPlayCard($this->getRandomZombieChoice($legal), $playerId, []);
    }
}
