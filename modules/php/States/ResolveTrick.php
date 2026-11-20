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
 * Последняя взятка: если у каждого игрока осталась ровно одна карта, взятка
 * разыгрывается автоматически, в порядке очереди (ведёт победитель
 * предыдущей взятки) — клиент анимирует стандартные уведомления.
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
        $winnerId = $this->resolveTrick($plays);

        // Подсчёт оставшихся на руках карт: есть ли ещё змеиные [H16] и
        // сколько всего карт (последняя взятка = ровно одна у каждого).
        $bitingLeft = false;
        $cardsLeft = 0;
        foreach ($this->game->playerIds() as $pid) {
            $hand = $this->game->getHand($pid);
            $cardsLeft += $hand->count();
            foreach ($hand as $card) {
                if (Game::cardBites($card) > 0) {
                    $bitingLeft = true;
                }
            }
        }

        // Досрочный конец охоты [H16]: ни у одного игрока не осталось на руке
        // змеиных карт (наносящих укусы) — оставшиеся карты сбрасываются,
        // охота завершается и выполняется подсчёт.
        if (!$bitingLeft) {
            if ($cardsLeft > 0) {
                foreach ($this->game->playerIds() as $pid) {
                    $this->game->cards->moveAllItemsInLocation(['hand', $pid], 'discard');
                }
                $this->notify->all('huntEnded', clienttranslate('No snake cards remain in any hand — the remaining cards are discarded and the hunt ends'), []);
            }
            return ScoreHunt::class;
        }

        // Последняя взятка охоты: у каждого игрока ровно одна карта —
        // разыгрываем её автоматически в порядке очереди, без кликов.
        if ($cardsLeft === $this->game->getPlayersNumber()) {
            $this->autoPlayLastTrick($winnerId);
            return ScoreHunt::class;
        }

        $this->gamestate->changeActivePlayer($winnerId);
        return HuntPlay::class;
    }

    /**
     * Автоматический розыгрыш последней взятки: по одной карте у каждого
     * игрока, сервер играет их по очереди, начиная с $leader, через
     * стандартные уведомления cardPlayed — клиент анимирует полёт из рук.
     */
    private function autoPlayLastTrick(int $leader): void
    {
        $plays = [];
        foreach ($this->playOrderFrom($leader) as $pid) {
            $card = $this->game->getHand($pid)->first();
            $this->game->cards->moveItem($card, ['trick', $pid]);
            $plays[] = ['playerId' => $pid, 'cardId' => $card->id];
            $this->bga->globals->set('trick_plays', $plays);
            $this->notify->all('cardPlayed', clienttranslate('${player_name} plays ${card_name}'), [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'card_name' => Game::cardLogName($card),
                'card' => $card,
            ]);
        }
        $this->resolveTrick($plays);
    }

    /**
     * Разрешить взятку по записям trick_plays: перенести карты (змеиные — к
     * победителю [H14], остальные — в сброс), уведомить клиенты, очистить
     * trick_plays. Возвращает id победителя.
     *
     * @param array<int, array{playerId: int, cardId: int}> $plays
     */
    private function resolveTrick(array $plays): int
    {
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
        return $winnerId;
    }

    /** @return int[] порядок розыгрыша, начиная с $leader, по часовой стрелке. */
    private function playOrderFrom(int $leader): array
    {
        $ids = $this->game->playerIds();
        $start = (int)array_search($leader, $ids, true);
        return array_merge(array_slice($ids, $start), array_slice($ids, 0, $start));
    }
}
