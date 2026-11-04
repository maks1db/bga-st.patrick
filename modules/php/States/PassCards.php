<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\Actions\Types\IntArrayParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\StPatrick\Game;

/**
 * Одновременная передача карт соседям слева [H12]. Каждый игрок выбирает
 * pass_count карт; раскрытие происходит одновременно (ResolvePasses).
 */
class PassCards extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 4, type: StateType::MULTIPLE_ACTIVE_PLAYER);
    }

    public function onEnteringState(int $activePlayerId)
    {
        // активация всех игроков происходит в состоянии-источнике (NewRound / DecidePassCount)
    }

    public function getArgs(): array
    {
        return ['count' => (int)$this->bga->globals->get('pass_count')];
    }

    #[PossibleAction]
    public function actPassCards(#[IntArrayParam] array $cardIds, int $currentPlayerId, array $args): string
    {
        $count = (int)$args['count'];
        $cardIds = array_map('intval', $cardIds);
        if (count($cardIds) !== $count || count(array_unique($cardIds)) !== $count) {
            throw new UserException(clienttranslate('Wrong number of cards'));
        }
        $hand = $this->game->getHand($currentPlayerId);
        foreach ($cardIds as $cardId) {
            if (!$hand->has($cardId)) {
                throw new UserException(clienttranslate('Not your card'));
            }
        }
        $recipient = $this->game->leftNeighbor($currentPlayerId);
        $this->game->cards->moveItems($cardIds, ['passed', $recipient]);

        $this->notify->all('cardsPassed', clienttranslate('${player_name} passed ${count} card(s)'), [
            'player_id' => $currentPlayerId,
            'player_name' => $this->game->getPlayerNameById($currentPlayerId),
            'count' => $count,
        ]);

        return ResolvePasses::class;
    }

    public function zombie(int $playerId): string
    {
        $count = (int)$this->bga->globals->get('pass_count');
        $hand = $this->game->getHand($playerId);
        $ids = array_map('intval', array_keys($hand->all()));
        $chosen = [];
        for ($i = 0; $i < $count && count($ids) > 0; $i++) {
            $idx = (int)bga_rand(0, count($ids) - 1);
            $chosen[] = $ids[$idx];
            array_splice($ids, $idx, 1);
        }
        return $this->actPassCards($chosen, $playerId, ['count' => $count]);
    }
}
