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

    /**
     * Игрок завершил выбор. Игроки остаются framework-active до раскрытия —
     * это позволяет отменить передачу (actCancelPassCards). Переход в
     * ResolvePasses происходит, когда pass_done покрывает всех игроков.
     */
    #[PossibleAction]
    public function actPassCards(#[IntArrayParam] array $cardIds, int $currentPlayerId, array $args)
    {
        $count = (int)$args['count'];
        $cardIds = array_map('intval', $cardIds);
        if (count($cardIds) !== $count || count(array_unique($cardIds)) !== $count) {
            throw new UserException(clienttranslate('Wrong number of cards'));
        }
        $done = $this->bga->globals->get('pass_done');
        if (in_array($currentPlayerId, $done, true)) {
            throw new UserException(clienttranslate('You have already passed cards'));
        }
        $hand = $this->game->getHand($currentPlayerId);
        foreach ($cardIds as $cardId) {
            if (!$hand->has($cardId)) {
                throw new UserException(clienttranslate('Not your card'));
            }
        }
        $recipient = $this->game->leftNeighbor($currentPlayerId);
        $this->game->cards->moveItems($cardIds, ['passed', $recipient]);
        $done[] = $currentPlayerId;
        $this->bga->globals->set('pass_done', $done);

        $this->notify->all('cardsPassed', clienttranslate('${player_name} passed ${count} card(s)'), [
            'player_id' => $currentPlayerId,
            'player_name' => $this->game->getPlayerNameById($currentPlayerId),
            'count' => $count,
        ]);

        if (count($done) >= count($this->game->playerIds())) {
            $this->gamestate->setAllPlayersNonMultiactive(ResolvePasses::class);
        }
    }

    /**
     * Отмена подтверждённой передачи до раскрытия: карты возвращаются в руку,
     * игрок исключается из pass_done и выбирает заново [H12].
     */
    #[PossibleAction]
    public function actCancelPassCards(int $currentPlayerId)
    {
        $done = $this->bga->globals->get('pass_done');
        if (!in_array($currentPlayerId, $done, true)) {
            throw new UserException(clienttranslate('You have no passed cards to take back'));
        }
        $recipient = $this->game->leftNeighbor($currentPlayerId);
        $passed = $this->game->cards->getItemsInLocation(['passed', $recipient]);
        $this->game->cards->moveItems($passed, ['hand', $currentPlayerId]);
        $this->bga->globals->set('pass_done', array_values(array_diff($done, [$currentPlayerId])));

        $this->notify->all('passCancelled', clienttranslate('${player_name} takes back the passed card(s)'), [
            'player_id' => $currentPlayerId,
            'player_name' => $this->game->getPlayerNameById($currentPlayerId),
        ]);
    }

    public function zombie(int $playerId)
    {
        $count = (int)$this->bga->globals->get('pass_count');
        $done = $this->bga->globals->get('pass_done');
        if (in_array($playerId, $done, true)) {
            return; // карты уже переданы
        }
        $hand = $this->game->getHand($playerId);
        $ids = array_map('intval', array_keys($hand->all()));
        $chosen = [];
        for ($i = 0; $i < $count && count($ids) > 0; $i++) {
            $idx = (int)bga_rand(0, count($ids) - 1);
            $chosen[] = $ids[$idx];
            array_splice($ids, $idx, 1);
        }
        $this->actPassCards($chosen, $playerId, ['count' => $count]);
    }
}
