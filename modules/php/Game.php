<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * StPatrick implementation : © Maksim <maxim@bga>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * Game.php — main game logic for «Охота на змей» (St Patrick).
 *
 * Rules reference: doc/RULES.md — assumptions: doc/ASSUMPTIONS.md [Hx].
 */
declare(strict_types=1);

namespace Bga\Games\StPatrick;

use Bga\Games\StPatrick\States\NewRound;
use Bga\GameFramework\Components\ItemManager\ItemLocation;
use Bga\GameFramework\Components\ItemManager\ItemManager;
use Bga\GameFramework\Helpers\Collection;

class Game extends \Bga\GameFramework\Table
{
    public const SUIT_CLOVER = 1; // клевер (зелёные)
    public const SUIT_CROSS = 2;  // крест (белые)
    public const SUIT_HARP = 3;   // арфа (оранжевые)
    public const SUIT_SNAKE = 4;  // змея (чёрные)
    public const SUITS = [self::SUIT_CLOVER, self::SUIT_CROSS, self::SUIT_HARP, self::SUIT_SNAKE];

    public const CARD_MIN = 1;
    public const CARD_MAX = 9;

    public const START_HP = 20;
    public const RELIC_COUNT = 15;
    public const SNAKE_BITES = 1;
    public const BONUS_CARD_BITES = 3; // 7 креста и 7 арфы [H13]
    public const TOTAL_BITES = 15;     // для самопожертвования [H15]
    public const SACRIFICE_PENALTY = 3;

    /** @var ItemManager<Card> */
    public ItemManager $cards;

    /** @var ItemManager<Relic> */
    public ItemManager $relics;

