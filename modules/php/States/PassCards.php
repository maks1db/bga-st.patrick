<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\Actions\Types\IntArrayParam;
use Bga\GameFramework\Actions\CheckAction;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\ResolvePasses;

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
     * Игрок завершил выбор. Пасанувший сразу становится non-multiactive —
     * его часы останавливаются, пока остальные выбирают. Отмена возможна
     * в любой момент до раскрытия: actCancelPassCards в Game.php (действие
     * «в любое время», клиент шлёт с checkAction:false) возвращает игрока
     * в активный набор. Когда уходит последний активный, фреймворк сам
     * переводит в ResolvePasses.
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

        $this->gamestate->setPlayerNonMultiactive($currentPlayerId, ResolvePasses::class);
    }

    /**
     * Отмена подтверждённой передачи до раскрытия [H12]. Пасанувший уже
     * non-multiactive (часы остановлены, см. actPassCards), поэтому
     * действие разрешено вне активности: `#[CheckAction(false)]` снимает
     * серверную проверку активности — вместо неё checkPossibleAction
     * (действие возможно только в PassCards) и собственные проверки.
     * Клиент шлёт вызов с checkAction:false. Карты возвращаются в руку,
     * игрок снова активируется (часы идут, можно перепасовать).
     */
    #[PossibleAction]
    #[CheckAction(false)]
    public function actCancelPassCards(int $currentPlayerId): void
    {
        $this->gamestate->checkPossibleAction('actCancelPassCards');
        $done = $this->bga->globals->get('pass_done');
        if (!in_array($currentPlayerId, $done, true)) {
            throw new UserException(clienttranslate('You have no passed cards to take back'));
        }
        $recipient = $this->game->leftNeighbor($currentPlayerId);
        $passed = $this->game->cards->getItemsInLocation(['passed', $recipient]);
        $this->game->cards->moveItems($passed, ['hand', $currentPlayerId]);
        $this->bga->globals->set('pass_done', array_values(array_diff($done, [$currentPlayerId])));
        $this->gamestate->setPlayersMultiactive([$currentPlayerId], PassCards::class, false);

        $this->notify->all('passCancelled', clienttranslate('${player_name} takes back the passed card(s)'), [
            'player_id' => $currentPlayerId,
            'player_name' => $this->game->getPlayerNameById($currentPlayerId),
        ]);
    }

    /**
     * Отмена подтверждённой передачи до раскрытия [H12] — реализация выше
     * (actCancelPassCards с #[CheckAction(false)]).
     */

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
