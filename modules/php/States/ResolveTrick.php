<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Card;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\HuntPlay;
use Bga\Games\StPatrick\States\ScoreHunt;

/**
 * Розыгрыш взятки: старшая карта ведущей масти забирает взятку; змеиные карты
 * выкладываются лицом вверх перед победителем [H14], остальные — в сброс.
 * Последняя взятка: если у каждого игрока осталась ровно одна карта, взятка
 * разыгрывается автоматически, в порядке очереди (ведёт победитель
 * предыдущей взятки) — клиент анимирует стандартные уведомления.
 * Автодоигровка [H17]: если нашёлся игрок, неизбежно забирающий все
 * оставшиеся взятки, остаток раунда разыгрывается автоматически.
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

        // Автодоигровка [H17]: есть игрок, неизбежно забирающий все оставшиеся
        // взятки, — распределение карт предопределено, доигрываем раунд без кликов.
        $forcedWinner = $this->findForcedWinner($winnerId);
        if ($forcedWinner !== null) {
            $this->autoPlayRemaining($winnerId, $forcedWinner);
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
            $this->notify->all('cardPlayed', clienttranslate('${player_name} plays ${card_img} ${card_name}'), [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'card_name' => Game::cardLogName($card),
                'card_img' => Game::cardLogImg($card),
                'card' => $card,
            ]);
        }
        $this->resolveTrick($plays);
    }

    /**
     * Найти игрока, неизбежно забирающего все оставшиеся взятки [H17].
     *
     * Условие: (а) доминирование — во всех мастях, которые есть у P, любая
     * карта P строго выше любой карты этой масти у остальных; (б) P ведёт
     * текущую взятку либо ведущий держит только масти, есть и у P (иначе,
     * поведя «чужую» для P масть, он лишил бы P первой взятки). Тогда P
     * выигрывает каждую взятку при ЛЮБЫХ легальных ходах всех игроков:
     * чужой мастью взятку не выиграть, а своя у всех ниже. После каждой
     * взятки доминирование сохраняется (P снимает карту сверху диапазона,
     * остальные — карты снизу), по индукции P забирает все оставшиеся
     * карты, включая все змеиные. Значит, распределение предопределено и
     * автоматическая доигровка не меняет результат партии.
     *
     * @return int|null id игрока или null
     */
    private function findForcedWinner(int $leader): ?int
    {
        $players = $this->game->playerIds();
        $suits = []; // pid => [suit => list<int> значения]
        foreach ($players as $pid) {
            $suits[$pid] = [];
            foreach ($this->game->getHand($pid) as $card) {
                $suits[$pid][$card->suit][] = $card->value;
            }
        }

        foreach ($players as $p) {
            if (count($suits[$p]) === 0) {
                continue;
            }
            $dominant = true;
            foreach ($suits[$p] as $suit => $values) {
                $myMin = min($values);
                foreach ($players as $other) {
                    if ($other === $p) {
                        continue;
                    }
                    if (isset($suits[$other][$suit]) && max($suits[$other][$suit]) >= $myMin) {
                        $dominant = false;
                        break 2;
                    }
                }
            }
            if (!$dominant) {
                continue;
            }
            if ($p === $leader) {
                return $p;
            }
            // Ведёт другой: проверяем, что все его масти есть и у P.
            if (count(array_diff(array_keys($suits[$leader]), array_keys($suits[$p]))) === 0) {
                return $p;
            }
        }
        return null;
    }

    /**
     * Автоматическая доигровка остатка раунда [H17]: сервер разыгрывает
     * взятки одну за другой через стандартные cardPlayed/trickWon — клиент
     * анимирует штатным арсеналом. $forced заберёт все взятки при любых
     * легальных ходах, поэтому выбор конкретных карт на результат не влияет.
     * Первая взятку ведёт $leader (победитель предыдущей), далее ведёт $forced.
     */
    private function autoPlayRemaining(int $leader, int $forced): void
    {
        $this->notify->all('roundAutoplay', clienttranslate('${player_name} is bound to take all the remaining tricks — the round is played out automatically'), [
            'player_id' => $forced,
            'player_name' => $this->game->getPlayerNameById($forced),
        ]);

        while ($this->cardsLeft() > 0) {
            $plays = [];
            $leadSuit = null;
            foreach ($this->playOrderFrom($leader) as $pid) {
                $card = $this->autoPickCard($pid, $leadSuit);
                $this->game->cards->moveItem($card, ['trick', $pid]);
                $plays[] = ['playerId' => $pid, 'cardId' => $card->id];
                $this->bga->globals->set('trick_plays', $plays);
                if ($leadSuit === null) {
                    $leadSuit = $card->suit;
                }
                $this->notify->all('cardPlayed', clienttranslate('${player_name} plays ${card_img} ${card_name}'), [
                    'player_id' => $pid,
                    'player_name' => $this->game->getPlayerNameById($pid),
                    'card_name' => Game::cardLogName($card),
                    'card_img' => Game::cardLogImg($card),
                    'card' => $card,
                ]);
            }
            $leader = $this->resolveTrick($plays);
        }
    }

    /** Сколько карт осталось на руках всех игроков (суммарно). */
    private function cardsLeft(): int
    {
        $left = 0;
        foreach ($this->game->playerIds() as $pid) {
            $left += $this->game->getHand($pid)->count();
        }
        return $left;
    }

    /**
     * Карта для автодоигровки [H17]: младшая карта ведомой масти, а при
     * отсутствии масти — просто младшая карта на руке. Такой ход всегда
     * легален и не влияет на предопределённый результат.
     */
    private function autoPickCard(int $pid, ?int $leadSuit): Card
    {
        $candidates = [];
        foreach ($this->game->getHand($pid) as $card) {
            if ($leadSuit === null || $card->suit === $leadSuit) {
                $candidates[] = $card;
            }
        }
        if (count($candidates) === 0) {
            foreach ($this->game->getHand($pid) as $card) {
                $candidates[] = $card;
            }
        }
        usort($candidates, fn(Card $a, Card $b) => $a->value <=> $b->value ?: $a->suit <=> $b->suit);
        return $candidates[0];
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