    public function __construct()
    {
        parent::__construct();

        $this->cards = $this->bga->itemManagerFactory->createItemManager(Card::class, locations: [
            new ItemLocation('deck'),
            new ItemLocation('hand'),    // [hand, playerId]
            new ItemLocation('passed'),  // [passed, recipientPlayerId] — выбранные для передачи (взакрытую)
            new ItemLocation('trick'),   // [trick, playerId]
            new ItemLocation('snakes'),  // [snakes, playerId] — лицом вверх, публично [H14]
            new ItemLocation('discard'),
        ]);
        $this->relics = $this->bga->itemManagerFactory->createItemManager(Relic::class, locations: [
            new ItemLocation('center'),
            new ItemLocation('held'),    // [held, playerId]
        ]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** @return int[] clockwise player ids */
    public function playerIds(): array
    {
        $table = $this->getNextPlayerTable(); // [0 => first player, pid => next pid]
        unset($table[0]);
        return array_map('intval', array_keys($table));
    }

    /** Сосед слева = следующий по часовой стрелке [H9]. */
    public function leftNeighbor(int $playerId): int
    {
        return (int)$this->getPlayerAfter($playerId);
    }

    public static function cardBites(Card $card): int
    {
        if ($card->suit === self::SUIT_SNAKE) {
            return self::SNAKE_BITES;
        }
        if ($card->value === 7 && ($card->suit === self::SUIT_CROSS || $card->suit === self::SUIT_HARP)) {
            return self::BONUS_CARD_BITES;
        }
        return 0; // все клеверы (включая Патрика) и прочие карты безвредны [H11]
    }

    public static function isPatrick(Card $card): bool
    {
        return $card->suit === self::SUIT_CLOVER && $card->value === 7;
    }

    public static function suitName(int $suit): string
    {
        return clienttranslate([
            self::SUIT_CLOVER => 'Clover',
            self::SUIT_CROSS => 'Cross',
            self::SUIT_HARP => 'Harp',
            self::SUIT_SNAKE => 'Snake',
        ][$suit]);
    }

    /** Описание карты для журнала: «Snake 7», «Clover 1 (St Patrick)». */
    public static function cardLogName(Card $card): string
    {
        $name = self::suitName($card->suit) . ' ' . $card->value;
        if (self::isPatrick($card)) {
            $name .= ' (' . clienttranslate('St Patrick') . ')';
        }
        return $name;
    }

    public function findPatrickHolder(): int
    {
        $patrick = $this->cards->getItemsByFieldNames(['suit' => self::SUIT_CLOVER, 'value' => 7])->first();
        return (int)$patrick->locationArg;
    }

    /** @return Collection<Card> */
    public function getHand(int $playerId): Collection
    {
        return $this->cards->getItemsInLocation(['hand', $playerId]);
    }

    public function relicCount(int $playerId): int
    {
        return $this->relics->countItemsInLocation(['held', $playerId]);
    }

    public function centerRelicCount(): int
    {
        return $this->relics->countItemsInLocation('center');
    }

    /** Сумма укусов на открытых змеиных картах игрока. */
    public function bitesOf(int $playerId): int
    {
        $total = 0;
        foreach ($this->cards->getItemsInLocation(['snakes', $playerId]) as $card) {
            $total += self::cardBites($card);
        }
        return $total;
    }

    /** Карты, которые игрок может сейчас выложить в текущую взятку. */
    public function legalCardIds(int $playerId): array
    {
        $hand = $this->getHand($playerId);
        /** @var array<int, array{playerId: int, cardId: int}> $plays */
        $plays = $this->bga->globals->get('trick_plays');
        if (count($plays) === 0) {
            return array_map('intval', array_keys($hand->all()));
        }
        $leadCard = $this->cards->getItemById($plays[0]['cardId']);
        $leadSuit = $leadCard->suit;
        $follow = $hand->filter(fn(Card $c) => $c->suit === $leadSuit);
        if (!$follow->isEmpty()) {
            return array_map('intval', array_keys($follow->all()));
        }
        return array_map('intval', array_keys($hand->all()));
    }

    /** Передать все карты всех игроков соседу слева (после проклятия). */
    public function passAllHandsLeft(): void
    {
        $hands = [];
        foreach ($this->playerIds() as $pid) {
            $hands[$pid] = $this->getHand($pid);
        }
        foreach ($hands as $pid => $cards) {
            $this->cards->moveItems($cards, ['hand', $this->leftNeighbor($pid)]);
        }
    }

    /** Разослать каждому игроку его полную руку (приватное уведомление). */
    public function notifyHands(string $message = 'You received cards'): void
    {
        foreach ($this->playerIds() as $pid) {
            $this->bga->notify->player($pid, 'newHand', clienttranslate($message), [
                'hand' => $this->getHand($pid)->values(),
            ]);
        }
    }

    // -------------------------------------------------------------------------
    // Framework entry points
    // -------------------------------------------------------------------------

    public function getGameProgression(): int
    {
        $players = $this->getCollectionFromDb("SELECT `player_id`, `player_score` FROM `player`");
        $maxHp = max(array_map('intval', array_column($players, 'player_score')));
        return max(0, min(100, 100 - 5 * $maxHp)); // 20 HP => 0, 0 HP => 100
    }

    public function upgradeTableDb($from_version)
    {
    }

    public function getAllDatas(int $currentPlayerId): array
    {
        $result = [];

        $result['players'] = $this->getCollectionFromDb(
            "SELECT `player_id` AS `id`, `player_name` AS `name`, `player_color` AS `color`, `player_score` AS `score` FROM `player`"
        );

        $relics = [];
        foreach ($this->playerIds() as $pid) {
            $relics[$pid] = $this->relicCount($pid);
        }
        $result['relics'] = $relics; // [pid => relic count], публично
        $result['relicsCenter'] = $this->centerRelicCount();

        // Публичные зоны
        $snakes = [];
        foreach ($this->playerIds() as $pid) {
            $snakes[$pid] = $this->cards->getItemsInLocation(['snakes', $pid])->values();
        }
        $result['snakes'] = $snakes;

        /** @var array<int, array{playerId: int, cardId: int}> $plays */
        $plays = $this->bga->globals->get('trick_plays');
        $trickCards = [];
        $trickPlayers = [];
        foreach ($plays as $play) {
            $card = $this->cards->getItemById($play['cardId']);
            if ($card !== null) {
                $trickCards[] = $card;
                $trickPlayers[$card->id] = $play['playerId'];
            }
        }
        $result['trick'] = $trickCards;
        $result['trickPlayers'] = $trickPlayers;

        // Приватная рука текущего игрока
        $result['hand'] = $currentPlayerId > 0 ? $this->getHand($currentPlayerId)->values() : [];

        // Приватные карты текущего игрока, ожидающие передачи ([passed, левый сосед])
        $result['passed'] = $currentPlayerId > 0
            ? $this->cards->getItemsInLocation(['passed', $this->leftNeighbor($currentPlayerId)])->values()
            : [];

        $result['round'] = (int)$this->bga->globals->get('round');
        $result['specialHunt'] = (bool)$this->bga->globals->get('special_hunt');

        return $result;
    }

    /**
     * @param array<int, array{player_name: string}> $players
     */
    protected function setupNewGame($players, $options = [])
    {
        $gameinfos = $this->getGameinfos();
        $colors = $gameinfos['player_colors'];
        $values = [];
        foreach ($players as $pid => $player) {
            $values[] = vsprintf("(%s, '%s', '%s')", [$pid, array_shift($colors), addslashes($player['player_name'])]);
        }
        $this->DbQuery("INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES " . implode(',', $values));
        $this->reattributeColorsBasedOnPreferences($players, $gameinfos['player_colors']);
        $this->reloadPlayersBasicInfos();

        // --- Компоненты ---
        $this->cards->initDb();
        $rows = [];
        foreach (self::SUITS as $suit) {
            for ($value = self::CARD_MIN; $value <= self::CARD_MAX; $value++) {
                $rows[] = ['location' => 'deck', 'suit' => $suit, 'value' => $value];
            }
        }
        $this->cards->createItems($rows);

        $this->relics->initDb();
        $relicRows = [];
        for ($i = 0; $i < self::RELIC_COUNT; $i++) {
            $relicRows[] = ['location' => 'center'];
        }
        $this->relics->createItems($relicRows);

        // --- Счёт и статистика ---
        $pids = array_map('intval', array_keys($players));
        foreach ($pids as $pid) {
            $this->bga->playerScore->set($pid, self::START_HP);
        }
        $this->bga->tableStats->init('rounds_played', 0);
        $this->bga->playerStats->init(['bites_taken', 'relics_taken', 'tricks_won'], 0);

        // --- Глобальные переменные ---
        $this->bga->globals->set('round', 0);
        $this->bga->globals->set('pass_count', 1);
        $this->bga->globals->set('pass_cycles', 0);
        $this->bga->globals->set('special_hunt', false);
        $this->bga->globals->set('trick_plays', []);
        $this->bga->globals->set('passed_players', []);

        $this->activeNextPlayer();

        return NewRound::class;
    }

    /**
     * Debug: jump to a state (Studio debug panel).
     */
    public function debug_goToState(int $state = 2)
    {
        $this->gamestate->jumpToState($state);
    }
}
