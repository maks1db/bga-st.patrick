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
 * оставшиеся безвредные карты доигрываются автоматически — взятка за взяткой,
 * в порядке очереди (ведёт победитель предыдущей взятки) — затем охота
 * завершается и выполняется подсчёт.
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

        // Досрочный конец охоты [H16]: ни у одного игрока не осталось на руке
        // змеиных карт (наносящих укусы) — урон больше невозможен.
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

        if ($leftover === 0) {
            // Все карты сыграны — обычный конец охоты.
            return ScoreHunt::class;
        }

        $this->notify->all('huntEnded', clienttranslate('No snake cards remain in any hand — the remaining cards are played out automatically and the hunt ends'), []);

        // Автодоигровка остатка охоты: ведёт победитель только что разыгранной
        // взятки, дальше по часовой. Клиент анимирует стандартные уведомления
        // cardPlayed/trickWon — карты вылетают из рук в порядке очереди.
        $leader = $winnerId;
        while (true) {
            $plays = [];
            foreach ($this->playOrderFrom($leader) as $pid) {
                if ($this->game->getHand($pid)->count() === 0) {
                    continue;
                }
                $legal = $this->game->legalCardIds($pid);
                $card = $this->game->cards->getItemById($legal[0]);
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
            if (count($plays) === 0) {
                break;
            }
            $leader = $this->resolveTrick($plays);
        }

        return ScoreHunt::class;
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
