<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\StPatrick\Game;

/**
 * Разбор реликвий [H1, H2]: активный игрок берёт 1..N реликвий из центра
 * или пасует (пас не исключает из последующего разбора).
 */
class DraftRelics extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 6, type: StateType::ACTIVE_PLAYER);
    }

    public function getArgs(): array
    {
        $relics = [];
        foreach ($this->game->playerIds() as $pid) {
            $relics[$pid] = $this->game->relicCount($pid);
        }
        return [
            'center' => $this->game->centerRelicCount(),
            'passed' => $this->bga->globals->get('passed_players'),
            'relics' => $relics,
        ];
    }

    #[PossibleAction]
    public function actTakeRelics(int $count, int $activePlayerId, array $args): string
    {
        $center = (int)$args['center'];
        if ($count < 1 || $count > $center) {
            throw new UserException(clienttranslate('Invalid number of relics'));
        }
        $this->game->relics->pickItems($count, 'center', ['held', $activePlayerId]);
        $this->bga->playerStats->inc('relics_taken', $count, $activePlayerId);

        $this->notify->all('relicsTaken', clienttranslate('${player_name} takes ${count} relic(s)'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'count' => $count,
            'center' => $this->game->centerRelicCount(),
            'player_relics' => $this->game->relicCount($activePlayerId),
        ]);

        return NextDrafter::class;
    }

    #[PossibleAction]
    public function actPassRelics(int $activePlayerId): string
    {
        $passed = $this->bga->globals->get('passed_players');
        if (!in_array($activePlayerId, $passed, true)) {
            $passed[] = $activePlayerId;
            $this->bga->globals->set('passed_players', $passed);
        }

        $this->notify->all('relicsPassed', clienttranslate('${player_name} passes'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'passed' => $passed,
        ]);

        return NextDrafter::class;
    }

    public function zombie(int $playerId): string
    {
        $center = $this->game->centerRelicCount();
        $choice = $this->getRandomZombieChoice($center > 0 ? ['pass', 'take'] : ['pass']);
        if ($choice === 'take') {
            return $this->actTakeRelics((int)bga_rand(1, min(3, $center)), $playerId, ['center' => $center]);
        }
        return $this->actPassRelics($playerId);
    }
}
